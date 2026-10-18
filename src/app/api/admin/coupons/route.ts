// =============================================================
// /api/admin/coupons — Module 4 Abonnements : coupons marketplace
//
// GET    : liste des coupons (usage réel, statut, validité)
// POST   : création d'un coupon (code unique généré si absent)
// Chaque mutation est journalisée (audit).
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `HUB-${code}`;
}

export async function GET(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const status = req.nextUrl.searchParams.get('status') || '';
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [coupons, totalActive] = await Promise.all([
      db.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          merchant: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
          _count: { select: { scans: true } },
        },
      }),
      db.coupon.count({ where: { status: 'active' } }),
    ]);

    return NextResponse.json({
      stats: { active: totalActive, total: coupons.length },
      data: coupons.map((c) => ({
        id: c.id,
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxUses: c.maxUses,
        currentUses: c.currentUses,
        scans: c._count.scans,
        status: c.status,
        commissionRate: c.commissionRate,
        validFrom: c.validFrom?.toISOString() ?? null,
        validUntil: c.validUntil?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        merchantName: c.merchant?.name ?? '—',
        ownerEmail: c.user?.email ?? null,
      })),
    });
  } catch (error) {
    console.error('[GET /api/admin/coupons] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const body = (await req.json()) as {
      code?: string;
      discountType?: string;
      discountValue?: number;
      maxUses?: number;
      validUntil?: string | null;
      commissionRate?: number;
    };

    const discountType = ['percentage', 'fixed', 'bogof'].includes(body.discountType ?? '')
      ? (body.discountType as string)
      : 'percentage';
    const discountValue = Math.max(0, Number(body.discountValue) || 0);
    if (discountValue <= 0 && discountType !== 'bogof') {
      return NextResponse.json({ error: 'Valeur de réduction invalide' }, { status: 400 });
    }
    if (discountType === 'percentage' && discountValue > 100) {
      return NextResponse.json({ error: 'Un pourcentage ne peut pas dépasser 100' }, { status: 400 });
    }

    const code = (body.code || randomCode()).trim().toUpperCase();
    const exists = await db.coupon.findUnique({ where: { code }, select: { id: true } });
    if (exists) {
      return NextResponse.json({ error: `Le code ${code} existe déjà` }, { status: 409 });
    }

    // Un coupon marketplace appartient à un marchand + un porteur.
    // Créé depuis la console : porteur = le Superadmin lui-même.
    const adminUser = await db.user.findUnique({ where: { email: admin.email }, select: { id: true } });
    if (!adminUser) {
      return NextResponse.json({ error: 'Compte admin introuvable en base' }, { status: 500 });
    }

    const coupon = await db.coupon.create({
      data: {
        code,
        discountType,
        discountValue,
        maxUses: Math.max(1, Math.round(Number(body.maxUses) || 1)),
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        commissionRate: Math.max(0, Math.min(100, Number(body.commissionRate) || 5)),
        qrCodeData: code,
        // Porteur = le Superadmin (relation requise par le modèle)
        user: { connect: { id: adminUser.id } },
      },
    });

    await logAudit({
      actor: admin,
      action: 'coupon.create',
      entityType: 'coupon',
      entityId: coupon.id,
      details: { code, discountType, discountValue },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, coupon: { id: coupon.id, code: coupon.code } });
  } catch (error) {
    console.error('[POST /api/admin/coupons] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

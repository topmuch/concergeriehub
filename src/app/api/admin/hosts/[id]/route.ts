// =============================================================
// /api/admin/hosts/[id] — ÉTAPE 9
//
// GET   : détail d'un hôte + ses propriétés (biens, QR, plaques).
// PATCH : activer / désactiver le compte (isActive). Un compte
//         désactivé ne peut plus se connecter (bloqué côté auth).
//         Un superadmin ne peut pas être désactivé ici.
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const host = await db.user.findFirst({
      where: { id, role: 'user', providerProfile: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        selectedPlan: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!host) {
      return NextResponse.json({ error: 'Hôte introuvable' }, { status: 404 });
    }

    const properties = await db.property.findMany({
      where: { ownerId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        propertyType: true,
        address: true,
        latitude: true,
        longitude: true,
        isActive: true,
        createdAt: true,
        _count: { select: { qrCodes: true, plaqueQrCodes: true } },
        plaqueQrCodes: { select: { hubSlug: true, status: true }, take: 3 },
      },
    });

    return NextResponse.json({
      host: { ...host, createdAt: host.createdAt.toISOString() },
      properties: properties.map((p) => ({
        id: p.id,
        name: p.name,
        propertyType: p.propertyType,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
        qrCount: p._count.qrCodes,
        plaqueCount: p._count.plaqueQrCodes,
        hubSlugs: p.plaqueQrCodes.map((q) => q.hubSlug).filter((s): s is string => Boolean(s)),
      })),
    });
  } catch (error) {
    console.error('[GET /api/admin/hosts/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const { id } = await params;
    const body = (await req.json()) as { isActive?: boolean };

    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'Champ isActive (booléen) requis' }, { status: 400 });
    }

    // On ne touche que des comptes hôtes — jamais un autre superadmin
    const target = await db.user.findFirst({
      where: { id, role: 'user', providerProfile: null },
      select: { id: true, email: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'Hôte introuvable' }, { status: 404 });
    }

    await db.user.update({ where: { id: target.id }, data: { isActive: body.isActive } });

    return NextResponse.json({ ok: true, isActive: body.isActive });
  } catch (error) {
    console.error('[PATCH /api/admin/hosts/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

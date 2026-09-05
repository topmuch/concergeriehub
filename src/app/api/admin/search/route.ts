// =============================================================
// /api/admin/search — Recherche globale du header (Module Header)
// Recherche multi-entités réelle : utilisateurs, propriétés,
// prestataires, plaques physiques (activation/setup), lots.
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const [users, properties, providers, plaques, batches] = await Promise.all([
      db.user.findMany({
        where: {
          OR: [{ email: { contains: q } }, { fullName: { contains: q } }],
        },
        select: { id: true, email: true, fullName: true, role: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      db.property.findMany({
        where: { name: { contains: q } },
        select: { id: true, name: true, address: true, qrHubSlug: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      db.provider.findMany({
        where: {
          OR: [{ businessName: { contains: q } }, { location: { contains: q } }],
        },
        select: { id: true, businessName: true, category: true, location: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      db.physicalQrCode.findMany({
        where: {
          OR: [{ activationCode: { contains: q } }, { setupToken: { contains: q } }, { hubSlug: { contains: q } }],
        },
        select: { id: true, activationCode: true, setupToken: true, status: true, isClaimed: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      db.qrBatch.findMany({
        where: { OR: [{ id: { contains: q } }, { createdBy: { contains: q } }] },
        select: { id: true, quantity: true, createdAt: true },
        take: 4,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return NextResponse.json({
      results: [
        ...users.map((u) => ({
          type: 'user' as const,
          id: u.id,
          title: u.fullName || u.email,
          subtitle: u.email,
          href: `/admin/users?q=${encodeURIComponent(u.email)}`,
        })),
        ...properties.map((p) => ({
          type: 'property' as const,
          id: p.id,
          title: p.name,
          subtitle: p.address ?? 'Bien sans adresse',
          href: '/admin/users',
        })),
        ...providers.map((p) => ({
          type: 'provider' as const,
          id: p.id,
          title: p.businessName,
          subtitle: `${p.category}${p.location ? ' — ' + p.location : ''}`,
          href: '/admin/providers',
        })),
        ...plaques.map((p) => ({
          type: 'plaque' as const,
          id: p.id,
          title: p.activationCode,
          subtitle: `${p.setupToken ?? 'sans setup token'} — ${p.status}`,
          href: '/admin/qr?tab=plaques',
        })),
        ...batches.map((b) => ({
          type: 'batch' as const,
          id: b.id,
          title: `Lot ${b.id.slice(0, 10)}…`,
          subtitle: `${b.quantity} plaques`,
          href: '/admin/qr?tab=lots',
        })),
      ],
    });
  } catch (error) {
    console.error('[GET /api/admin/search] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

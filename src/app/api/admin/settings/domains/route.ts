// =============================================================
// /api/admin/settings/domains — Module 7 : domaines white-label
//
// GET : liste réelle des biens avec customDomain (statut vérifié),
//       + l'enregistrement TXT attendu pour la vérification.
// 🔒 Superadmin.
// =============================================================
import { NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const properties = await db.property.findMany({
      where: { customDomain: { not: null } },
      select: {
        id: true,
        name: true,
        customDomain: true,
        customDomainVerified: true,
        owner: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      domains: properties.map((p) => ({
        propertyId: p.id,
        propertyName: p.name,
        domain: p.customDomain,
        verified: p.customDomainVerified,
        ownerEmail: p.owner.email,
        // Enregistrement TXT attendu : preuve de possession du domaine
        txtRecord: { host: '_conciergerie-verify.' + (p.customDomain ?? ''), value: 'conciergerie-hub=' + p.id },
      })),
    });
  } catch (error) {
    console.error('[GET /api/admin/settings/domains] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

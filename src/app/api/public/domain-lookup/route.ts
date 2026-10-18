import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// =============================================================
// ÉTAPE 19 (V3) — WHITE-LABEL : résolution domaine → hub invité.
//   GET /api/public/domain-lookup?host=guests.ma-conciergerie.com
//     → { slug } si (et seulement si) le domaine est rattaché à un
//       bien ACTIF et VÉRIFIÉ — sinon 404.
// Appelé par le middleware (edge) pour réécrire la requête vers
// /app/hub/<slug>/guest en conservant l'URL du domaine custom.
// Cache 5 min (edge + client) : les domaines changent rarement.
// =============================================================

const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export async function GET(req: NextRequest) {
  try {
    const host = (new URL(req.url).searchParams.get('host') || '')
      .trim()
      .toLowerCase()
      .replace(/:\d+$/, '');
    if (!HOST_RE.test(host)) {
      return NextResponse.json({ error: 'Hôte invalide' }, { status: 400 });
    }

    const property = await db.property.findUnique({
      where: { customDomain: host },
      select: { qrHubSlug: true, isActive: true, customDomainVerified: true },
    });

    if (!property || !property.isActive || !property.customDomainVerified || !property.qrHubSlug) {
      return NextResponse.json(
        { error: 'Domaine non configuré' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { slug: property.qrHubSlug },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (error) {
    console.error('[public/domain-lookup GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessProperty } from '@/lib/b2b-server';
import { resolveCname } from 'node:dns/promises';

// =============================================================
// ÉTAPE 19 (V3) — WHITE-LABEL : vérification DNS du domaine custom.
//   POST /api/airbnb/branding/domain-verify?propertyId=…
//     → résout le CNAME de Property.customDomain et le compare à la
//       cible de la plateforme (NEXT_PUBLIC_APP_URL / NEXTAUTH_URL /
//       host de la requête). Succès → customDomainVerified = true.
//
// Le middleware ne réécrit QUE les domaines VERIFIED — un invité ne
// peut jamais atterrir sur un hub non réclamé via un domaine hijacké.
// IDs en QUERY PARAM (règle sandbox). Never-throw.
// =============================================================

function appHostname(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (envUrl) {
    try {
      return new URL(envUrl).hostname;
    } catch {
      /* env invalide → fallback header */
    }
  }
  return (req.headers.get('host') || 'localhost:3000').split(':')[0].toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const propertyId = (searchParams.get('propertyId') || '').trim();
    if (!propertyId) {
      return NextResponse.json({ error: 'Bien manquant' }, { status: 400 });
    }
    if (!(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { customDomain: true },
    });
    if (!property?.customDomain) {
      return NextResponse.json(
        { error: 'Aucun domaine personnalisé configuré pour ce bien.' },
        { status: 400 },
      );
    }

    const target = appHostname(req);
    try {
      const cnames = await resolveCname(property.customDomain);
      const match = cnames.some((c) => c.toLowerCase() === target.toLowerCase());
      if (!match) {
        return NextResponse.json(
          {
            verified: false,
            error: `CNAME trouvé (${cnames[0] ?? 'aucun'}) mais différent de la cible ${target}.`,
          },
          { status: 422 },
        );
      }
    } catch {
      return NextResponse.json(
        {
          verified: false,
          error:
            'CNAME introuvable pour le moment — recopiez l’enregistrement DNS chez votre registrar puis réessayez (la propagation peut prendre quelques heures).',
        },
        { status: 422 },
      );
    }

    await db.property.update({
      where: { id: propertyId },
      data: { customDomainVerified: true },
    });
    return NextResponse.json({ ok: true, verified: true, domain: property.customDomain });
  } catch (error) {
    console.error('[airbnb/branding/domain-verify POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

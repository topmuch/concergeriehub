import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessProperty, resolveUserProperties } from '@/lib/b2b-server';
import {
  isValidCustomDomain,
  isValidHexColor,
  normalizeCustomDomain,
  parseBranding,
} from '@/lib/branding';

// =============================================================
// ÉTAPE 19 (V3) — WHITE-LABEL : branding par bien.
//   GET   /api/airbnb/branding?propertyId=?
//     → biens accessibles + branding + customDomain + cible CNAME
//   PATCH /api/airbnb/branding?propertyId=?
//     { primaryColor?, welcomeMessage?, companyName?, logoUrl?,
//       customDomain? (null = retirer) }
//     → validation stricte (hex, longueurs, format domaine) ;
//       tout changement de domaine repasse customDomainVerified=false.
//
// Auth : session NextAuth + accès bien (owner ou membre accepté).
// IDs en QUERY PARAM (règle sandbox). Never-throw.
// =============================================================

const MAX_MESSAGE = 280;
const MAX_COMPANY = 60;

/** Hostname public de l'app = cible CNAME à recopier chez le registrar. */
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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const properties = await resolveUserProperties(userId);
    const { searchParams } = new URL(req.url);
    const requestedId = searchParams.get('propertyId');
    const property = requestedId
      ? properties.find((p) => p.id === requestedId) ?? properties[0]
      : properties[0];

    if (!property) {
      return NextResponse.json({ properties: [], property: null, branding: null });
    }
    if (!(await canAccessProperty(userId, property.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const full = await db.property.findUnique({
      where: { id: property.id },
      select: {
        branding: true,
        customDomain: true,
        customDomainVerified: true,
        qrHubSlug: true,
      },
    });

    return NextResponse.json({
      properties: properties.map((p) => ({ id: p.id, name: p.name })),
      property: { id: property.id, name: property.name, qrHubSlug: full?.qrHubSlug ?? null },
      branding: parseBranding(full?.branding),
      customDomain: full?.customDomain ?? null,
      customDomainVerified: full?.customDomainVerified ?? false,
      dnsTarget: appHostname(req),
    });
  } catch (error) {
    console.error('[airbnb/branding GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    const existing = await db.property.findUnique({
      where: { id: propertyId },
      select: { branding: true, customDomain: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }
    const current = parseBranding(existing.branding);

    // ── Champs optionnels — validation stricte ──
    let next = { ...current };
    if ('primaryColor' in body) {
      if (!isValidHexColor(body.primaryColor)) {
        return NextResponse.json({ error: 'Couleur invalide (format #RRGGBB attendu).' }, { status: 400 });
      }
      next.primaryColor = body.primaryColor as string;
    }
    if ('welcomeMessage' in body) {
      const msg = typeof body.welcomeMessage === 'string' ? body.welcomeMessage.trim() : '';
      if (msg.length > MAX_MESSAGE) {
        return NextResponse.json({ error: `Message trop long (${MAX_MESSAGE} caractères max).` }, { status: 400 });
      }
      next.welcomeMessage = msg || null;
    }
    if ('companyName' in body) {
      const name = typeof body.companyName === 'string' ? body.companyName.trim() : '';
      if (name.length > MAX_COMPANY) {
        return NextResponse.json({ error: `Nom commercial trop long (${MAX_COMPANY} caractères max).` }, { status: 400 });
      }
      next.companyName = name || null;
    }
    if ('logoUrl' in body) {
      // null → retrait du logo ; sinon uniquement un chemin d'upload branding.
      const logo = body.logoUrl;
      if (logo === null) {
        next.logoUrl = null;
      } else if (typeof logo === 'string' && logo.startsWith('/uploads/branding/')) {
        next.logoUrl = logo;
      } else {
        return NextResponse.json({ error: 'Chemin de logo invalide.' }, { status: 400 });
      }
    }

    // ── Domaine personnalisé ──
    let customDomain: string | null | undefined;
    let customDomainVerified: boolean | undefined;
    if ('customDomain' in body) {
      if (body.customDomain === null || body.customDomain === '') {
        customDomain = null;
        customDomainVerified = false;
      } else {
        const domain = normalizeCustomDomain(String(body.customDomain));
        if (!isValidCustomDomain(domain)) {
          return NextResponse.json(
            { error: 'Nom de domaine invalide. Exemple : guests.ma-conciergerie.com' },
            { status: 400 },
          );
        }
        if (domain === appHostname(req)) {
          return NextResponse.json(
            { error: 'Ce domaine est celui de la plateforme — choisissez un sous-domaine à vous.' },
            { status: 400 },
          );
        }
        if (existing.customDomain && existing.customDomain !== domain) {
          // Changement de domaine → nouvelle vérification DNS obligatoire.
          customDomainVerified = false;
        }
        customDomain = domain;
      }
    }

    const updated = await db.property.update({
      where: { id: propertyId },
      data: {
        branding: next,
        ...(customDomain !== undefined ? { customDomain } : {}),
        ...(customDomainVerified !== undefined ? { customDomainVerified } : {}),
      },
      select: { customDomain: true, customDomainVerified: true },
    });

    return NextResponse.json({
      ok: true,
      branding: next,
      customDomain: updated.customDomain,
      customDomainVerified: updated.customDomainVerified,
    });
  } catch (error) {
    // Conflit d'unicité : le domaine est déjà rattaché à un autre bien.
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Ce domaine est déjà rattaché à un autre bien.' },
        { status: 409 },
      );
    }
    console.error('[airbnb/branding PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessProperty } from '@/lib/b2b-server';
import { round2 } from '@/lib/orders';

// =============================================================
// ÉTAPE 17.5 (V3) — Catalogue fin par service côté HÔTE :
//   GET    /api/airbnb/service-offers?propertyId=<id>[&providerId=<id>]
//          → offres du bien (groupables par prestataire côté UI)
//   POST   /api/airbnb/service-offers?propertyId=<id>
//          { providerId, name, description?, unitPrice, unit? }
//          → crée une offre (prix = AUTORITÉ de facturation)
//   PATCH  /api/airbnb/service-offers?id=<offerId>
//          { name?, description?, unitPrice?, unit?, isActive? }
//   DELETE /api/airbnb/service-offers?id=<offerId>
//
// Auth : session NextAuth + accès bien (owner ou membre accepté).
// Le prestataire doit être GUEST_EXPERIENCE + actif (même règle que
// la commande invité). IDs en QUERY PARAM (règle sandbox). Never-throw.
// =============================================================

const MIN_PRICE = 0.01;
const MAX_PRICE = 10_000;

/** Valide et borne les champs éditables d'une offre. */
function validateOfferFields(body: Record<string, unknown>) {
  const out: {
    name?: string;
    description?: string | null;
    unitPrice?: number;
    unit?: string;
    isActive?: boolean;
  } = {};

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 80) return { error: 'Le nom de l\u2019offre doit contenir entre 1 et 80 caractères.' };
    out.name = name;
  }
  if ('description' in body) {
    if (body.description === null) out.description = null;
    else {
      const d = typeof body.description === 'string' ? body.description.trim() : '';
      if (d.length > 300) return { error: 'La description est trop longue (300 caractères max).' };
      out.description = d || null;
    }
  }
  if ('unitPrice' in body) {
    const p = body.unitPrice;
    if (typeof p !== 'number' || !Number.isFinite(p) || p < MIN_PRICE || p > MAX_PRICE) {
      return { error: `Le prix doit être compris entre ${MIN_PRICE} et ${MAX_PRICE} €.` };
    }
    out.unitPrice = round2(p);
  }
  if ('unit' in body) {
    const u = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : 'prestation';
    if (u.length > 30) return { error: 'L\u2019unité est trop longue (30 caractères max).' };
    out.unit = u;
  }
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') return { error: 'isActive doit être un booléen.' };
    out.isActive = body.isActive;
  }
  return { fields: out };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const { searchParams } = new URL(req.url);
    const propertyId = (searchParams.get('propertyId') || '').trim();
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId requis' }, { status: 400 });
    }
    if (!(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
    const providerId = (searchParams.get('providerId') || '').trim();

    const offers = await db.serviceOffer.findMany({
      where: {
        propertyId,
        ...(providerId ? { providerId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { unitPrice: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        providerId: true,
        name: true,
        description: true,
        unitPrice: true,
        unit: true,
        isActive: true,
        sortOrder: true,
        provider: { select: { businessName: true, category: true } },
      },
    });

    return NextResponse.json({ ok: true, offers });
  } catch (error) {
    console.error('[airbnb/service-offers GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { searchParams } = new URL(req.url);
    const propertyId = (searchParams.get('propertyId') || '').trim();
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId requis' }, { status: 400 });
    }
    if (!(await canAccessProperty(userId, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    // Le prestataire doit être GUEST_EXPERIENCE + actif (même règle que la commande invité)
    const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
    const provider = providerId
      ? await db.provider.findFirst({
          where: { id: providerId, isActive: true, audience: 'GUEST_EXPERIENCE' },
          select: { id: true },
        })
      : null;
    if (!provider) {
      return NextResponse.json(
        { error: 'Ce prestataire n\u2019est pas une expérience invité disponible.' },
        { status: 400 },
      );
    }

    const v = validateOfferFields(body);
    if ('error' in v && v.error) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    const fields = v.fields ?? {};
    if (!fields.name || fields.unitPrice === undefined) {
      return NextResponse.json({ error: 'Nom et prix de l\u2019offre requis.' }, { status: 400 });
    }

    try {
      const offer = await db.serviceOffer.create({
        data: {
          propertyId,
          providerId: provider.id,
          name: fields.name,
          description: fields.description ?? null,
          unitPrice: fields.unitPrice,
          unit: fields.unit ?? 'prestation',
        },
        select: { id: true, name: true, unitPrice: true },
      });
      return NextResponse.json({ ok: true, offer });
    } catch (e) {
      // P2002 : violation de l'unique (propertyId, providerId, name)
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002') {
        return NextResponse.json(
          { error: 'Une offre porte déjà ce nom pour ce prestataire dans ce bien.' },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error('[airbnb/service-offers POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { searchParams } = new URL(req.url);
    const offerId = (searchParams.get('id') || '').trim();
    if (!offerId) {
      return NextResponse.json({ error: 'Offre introuvable' }, { status: 400 });
    }

    const offer = await db.serviceOffer.findUnique({
      where: { id: offerId },
      select: { id: true, propertyId: true },
    });
    if (!offer) {
      return NextResponse.json({ error: 'Offre introuvable' }, { status: 404 });
    }
    if (!(await canAccessProperty(userId, offer.propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    const v = validateOfferFields(body);
    if ('error' in v && v.error) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    const fields = v.fields ?? {};
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 });
    }

    try {
      const updated = await db.serviceOffer.update({
        where: { id: offerId },
        data: fields,
        select: { id: true, name: true, unitPrice: true, unit: true, isActive: true },
      });
      return NextResponse.json({ ok: true, offer: updated });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002') {
        return NextResponse.json(
          { error: 'Une offre porte déjà ce nom pour ce prestataire dans ce bien.' },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error('[airbnb/service-offers PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const { searchParams } = new URL(req.url);
    const offerId = (searchParams.get('id') || '').trim();
    if (!offerId) {
      return NextResponse.json({ error: 'Offre introuvable' }, { status: 400 });
    }

    const offer = await db.serviceOffer.findUnique({
      where: { id: offerId },
      select: { id: true, propertyId: true },
    });
    if (!offer) {
      return NextResponse.json({ error: 'Offre introuvable' }, { status: 404 });
    }
    if (!(await canAccessProperty(userId, offer.propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    await db.serviceOffer.delete({ where: { id: offerId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[airbnb/service-offers DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

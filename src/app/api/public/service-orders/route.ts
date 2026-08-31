import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  parseOrderItems,
  itemsTotal,
  computeSplit,
  rateLimit,
} from '@/lib/orders';

// =============================================================
// ÉTAPE 17.2 (V3) — Moteur de transaction côté INVITÉ :
//   POST /api/public/service-orders?slug=<slug>
//     { providerId, items[{name,qty,unitPrice}], bookingId?, guestName?, guestEmail? }
//     → crée une commande PENDING (prix & split recalculés SERVEUR)
//   GET  /api/public/service-orders?slug=<slug>&b=<bookingId>
//     → "Mes commandes" du séjour (SANS commission/hostEarning —
//       la séparation financière n'est jamais exposée à l'invité)
//
// slug en QUERY PARAM (règle sandbox). Moteur never-throw.
// Sécurité : le bien est résolu par slug (plaque V1 → hub V2) ;
// le booking est filtré par propertyId (pas de cross-bien) ;
// guestName/guestEmail font FOI depuis le Booking si fourni.
// =============================================================

interface ResolvedProperty {
  id: string;
  name: string;
}

/** Résolution bien par slug — même logique que /api/public/guest-app (duplication maîtrisée, flux V1 intouché). */
async function resolvePropertyBySlug(slug: string): Promise<ResolvedProperty | null> {
  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });
  if (plaque && plaque.isClaimed && plaque.propertyId && plaque.status === 'active') {
    const p = await db.property.findUnique({
      where: { id: plaque.propertyId },
      select: { id: true, name: true, isActive: true },
    });
    if (p?.isActive) return { id: p.id, name: p.name };
  }
  if (!plaque) {
    const p = await db.property.findUnique({
      where: { qrHubSlug: slug },
      select: { id: true, name: true, isActive: true },
    });
    if (p?.isActive) return { id: p.id, name: p.name };
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    if (!slug) {
      return NextResponse.json({ ok: false, message: 'Hub introuvable.' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Requête invalide.' }, { status: 400 });
    }

    const property = await resolvePropertyBySlug(slug);
    if (!property) {
      return NextResponse.json(
        { ok: false, message: 'Ce hub est introuvable ou désactivé.' },
        { status: 404 },
      );
    }

    // Anti-spam léger par bien (fenêtre glissante en mémoire)
    if (!rateLimit(`order:${property.id}`, 10)) {
      return NextResponse.json(
        { ok: false, message: 'Trop de commandes rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    // ── 1. Prestataire : actif + expérience invité ──
    const providerId = typeof body.providerId === 'string' ? body.providerId : '';
    const provider = providerId
      ? await db.provider.findFirst({
          where: { id: providerId, isActive: true, audience: 'GUEST_EXPERIENCE' },
          select: { id: true, businessName: true },
        })
      : null;
    if (!provider) {
      return NextResponse.json(
        { ok: false, message: 'Ce service n’est pas disponible pour ce logement.' },
        { status: 400 },
      );
    }

    // ── 2. Lignes de commande : validées + total RECALCULÉ serveur ──
    const items = parseOrderItems(body.items);
    if (!items) {
      return NextResponse.json(
        { ok: false, message: 'Détail de la commande invalide.' },
        { status: 400 },
      );
    }
    const totalAmount = itemsTotal(items);
    if (totalAmount <= 0) {
      return NextResponse.json({ ok: false, message: 'Le montant de la commande est nul.' }, { status: 400 });
    }
    const { commission, hostEarning } = computeSplit(totalAmount);

    // ── 3. Invité : depuis le séjour (autorité serveur) ou saisi ──
    let guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
    let guestEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim() : '';
    const bookingId = typeof body.bookingId === 'string' && body.bookingId ? body.bookingId : null;

    if (bookingId) {
      const stay = await db.booking.findFirst({
        where: { id: bookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
        select: { guestName: true, guestEmail: true },
      });
      if (!stay) {
        return NextResponse.json(
          { ok: false, message: 'Séjour introuvable pour ce logement.' },
          { status: 400 },
        );
      }
      guestName = stay.guestName;
      guestEmail = stay.guestEmail || guestEmail;
    }
    if (guestName.length < 2 || guestName.length > 80) {
      return NextResponse.json({ ok: false, message: 'Votre nom est requis pour commander.' }, { status: 400 });
    }
    if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return NextResponse.json({ ok: false, message: 'Adresse email invalide.' }, { status: 400 });
    }

    // ── 4. Création (statut initial PENDING — cycle piloté côté hôte) ──
    const order = await db.serviceOrder.create({
      data: {
        bookingId,
        propertyId: property.id,
        providerId: provider.id,
        guestName,
        guestEmail: guestEmail || null,
        items: items as unknown as Prisma.InputJsonValue,
        totalAmount,
        commission,
        hostEarning,
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        totalAmount,
        items,
        deliveryDate: null,
        createdAt: order.createdAt,
        providerName: provider.businessName,
      },
    });
  } catch (error) {
    console.error('[public/service-orders POST] Error:', error);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    const bookingId = (url.searchParams.get('b') || '').trim();

    if (!slug || !bookingId) {
      return NextResponse.json({ ok: false, message: 'Paramètres manquants.' }, { status: 400 });
    }

    const property = await resolvePropertyBySlug(slug);
    if (!property) {
      return NextResponse.json({ ok: false, message: 'Hub introuvable.' }, { status: 404 });
    }

    // Le séjour DOIT appartenir au bien du slug (anti cross-bien)
    const stay = await db.booking.findFirst({
      where: { id: bookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
      select: { id: true },
    });
    if (!stay) {
      return NextResponse.json({ ok: false, message: 'Séjour introuvable.' }, { status: 404 });
    }

    // ⚠️ Jamais de commission/hostEarning côté invité — totalAmount uniquement.
    const orders = await db.serviceOrder.findMany({
      where: { bookingId: stay.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        totalAmount: true,
        items: true,
        deliveryDate: true,
        createdAt: true,
        provider: { select: { businessName: true, category: true } },
      },
    });

    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    console.error('[public/service-orders GET] Error:', error);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

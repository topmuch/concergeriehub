import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  parseOrderLines,
  itemsTotal,
  computeSplit,
  round2,
  type OrderItem,
} from '@/lib/orders';
import { rateLimit } from '@/lib/rate-limit';
import { isFlagEnabled } from '@/lib/feature-flags';
import { isIpBlacklisted } from '@/lib/security';
import { markServiceOrderPaid, orderStripeDescription } from '@/lib/payments-server';
import { captureError } from '@/lib/error-monitor';
import { ensureDefaultRules, runAutomationTrigger } from '@/lib/automations-server';
import { sendNotification, sendNotificationToMany, propertyOwnerAndManagers } from '@/lib/notifications';
import { renderHubAlertEmail } from '@/lib/email-template-render';
import { notifySuperadmins } from '@/lib/notifications';
import { resolveOrigin, siteUrl } from '@/lib/site';

// =============================================================
// REFONTE SERVICES PREMIUM (V4.11) — CHECKOUT GROUPÉ du panier
//   POST /api/public/service-orders/checkout?slug=<slug>
//   { groups: [{ providerId, items: [{ offerId?|name, qty }] }],
//     bookingId, guestName?, guestEmail?, deliveryDate?, note? }
//
// Le panier premium peut mélanger plusieurs prestataires (ex:
// petit-déjeuner + pressing). Ce endpoint :
//   1. re-prix CHAQUE ligne côté serveur (jamais cru client — 17.5) ;
//   2. crée UNE commande ServiceOrder par prestataire (PENDING,
//      split commission/hostEarning recalculé, guestNote + créneau) ;
//   3. encaisse le TOUT en UNE SEULE session Stripe Checkout
//      (metadata.serviceOrderIds → webhook marque tout PAYÉ) ;
//   4. mode démo dev → markServiceOrderPaid (même code path webhook).
//
// NOTE STRIPE CONNECT : une session Checkout ne peut faire qu'UN
// destination charge. Les paniers mono-prestataire passent par le
// flux classique /[id]/pay (Connect préservé). Les paniers multi-
// prestataires sont encaissés par la plateforme (le split commission/
// hostEarning reste journalisé par commande pour le reversement).
// =============================================================

interface ResolvedProperty {
  id: string;
  name: string;
}

/** Résolution bien par slug — copie conforme de service-orders/route.ts. */
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

interface PreparedGroup {
  providerId: string;
  providerName: string;
  items: (OrderItem & { offerId?: string })[];
  totalAmount: number;
  commission: number;
  hostEarning: number;
  userId: string | null;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    if (!slug) {
      return NextResponse.json({ ok: false, message: 'Hub introuvable.' }, { status: 400 });
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip') || 'local';
    if (await isIpBlacklisted(clientIp)) {
      return NextResponse.json({ ok: false, message: 'Accès refusé.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: 'Requête invalide.' }, { status: 400 });
    }

    // ── HUB DÉMO (vitrine landing, aucun bien en DB) — REFONTE V4.14 ──
    // Panier multi-prestataires du hub démo : simulation autonome
    // (aucune écriture DB, aucun encaissement, aucun appel Stripe).
    // L'UI consomme `mode: 'demo'` → confirmation confettis immédiate.
    if (slug === 'demo-hub') {
      const demoName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
      if (demoName.length < 2) {
        return NextResponse.json({ ok: false, message: 'Votre nom est requis.' }, { status: 400 });
      }
      const groupsRaw = Array.isArray(body.groups) ? body.groups : [];
      const ts = Date.now();
      return NextResponse.json(
        {
          ok: true,
          mode: 'demo',
          paymentStatus: 'PAID',
          orderIds: groupsRaw.map((_, i) => `demo-order-${ts}-${i + 1}`),
          // Pas de grandTotal : l'UI retombe sur son sous-total local
          // (fidèle à ce que l'invité démo a réellement vu).
        },
        { status: 201 },
      );
    }

    const property = await resolvePropertyBySlug(slug);
    if (!property) {
      return NextResponse.json(
        { ok: false, message: 'Ce hub est introuvable ou désactivé.' },
        { status: 404 },
      );
    }

    if (!(await rateLimit(`checkout:${property.id}`, 10))) {
      return NextResponse.json(
        { ok: false, message: 'Trop de commandes rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    if (!(await isFlagEnabled('marketplace_enabled')) || (await isFlagEnabled('maintenance_mode'))) {
      return NextResponse.json(
        { ok: false, message: 'Les commandes sont temporairement suspendues. Réessayez plus tard.' },
        { status: 503 },
      );
    }

    // ── 1. Groupes du panier (1..8 prestataires) ──
    const rawGroups = body.groups;
    if (!Array.isArray(rawGroups) || rawGroups.length === 0 || rawGroups.length > 8) {
      return NextResponse.json(
        { ok: false, message: 'Le contenu du panier est invalide.' },
        { status: 400 },
      );
    }

    // ── 2. Invité : séjour (autorité serveur) ou saisi ──
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

    // Créneau + note — mêmes garde-fous que le flux mono-prestataire.
    let deliveryDate: Date | null = null;
    if (typeof body.deliveryDate === 'string' && body.deliveryDate.trim()) {
      const d = new Date(body.deliveryDate);
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 60_000 && d.getTime() < Date.now() + 31 * 86_400_000) {
        deliveryDate = d;
      }
    }
    const guestNote =
      typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

    // ── 3. Re-pricing serveur groupe par groupe ──
    const prepared: PreparedGroup[] = [];
    for (const raw of rawGroups) {
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json({ ok: false, message: 'Le contenu du panier est invalide.' }, { status: 400 });
      }
      const g = raw as Record<string, unknown>;
      const providerId = typeof g.providerId === 'string' ? g.providerId : '';
      const provider = providerId
        ? await db.provider.findFirst({
            where: { id: providerId, isActive: true, audience: 'GUEST_EXPERIENCE' },
            select: { id: true, businessName: true, hourlyRate: true, userId: true },
          })
        : null;
      if (!provider) {
        return NextResponse.json(
          { ok: false, message: 'Un service du panier n’est plus disponible. Actualisez la page.' },
          { status: 400 },
        );
      }

      const lines = parseOrderLines(g.items);
      if (!lines) {
        return NextResponse.json(
          { ok: false, message: 'Le détail du panier est invalide.' },
          { status: 400 },
        );
      }

      const offerIds = [...new Set(lines.map((l) => l.offerId).filter((id): id is string => id !== null))];
      const offers = offerIds.length
        ? await db.serviceOffer.findMany({
            where: {
              id: { in: offerIds },
              propertyId: property.id,
              providerId: provider.id,
              isActive: true,
            },
            select: { id: true, name: true, unitPrice: true },
          })
        : [];
      const offerById = new Map(offers.map((o) => [o.id, o]));

      const items: (OrderItem & { offerId?: string })[] = [];
      for (const line of lines) {
        if (line.offerId) {
          const offer = offerById.get(line.offerId);
          if (!offer) {
            return NextResponse.json(
              { ok: false, message: 'Une offre du panier n’est plus disponible. Actualisez la page.' },
              { status: 400 },
            );
          }
          items.push({ offerId: offer.id, name: offer.name, qty: line.qty, unitPrice: offer.unitPrice });
        } else {
          if (provider.hourlyRate == null) {
            return NextResponse.json(
              { ok: false, message: 'Un service du panier est sur devis — retirez-le pour continuer.' },
              { status: 400 },
            );
          }
          items.push({ name: line.name, qty: line.qty, unitPrice: provider.hourlyRate });
        }
      }

      const totalAmount = itemsTotal(items);
      if (totalAmount <= 0) {
        return NextResponse.json({ ok: false, message: 'Le montant du panier est nul.' }, { status: 400 });
      }
      const { commission, hostEarning } = computeSplit(totalAmount);
      prepared.push({
        providerId: provider.id,
        providerName: provider.businessName,
        items,
        totalAmount,
        commission,
        hostEarning,
        userId: provider.userId,
      });
    }

    const grandTotal = round2(prepared.reduce((s, g) => s + g.totalAmount, 0));

    // ── 4. Création : une commande par prestataire ──
    const created: { id: string; providerName: string; totalAmount: number; items: (OrderItem & { offerId?: string })[] }[] = [];
    for (const g of prepared) {
      const order = await db.serviceOrder.create({
        data: {
          bookingId,
          propertyId: property.id,
          providerId: g.providerId,
          guestName,
          guestEmail: guestEmail || null,
          items: g.items as unknown as Prisma.InputJsonValue,
          guestNote,
          totalAmount: g.totalAmount,
          commission: g.commission,
          hostEarning: g.hostEarning,
          status: 'PENDING',
          ...(deliveryDate ? { deliveryDate } : {}),
        },
        select: { id: true },
      });
      created.push({ id: order.id, providerName: g.providerName, totalAmount: g.totalAmount, items: g.items });
    }

    // ── 5. Automatisations + notifications prestataires (fire-and-forget) ──
    await ensureDefaultRules(property.id).catch(() => undefined);
    for (let i = 0; i < created.length; i++) {
      const c = created[i];
      const g = prepared[i]; // même ordre : created est construit depuis prepared
      const itemsSummary = c.items.map((it) => `${it.qty}× ${it.name}`).join(', ').slice(0, 120);
      void runAutomationTrigger(property.id, 'ORDER_CREATED', {
        kind: 'order',
        order: {
          id: c.id,
          guestName,
          totalAmount: c.totalAmount,
          providerName: c.providerName,
          itemsSummary: itemsSummary || 'commande service',
        },
      }).catch(() => undefined);
      if (g?.userId) {
        sendNotification(g.userId, 'host_order', {
          title: `🛒 Nouvelle commande — ${property.name}`,
          body: `${guestName} a commandé « ${itemsSummary || 'commande service'} » (${c.totalAmount.toFixed(2).replace('.', ',')} €) via le Hub de ${property.name}.`,
          propertyId: property.id,
          propertyName: property.name,
          url: '/provider/dashboard',
          meta: { source: 'guest_app_checkout', orderId: c.id },
        }).catch(() => undefined);
      }
    }

    // ── v4.81 (AUDIT QA-1) — EMAIL HÔTE (et managers) sur le checkout
    // MULTI-prestataires : ce bloc était absent — l'hôte découvrait la
    // commande après paiement. Même pattern que le flux mono
    // (service-orders/route.ts) : email structuré hub_alert + notification
    // audience + relais Superadmin. Fire-and-forget : jamais bloquant.
    try {
      const multiSummary = created
        .map((c) => `${c.providerName} : ${c.items.map((it) => `${it.qty}× ${it.name}`).join(', ').slice(0, 80)}`)
        .join(' · ')
        .slice(0, 300);
      const email = await renderHubAlertEmail({
        heading: '🥐 Nouvelle commande Room Service (panier multi-prestataires)',
        propertyName: property.name,
        guestName,
        rows: created.map((c) => ({
          label: c.providerName,
          value: `${c.items.map((it) => `${it.qty}× ${it.name}`).join(', ').slice(0, 120)} — ${c.totalAmount.toFixed(2).replace('.', ',')} €`,
        })),
        totalLabel: 'Montant total du panier',
        totalValue: `${grandTotal.toFixed(2).replace('.', ',')} €`,
        introNote:
          'Panier multi-prestataires encaissé par la plateforme (commission/hostEarning journalisés par commande). Suivez les commandes depuis votre tableau de bord.',
        ctaLabel: 'Ouvrir le tableau de bord',
        ctaUrl: `${siteUrl}/airbnb/orders`,
        footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
      });
      const audience = await propertyOwnerAndManagers(property.id);
      if (audience.length > 0) {
        void sendNotificationToMany(audience, 'new_order', {
          title: `🥐 Nouvelle commande multi-prestataires — ${property.name}`,
          body: `${guestName} a commandé un panier (${grandTotal.toFixed(2).replace('.', ',')} €) : ${multiSummary}`,
          propertyId: property.id,
          propertyName: property.name,
          url: '/airbnb/orders',
          email: { subject: email.subject, html: email.html, text: email.text },
          meta: { source: 'guest_app_checkout', orderIds: created.map((c) => c.id).join(',') },
        }).catch(() => undefined);
      }
      void notifySuperadmins('new_order', {
        title: `🥐 [Plateforme] Panier multi-prestataires — ${property.name}`,
        body: `${guestName} — ${multiSummary} (${grandTotal.toFixed(2).replace('.', ',')} €).`,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/orders',
        email: { subject: email.subject, html: email.html, text: email.text },
        meta: { source: 'guest_app_checkout', relay: 'superadmin', orderIds: created.map((c) => c.id).join(',') },
      }).catch(() => undefined);
    } catch (error) {
      console.error('[checkout multi] email host failed:', error);
    }

    const origin = resolveOrigin(req);
    const guestParams = bookingId ? `b=${encodeURIComponent(bookingId)}&` : '';

    // ── 6. ENCAISSEMENT ──
    if (process.env.STRIPE_SECRET_KEY) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: guestEmail || undefined,
        line_items: created.map((c) => ({
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(c.totalAmount * 100),
            product_data: {
              name: `${c.providerName} — RoomScan`,
              description: orderStripeDescription(c.items),
            },
          },
        })),
        success_url: `${origin}/app/hub/${encodeURIComponent(slug)}/guest?${guestParams}paid=${created[0].id}`,
        cancel_url: `${origin}/app/hub/${encodeURIComponent(slug)}/guest?${guestParams}paycancel=${created[0].id}`,
        metadata: {
          // Multi-commandes : liste consommée par le webhook core
          serviceOrderIds: created.map((c) => c.id).join(','),
          propertyId: property.id,
          ...(bookingId ? { bookingId } : {}),
        },
      });

      await db.serviceOrder.updateMany({
        where: { id: { in: created.map((c) => c.id) } },
        data: { stripeSessionId: session.id },
      });

      return NextResponse.json(
        { ok: true, mode: 'stripe', url: session.url, orderIds: created.map((c) => c.id), grandTotal },
        { status: 201 },
      );
    }

    // ── MODE DÉMO (dev sans clés) — interdit en production ──
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { ok: false, message: 'Paiement indisponible : configuration Stripe manquante. Contactez votre hôte.' },
        { status: 503 },
      );
    }

    for (const c of created) {
      await markServiceOrderPaid(c.id, {
        stripeSessionId: `cs_demo_${c.id.slice(0, 12)}`,
      });
    }

    return NextResponse.json(
      { ok: true, mode: 'demo', paymentStatus: 'PAID', orderIds: created.map((c) => c.id), grandTotal },
      { status: 201 },
    );
  } catch (error) {
    await captureError('payments.cartCheckout', error, undefined, req);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

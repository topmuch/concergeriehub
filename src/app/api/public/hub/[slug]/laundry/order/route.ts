import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { isIpBlacklisted } from '@/lib/security';
import { captureError } from '@/lib/error-monitor';
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
import { requireHubAccess } from '@/lib/hub-access';
import { resolveOrigin, siteUrl } from '@/lib/site';

// =============================================================
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » (amélioration 1.5)
// POST /api/public/hub/[slug]/laundry/order
//   body: { serviceType, pieces, pickupSlot, notes?, guestName?,
//           bookingId?, payment: 'stripe' | 'host' }
//
// 1. Le bien est résolu par le slug (garde hub-access 403 si verrouillé) ;
// 2. TARIFS SERVEUR (jamais cru côté client) :
//      ironing      → 5 €  / pièce  (retour 4 h)
//      washing      → 15 € / panier (retour 24 h)
//      drycleaning  → 8 €  / pièce  (retour 48 h)
// 3. LaundryOrder créé (status REQUESTED) ;
// 4. payment='stripe' + Stripe configuré → Checkout Session
//    (mode 'payment', metadata.type='pressing_order') → { url } ;
//    sinon → simple demande : notification hôte unifiée
//    « pressing_order » (cloche + email + push).
//
// Sécurité : blacklist IP + rate limit 5/min par slug+IP ; zod strict ;
// bookingId re-validé par bien (anti IDOR) ; never-throw.
// =============================================================

/** Tarifs serveur (€) — source de vérité (miroir de src/lib/laundry.ts). */
const LAUNDRY_PRICES: Record<string, { unitPrice: number; unit: string; label: string }> = {
  ironing: { unitPrice: 5, unit: 'pièce', label: 'Repassage Express' },
  washing: { unitPrice: 15, unit: 'panier', label: 'Lessive Complète' },
  drycleaning: { unitPrice: 8, unit: 'pièce', label: 'Pressing à Sec' },
};

const DEMO_SLUG = 'demo-hub';

const requestSchema = z.object({
  serviceType: z.enum(['ironing', 'washing', 'drycleaning']),
  pieces: z.number().int().min(1).max(50).default(1),
  pickupSlot: z.enum(['morning', 'afternoon']).default('morning'),
  notes: z.string().trim().max(500).optional().nullable(),
  guestName: z.string().trim().max(80).optional().nullable(),
  bookingId: z.string().trim().max(60).optional().nullable(),
  payment: z.enum(['stripe', 'host']).default('host'),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

/** Libellé du créneau de récupération. */
function pickupSlotLabel(slot: string): string {
  return slot === 'afternoon' ? 'cet après-midi' : 'ce matin';
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Blacklist IP (Module 7 Sécurité)
    if (await isIpBlacklisted(clientIp(req))) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    }

    // Anti-spam : 5 commandes / minute / slug+IP
    if (!(await rateLimit(`laundryorder:${slug}:${clientIp(req)}`, 5))) {
      return NextResponse.json(
        { error: 'Trop de demandes rapprochées. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    // ── Lecture + validation du body (zod) — AVANT la résolution du bien
    // (le mode démo n'a pas de Property réelle) ──
    const rawBody = await req.json().catch(() => null);
    if (rawBody !== null && typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }

    const { serviceType, pieces, pickupSlot, notes } = parsed.data;
    const tariff = LAUNDRY_PRICES[serviceType];
    // Montant SERVEUR — la lessive est au panier (pieces ignoré), les
    // autres services au nombre de pièces.
    const units = serviceType === 'washing' ? 1 : pieces;
    const amount = Math.round(tariff.unitPrice * units * 100) / 100;

    // ── MODE DÉMO (vitrine demo-hub) : succès sans écriture, AVANT la
    // résolution du bien (demo-hub est un hub virtuel, pas une Property) ──
    if (slug === DEMO_SLUG) {
      return NextResponse.json({
        ok: true,
        mode: 'demo',
        serviceLabel: tariff.label,
        amount,
        message: `Commande enregistrée (mode démo) — ${tariff.label}, récupération ${pickupSlotLabel(pickupSlot)}.`,
      }, { status: 201 });
    }

    // ── Garde hub-access (hub verrouillé par code → 403 SESSION_*) ──
    const access = await requireHubAccess(slug, req);
    if (!access.ok) {
      return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
    }
    const propertyId = access.propertyId;

    // ── Booking re-validé par bien (anti IDOR) + nom d'invité ──
    const bookingId = parsed.data.bookingId?.trim().slice(0, 60) || null;
    let booking: { id: string; guestName: string; guestEmail: string | null } | null = null;
    if (bookingId) {
      booking = await db.booking.findFirst({
        where: { id: bookingId, propertyId, status: { not: 'CANCELLED' } },
        select: { id: true, guestName: true, guestEmail: true },
      });
      if (!booking) {
        return NextResponse.json({ error: 'Séjour introuvable pour ce logement.' }, { status: 404 });
      }
    }
    const guestName =
      booking?.guestName?.slice(0, 80) ?? parsed.data.guestName?.trim().slice(0, 80) ?? null;

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, isActive: true, owner: { select: { id: true } } },
    });
    if (!property?.isActive) {
      return NextResponse.json({ error: 'Ce hub est introuvable ou a été désactivé.' }, { status: 404 });
    }

    // ── Paiement Stripe (cloné du late check-out) ──
    if (parsed.data.payment === 'stripe' && process.env.STRIPE_SECRET_KEY) {
      const origin = resolveOrigin(req);
      const guestParams = booking ? `b=${encodeURIComponent(booking.id)}&` : '';
      const successUrl = `${origin}/app/hub/${encodeURIComponent(slug)}/guest?${guestParams}paid=pressing`;
      const cancelUrl = `${origin}/app/hub/${encodeURIComponent(slug)}/guest?${guestParams}paycancel=pressing`;

      // Commande d'abord persistée (PENDING_PAYMENT) — le webhook la
      // basculera PAID (metadata laundryOrderId).
      const order = await db.laundryOrder.create({
        data: {
          propertyId,
          bookingId: booking?.id ?? null,
          guestName,
          guestEmail: booking?.guestEmail ?? null,
          serviceType,
          pieces,
          pickupSlot,
          notes: notes?.slice(0, 500) ?? null,
          amountEur: amount,
          payment: 'stripe',
          status: 'PENDING_PAYMENT',
        },
      });

      let sessionUrl: string | null = null;
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['card'],
          customer_email: booking?.guestEmail || undefined,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'eur',
                unit_amount: Math.round(amount * 100),
                product_data: {
                  name: `${tariff.label} — ${property.name}`,
                  description:
                    serviceType === 'washing'
                      ? `Lessive complète 1 panier — récupération ${pickupSlotLabel(pickupSlot)}${guestName ? ` — ${guestName}` : ''}.`
                      : `${tariff.label} × ${pieces} ${tariff.unit}${pieces > 1 ? 's' : ''} — récupération ${pickupSlotLabel(pickupSlot)}${guestName ? ` — ${guestName}` : ''}.`,
                },
              },
            },
          ],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            type: 'pressing_order',
            propertyId,
            laundryOrderId: order.id,
            ...(booking ? { bookingId: booking.id } : {}),
            hubSlug: slug,
          },
        });
        sessionUrl = session.url ?? null;
        await db.laundryOrder
          .update({ where: { id: order.id }, data: { stripeSessionId: session.id } })
          .catch(() => undefined);
      } catch (error) {
        console.error('[laundry/order] Stripe session failed:', error);
        await captureError('laundry.stripe_session', error, undefined, req);
        // La commande bascule en demande simple : l'invité n'est pas
        // bloqué, l'hôte reçoit la demande et organise le règlement.
        await db.laundryOrder
          .updateMany({
            where: { id: order.id, status: 'PENDING_PAYMENT' },
            data: { status: 'REQUESTED', payment: 'host' },
          })
          .catch(() => undefined);
        const audience = await propertyOwnerAndManagers(propertyId);
        await notifyHostOrder(audience, property, {
          order,
          tariffLabel: tariff.label,
          units,
          unit: tariff.unit,
          amount,
          guestName,
          pickupSlot,
          paid: false,
          ownerUserId: property.owner?.id ?? null,
        });
        return NextResponse.json(
          { error: 'Le paiement est momentanément indisponible — votre demande pressing a bien été transmise à votre hôte.' },
          { status: 502 },
        );
      }

      if (!sessionUrl) {
        return NextResponse.json(
          { error: 'Le paiement est momentanément indisponible. Réessayez dans un instant.' },
          { status: 502 },
        );
      }
      console.log(`[laundry/order] Session Stripe créée — order ${order.id} (${amount} €)`);
      return NextResponse.json({ ok: true, mode: 'stripe', url: sessionUrl }, { status: 201 });
    }

    // ── Demande simple : notification hôte unifiée ──
    const order = await db.laundryOrder.create({
      data: {
        propertyId,
        bookingId: booking?.id ?? null,
        guestName,
        guestEmail: booking?.guestEmail ?? null,
        serviceType,
        pieces,
        pickupSlot,
        notes: notes?.slice(0, 500) ?? null,
        amountEur: amount,
        payment: 'host',
        status: 'REQUESTED',
      },
    });

    const audience = await propertyOwnerAndManagers(propertyId);
    await notifyHostOrder(audience, property, {
      order,
      tariffLabel: tariff.label,
      units,
      unit: tariff.unit,
      amount,
      guestName,
      pickupSlot,
      paid: false,
      ownerUserId: property.owner?.id ?? null,
    });

    return NextResponse.json(
      { ok: true, mode: 'host', serviceLabel: tariff.label, amount, message: 'Demande envoyée à votre hôte !' },
      { status: 201 },
    );
  } catch (error) {
    await captureError('laundry.order', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

/** Notification hôte unifiée (cloche + email + push) — never-throw. */
async function notifyHostOrder(
  audience: string[],
  property: { id: string; name: string },
  ctx: {
    order: { id: string; pickupSlot: string; notes: string | null; amountEur: number };
    tariffLabel: string;
    units: number;
    unit: string;
    amount: number;
    guestName: string | null;
    pickupSlot: string;
    paid: boolean;
    ownerUserId: string | null;
  },
): Promise<void> {
  try {
    const amountLabel = `${ctx.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`;
    const who = ctx.guestName ? `${ctx.guestName} ` : 'Un invité ';
    const body =
      `${who}commande ${ctx.tariffLabel} (${ctx.units} ${ctx.unit} — ${amountLabel}). ` +
      `Récupération souhaitée ${pickupSlotLabel(ctx.pickupSlot)}.` +
      (ctx.order.notes ? ` Note : « ${ctx.order.notes.slice(0, 160)} »` : '') +
      (ctx.paid ? ' ✅ Réglé par carte.' : ' 💳 Règlement à organiser avec l’invité.');
    if (audience.length > 0) {
      await sendNotificationToMany(audience, 'pressing_order', {
        title: `👔 Pressing — ${property.name}`,
        body,
        propertyId: property.id,
        propertyName: property.name,
        url: '/airbnb/orders',
        meta: {
          source: 'hub',
          laundryOrderId: ctx.order.id,
          amount: ctx.amount,
          paid: ctx.paid,
        },
      });
    } else if (ctx.ownerUserId) {
      // Filet de sécurité : jamais sans trace (aucun manager trouvé).
      await db.notification
        .create({
          data: {
            userId: ctx.ownerUserId,
            type: 'pressing_order',
            title: `👔 Pressing — ${property.name}`,
            body,
          },
        })
        .catch(() => undefined);
    }
  } catch (error) {
    console.error('[laundry/order] Notification hôte échouée (non bloquant):', error);
  }
}

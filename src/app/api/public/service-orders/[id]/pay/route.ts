import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/orders';
import { markServiceOrderPaid, orderStripeDescription } from '@/lib/payments-server';

// =============================================================
// ÉTAPE 17.6 (V3) — PAIEMENT IN-APP d'une commande service
//   POST /api/public/service-orders/[id]/pay?slug=<slug>&b=<bookingId>
//
// Publique (l'invité n'a pas de session) mais SANS confiance client :
//  - le bien est résolu par slug (même logique que le POST création) ;
//  - la commande DOIT appartenir à ce bien (anti cross-bien/IDOR) ;
//  - si la commande est liée à un séjour, le paramètre b doit
//    correspondre exactement ;
//  - le MONTANT n'est jamais lu dans la requête : c'est order.
//    totalAmount (re-prixé serveur à la création, ÉTAPE 17.5).
//
// - STRIPE_SECRET_KEY configurée → Checkout Session (mode 'payment'),
//   metadata.serviceOrderId consommée par le webhook (source de vérité).
// - Sinon → MODE DÉMO : encaissement simulé via le MÊME chemin de code
//   que le webhook (markServiceOrderPaid), JAMAIS en production (503).
// =============================================================

/** Résolution bien par slug — copie conforme de service-orders/route.ts (duplication maîtrisée, flux intouché). */
async function resolvePropertyBySlug(slug: string): Promise<{ id: string; name: string } | null> {
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    const bookingParam = (url.searchParams.get('b') || '').trim();

    if (!id || !slug) {
      return NextResponse.json({ ok: false, message: 'Paramètres manquants.' }, { status: 400 });
    }

    const property = await resolvePropertyBySlug(slug);
    if (!property) {
      return NextResponse.json({ ok: false, message: 'Hub introuvable.' }, { status: 404 });
    }

    const order = await db.serviceOrder.findUnique({
      where: { id },
      select: {
        id: true,
        propertyId: true,
        bookingId: true,
        totalAmount: true,
        status: true,
        paymentStatus: true,
        items: true,
        guestEmail: true,
        provider: { select: { businessName: true } },
      },
    });
    if (!order || order.propertyId !== property.id) {
      return NextResponse.json({ ok: false, message: 'Commande introuvable pour ce logement.' }, { status: 404 });
    }

    // La commande liée à un séjour exige le bon séjour (anti IDOR)
    if (order.bookingId) {
      if (!bookingParam || bookingParam !== order.bookingId) {
        return NextResponse.json({ ok: false, message: 'Séjour invalide pour cette commande.' }, { status: 403 });
      }
      const stay = await db.booking.findFirst({
        where: { id: order.bookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
        select: { id: true },
      });
      if (!stay) {
        return NextResponse.json({ ok: false, message: 'Séjour introuvable.' }, { status: 404 });
      }
    }

    // Anti-abus par commande (fenêtre glissante en mémoire)
    if (!rateLimit(`orderpay:${order.id}`, 6)) {
      return NextResponse.json(
        { ok: false, message: 'Trop de tentatives de paiement. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    if (order.status === 'CANCELLED') {
      return NextResponse.json({ ok: false, message: 'Cette commande a été annulée.' }, { status: 400 });
    }
    if (order.paymentStatus === 'PAID') {
      return NextResponse.json({ ok: true, alreadyPaid: true, paymentStatus: 'PAID' });
    }
    if (order.totalAmount <= 0) {
      return NextResponse.json({ ok: false, message: 'Montant de commande invalide.' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const guestParams = order.bookingId ? `b=${encodeURIComponent(order.bookingId)}&` : '';
    const successUrl = `${origin}/app/hub/${encodeURIComponent(slug)}/guest?${guestParams}paid=${order.id}`;
    const cancelUrl = `${origin}/app/hub/${encodeURIComponent(slug)}/guest?${guestParams}paycancel=${order.id}`;

    // ── STRIPE RÉEL : Checkout Session (mode payment) ──
    if (process.env.STRIPE_SECRET_KEY) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: order.guestEmail || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              // Montant SERVEUR — jamais fourni par le client
              unit_amount: Math.round(order.totalAmount * 100),
              product_data: {
                name: `${order.provider.businessName} — Conciergerie Hub`,
                description: orderStripeDescription(order.items),
              },
            },
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          serviceOrderId: order.id,
          propertyId: property.id,
          ...(order.bookingId ? { bookingId: order.bookingId } : {}),
        },
      });

      await db.serviceOrder.update({
        where: { id: order.id },
        data: { stripeSessionId: session.id },
      });

      return NextResponse.json({ ok: true, mode: 'stripe', url: session.url }, { status: 201 });
    }

    // ── MODE DÉMO (sans clés) — interdit en production (cf. checkout) ──
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { ok: false, message: 'Paiement indisponible : configuration Stripe manquante. Contactez votre hôte.' },
        { status: 503 },
      );
    }

    const result = await markServiceOrderPaid(order.id, {
      stripeSessionId: `cs_demo_${order.id.slice(0, 12)}`,
    });
    if (!result.marked && !result.alreadyPaid) {
      return NextResponse.json({ ok: false, message: 'Commande introuvable.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      mode: 'demo',
      alreadyPaid: result.alreadyPaid,
      paymentStatus: 'PAID',
      demoRedirect: successUrl,
    });
  } catch (error) {
    console.error('[public/service-orders/pay POST] Error:', error);
    return NextResponse.json(
      { ok: false, message: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

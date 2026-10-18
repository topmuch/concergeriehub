import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { isIpBlacklisted } from '@/lib/security';
import { captureError } from '@/lib/error-monitor';
import { parsePremiumFeatures } from '@/lib/concierge';
import { resolveOrigin, siteUrl } from '@/lib/site';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — ÉTAPE 3.3
// PAIEMENT STRIPE DU LATE CHECK-OUT (départ tardif 14 h)
//   POST /api/public/hub/[slug]/late-checkout/pay
//   body: { bookingId?, guestName? }
//
// 1. Le bien est résolu par le slug (plaque V1 OU hub V2) ;
// 2. Le serveur VÉRIFIE premiumFeatures.enableLateCheckout + le
//    PRIX SERVEUR lateCheckoutPrice (jamais cru côté client) ;
// 3. Le booking est validé : appartient au bien, non annulé,
//    non déjà payé (idempotence) ;
// 4. Création d'une Stripe Checkout Session (mode 'payment') avec
//    metadata { type:'late_checkout', propertyId, bookingId } —
//    consommée par /api/stripe/webhook (checkout.session.completed) ;
// 5. Retourne { url } → redirection frontend vers Stripe Checkout.
//
// Gestion des erreurs : carte refusée = gérée PAR Stripe (la session
// reste en mode retry) ; Stripe indisponible → 503 message clair ;
// sans STRIPE_SECRET_KEY → 503 (le frontend retombe alors sur la
// simple demande /late-checkout sans paiement).
//
// Sécurité : blacklist IP + rate limit 4/min par slug+IP ; zod ;
// never-throw (captureError).
// =============================================================

const requestSchema = z.object({
  bookingId: z.string().trim().max(60).optional().nullable(),
  guestName: z.string().trim().max(80).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

/** Résolution bien par slug — même pattern que late-checkout/route.ts. */
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

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Blacklist IP (Module 7 Sécurité)
    if (await isIpBlacklisted(clientIp(req))) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    }

    // Anti-spam : 4 tentatives / minute / slug+IP
    if (!(await rateLimit(`latecheckoutpay:${slug}:${clientIp(req)}`, 4))) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

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

    // ── Résolution du bien ──
    const property = await resolvePropertyBySlug(slug);
    if (!property) {
      return NextResponse.json({ error: 'Ce hub est introuvable ou a été désactivé.' }, { status: 404 });
    }

    // ── Garde serveur : service activé + PRIX SERVEUR ──
    const prop = await db.property.findUnique({
      where: { id: property.id },
      select: { id: true, premiumFeatures: true },
    });
    const premium = parsePremiumFeatures(prop?.premiumFeatures);
    if (!premium?.enableLateCheckout) {
      return NextResponse.json(
        { error: "Le départ tardif n'est pas proposé pour ce logement." },
        { status: 403 },
      );
    }
    if (!premium.lateCheckoutPrice || premium.lateCheckoutPrice <= 0) {
      return NextResponse.json(
        { error: 'Le tarif du départ tardif est fixé par votre hôte — utilisez la demande simple.' },
        { status: 400 },
      );
    }

    // ── Booking OBLIGATOIRE (anti IDOR + anti-paiement-orphelin) ──
    // AUDIT PRÉ-PROD : sans séjour lié, le webhook ne peut marquer AUCUN
    // booking PAID ni notifier qui que ce soit (argent encaissé dans le
    // vide). Le séjour est exigé et validé par bien.
    const bookingId = parsed.data.bookingId?.trim().slice(0, 60) || null;
    if (!bookingId) {
      return NextResponse.json(
        { error: 'Séjour introuvable : ouvrez votre Hub via votre lien de séjour pour payer le départ tardif.' },
        { status: 400 },
      );
    }
    const b = await db.booking.findFirst({
      where: { id: bookingId, propertyId: property.id, status: { not: 'CANCELLED' } },
      select: { id: true, guestName: true, guestEmail: true, lateCheckoutStatus: true },
    });
    if (!b) {
      return NextResponse.json({ error: 'Séjour introuvable pour ce logement.' }, { status: 404 });
    }
    if (b.lateCheckoutStatus === 'PAID') {
      return NextResponse.json({ error: 'Le départ tardif est déjà réglé. Merci !' }, { status: 409 });
    }
    const booking = b;

    const guestName = booking?.guestName ?? parsed.data.guestName?.trim().slice(0, 80) ?? null;
    const amount = premium.lateCheckoutPrice;
    // v4.44 — heure de fin configurée par l'hôte (défaut 14 h).
    const lateHourLabel = `${premium.lateCheckoutHour ?? 14} h`;

    // ── Stripe Checkout Session (mode payment) ──
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Paiement indisponible : configuration Stripe manquante. Utilisez la demande simple.', code: 'STRIPE_NOT_CONFIGURED' },
        { status: 503 },
      );
    }

    const origin = resolveOrigin(req);
    const guestParams = booking ? `b=${encodeURIComponent(booking.id)}&` : '';
    const successUrl = `${origin}/app/hub/${encodeURIComponent(slug)}/guest?${guestParams}paid=latecheckout`;
    const cancelUrl = `${origin}/app/hub/${encodeURIComponent(slug)}/guest?${guestParams}paycancel=latecheckout`;

    let sessionUrl: string | null = null;
    let sessionId: string | null = null;
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
              // Montant SERVEUR (lateCheckoutPrice) — jamais fourni par le client
              unit_amount: Math.round(amount * 100),
              product_data: {
                name: `Late check-out ${lateHourLabel} — ${property.name}`,
                description: `Départ tardif jusqu'à ${lateHourLabel} (au lieu de 11 h)${guestName ? ` — ${guestName}` : ''}.`,
              },
            },
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: 'late_checkout',
          propertyId: property.id,
          ...(booking ? { bookingId: booking.id } : {}),
          hubSlug: slug,
        },
      });
      sessionUrl = session.url ?? null;
      sessionId = session.id;
    } catch (error) {
      // Erreur Stripe (clé invalide, réseau, carte refusée à l'init…) :
      // message clair pour l'invité, trace serveur, jamais de throw.
      console.error('[late-checkout/pay] Stripe session failed:', error);
      await captureError('late_checkout.stripe_session', error, undefined, req);
      return NextResponse.json(
        { error: 'Le paiement est momentanément indisponible. Réessayez dans un instant ou envoyez une demande à votre hôte.' },
        { status: 502 },
      );
    }

    if (!sessionUrl) {
      return NextResponse.json(
        { error: 'Le paiement est momentanément indisponible. Réessayez dans un instant.' },
        { status: 502 },
      );
    }

    // Traçabilité : demande enregistrée (REQUESTED) — le webhook fera PAID.
    if (booking) {
      await db.booking
        .updateMany({
          where: { id: booking.id, lateCheckoutStatus: { not: 'PAID' } },
          data: { lateCheckoutStatus: 'REQUESTED' },
        })
        .catch(() => undefined);
    }

    console.log(`[late-checkout/pay] Session ${sessionId} créée pour ${property.name} (${amount} €)`);
    return NextResponse.json({ ok: true, mode: 'stripe', url: sessionUrl }, { status: 201 });
  } catch (error) {
    await captureError('late_checkout.pay', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}

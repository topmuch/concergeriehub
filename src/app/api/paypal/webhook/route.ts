// =============================================================
// POST /api/paypal/webhook — route PUBLIQUE brute (PayPal → serveur)
//
// CONTRAT SIGNATURE : le corps est lu en TEXTE BRUT (request.text())
// et transmis tel quel à la vérification crypto
// (POST /v1/notifications/verify-webhook-signature) — JAMAIS de
// re-sérialisation avant vérification.
//
// Événements gérés (cf. lib/paypal.ts handlePayPalWebhookEvent) :
//  - PAYMENT.SALE.COMPLETED        → prolonge currentPeriodEnd,
//                                    réactive si past_due (+ Transaction,
//                                    idempotent par id de vente)
//  - PAYMENT.BILLING.SUBSCRIPTION.CANCELLED / EXPIRED → 'cancelled'
//                                    + User.selectedPlan → 'free'
//  - PAYMENT.BILLING.SUBSCRIPTION.SUSPENDED → 'past_due'
//
// PAYPAL_WEBHOOK_ID présent → signature OBLIGATOIRE (400 sinon) ;
// absent → accepté en DEV uniquement, rejeté en production.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/error-monitor';
import {
  handlePayPalWebhookEvent,
  verifyPayPalWebhookSignature,
  type PayPalWebhookEvent,
} from '@/lib/paypal';

export async function POST(request: NextRequest) {
  try {
    // Corps BRUT — la vérification porte sur les octets reçus.
    const rawBody = await request.text();

    let event: PayPalWebhookEvent;
    try {
      event = JSON.parse(rawBody) as PayPalWebhookEvent;
    } catch {
      return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
    }

    const check = await verifyPayPalWebhookSignature(request.headers, rawBody);
    if (!check.verified) {
      console.error(`[paypal webhook] Signature refusée : ${check.reason ?? 'raison inconnue'}`);
      return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
    }

    await handlePayPalWebhookEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    // Ne jette jamais : PayPal retenterait indéfiniment un 5xx sur un
    // bug applicatif ; on trace (console + AuditLog) et on répond 200.
    await captureError('paypal.webhook', error, undefined, request);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

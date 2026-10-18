// =============================================================
// /api/stripe/webhook — route CANONIQUE du webhook Stripe.
// AUDIT PRÉ-PROD : la logique est déléguée à lib/stripe-webhook-core.ts
// (source de vérité unique partagée avec /api/webhooks/stripe legacy).
// =============================================================
import type { NextRequest } from 'next/server';
import { handleStripeWebhook } from '@/lib/stripe-webhook-core';

export async function POST(request: NextRequest) {
  return handleStripeWebhook(request);
}

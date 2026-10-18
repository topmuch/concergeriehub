// =============================================================
// /api/webhooks/stripe — webhook Stripe LEGACY (V1).
// AUDIT PRÉ-PROD — BLOQUANT corrigé : cette route avait ses propres
// handlers V1 (metadata subscriberId) SANS support serviceOrderId ni
// late_checkout → si Stripe pointait cette URL, les paiements
// commandes/late check-out étaient encaissés sans jamais être
// confirmés. DÉSORMAIS : délègue à lib/stripe-webhook-core.ts —
// les deux URLs exécutent EXACTEMENT le même code.
// =============================================================
import type { NextRequest } from 'next/server';
import { handleStripeWebhook } from '@/lib/stripe-webhook-core';

export async function POST(request: NextRequest) {
  return handleStripeWebhook(request);
}

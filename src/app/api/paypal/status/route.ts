// =============================================================
// GET /api/paypal/status — PayPal est-il activé sur cet environnement ?
//
// Route publique minimaliste (n'expose QUE le flag + l'env) : l'UI
// billing l'interroge au montage pour savoir si elle doit afficher les
// boutons « Payer avec PayPal ». Sans PAYPAL_CLIENT_ID/SECRET →
// { enabled: false } et l'UI reste IDENTIQUE à aujourd'hui (Stripe/démo).
// =============================================================
import { NextResponse } from 'next/server';
import { isPayPalConfigured, payPalEnv } from '@/lib/paypal';

export async function GET() {
  const enabled = isPayPalConfigured();
  return NextResponse.json({
    enabled,
    env: enabled ? payPalEnv() : null,
  });
}

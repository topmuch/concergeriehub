// =============================================================
// POST /api/paypal/public-activate — création du compte hôte APRÈS
// approbation PayPal d'un achat PUBLIC Solo/Pro (v5.17).
//
// body { token, email, password, fullName }
//   1. vérifie la trace PayPalPendingSubscription + la souscription
//      PayPal (statut ACTIVE, custom_id `public:<id>` — anti-forgery,
//      cf. lib/hub-fulfillment.ts) ;
//   2. crée le compte hôte (ou rattache après vérification email +
//      mot de passe) + Subscription + Transaction + selectedPlan ;
//   3. renvoie { ok } → redirection vers /airbnb/dashboard.
//
// PUBLIC (l'acheteur n'a pas encore de session) — rateLimit 6/min/IP.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { activateHubPurchase } from '@/lib/hub-fulfillment';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!(await rateLimit(`paypal-public-activate:${ip}`, 8))) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      email?: string;
      password?: string;
      fullName?: string;
    };
    if (!body.token) {
      return NextResponse.json({ error: 'Jeton manquant.' }, { status: 400 });
    }

    const result = await activateHubPurchase({
      token: body.token,
      email: body.email ?? '',
      password: body.password ?? '',
      fullName: body.fullName ?? '',
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Activation impossible." },
        { status: result.status },
      );
    }

    return NextResponse.json(
      { ok: true, attachedToExisting: result.attachedToExisting ?? false },
      { status: 200 },
    );
  } catch (error) {
    console.error('[paypal/public-activate] failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

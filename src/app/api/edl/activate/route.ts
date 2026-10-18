// =============================================================
// POST /api/edl/activate — Création du compte après paiement EDL
// (PUBLIC — le jeton d'activation reçu après le paiement PayPal est
// l'authentification du parcours).
//
// Body : { token, email, password, fullName }
//   → jeton valide + achat 'paid' + jeton non expiré
//   → crée le compte (rôle 'user', EDL-only) + abonnement 1 an
//     OU rattache l'abonnement à un compte existant (email + mot de
//     passe corrects).
//   → le client s'authensuite ensuite via /api/auth/callback
//     (formulaire d'activation → signIn automatique).
//
// Anti-abus : rateLimit 6/min/IP ; politique mot de passe identique
// au register (8+ caractères, lettres + chiffres).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { activateEdlPurchase, edlActivateRateLimit } from '@/lib/edl-fulfillment';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!(await edlActivateRateLimit(ip))) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { token?: string; email?: string; password?: string; fullName?: string }
    | null;
  if (!body?.token || !body.email || !body.password || !body.fullName) {
    return NextResponse.json(
      { error: 'Renseignez votre nom, votre email et un mot de passe.' },
      { status: 400 },
    );
  }

  const result = await activateEdlPurchase({
    token: body.token,
    email: body.email,
    password: body.password,
    fullName: body.fullName,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'Activation impossible.' },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, attachedToExisting: Boolean(result.attachedToExisting) });
}

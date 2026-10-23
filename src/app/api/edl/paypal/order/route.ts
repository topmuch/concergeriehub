// =============================================================
// POST /api/edl/paypal/order — Création de commande PayPal pour les
// offres « États des Lieux » (PUBLIC — parcours d'achat depuis la
// page d'accueil, SANS session).
//
// v5.17 — 2 offres (body { plan }) :
//   - 'edl_annual'      : 299 €/an pour 3 biens  (défaut)
//   - 'edl_pro_annual'  : 499 €/an jusqu'à 15 biens
//
// 1. crée la ligne EdlPurchase (status 'created', jeton
//    d'activation 72 h, orderRef unique, plan) ;
// 2. crée la commande PayPal (Orders v2, CAPTURE, prix du plan) ;
// 3. renvoie { approveUrl } — le client est redirigé vers PayPal.
//
// Le retour se fait sur /edl/paiement/retour (page serveur qui
// capture et délivre le lien d'activation).
//
// Sans clés PayPal (env) → 503 « paiement en cours d'activation ».
// Anti-abus : rateLimit 6/min/IP.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { resolveOrigin } from '@/lib/site';
import {
  EDL_PLAN,
  createEdlPayPalOrder,
  getEdlPlan,
  isEdlPayPalConfigured,
} from '@/lib/edl-paypal';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!(await rateLimit(`edl-order:${ip}`, 6))) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429 },
    );
  }

  if (!isEdlPayPalConfigured()) {
    return NextResponse.json(
      { error: "Le paiement PayPal sera activé d'ici quelques instants. Réessayez bientôt." },
      { status: 503 },
    );
  }

  try {
    // Offre demandée : 'edl_annual' (défaut) ou 'edl_pro_annual'.
    const body = (await req.json().catch(() => ({}))) as { plan?: string };
    const planConfig = getEdlPlan(body.plan ?? EDL_PLAN);
    if (!planConfig) {
      return NextResponse.json({ error: 'Offre inconnue' }, { status: 400 });
    }

    const orderRef = `edl-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
    const activationToken = randomBytes(24).toString('base64url');

    // Ligne d'achat créée AVANT l'appel PayPal : toute commande
    // acceptée par PayPal a sa trace en base (réconciliation).
    const purchase = await db.edlPurchase.create({
      data: {
        orderRef,
        plan: planConfig.id,
        amountEur: planConfig.price,
        status: 'created',
        activationToken,
        activationExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
      select: { id: true, orderRef: true },
    });

    const origin = resolveOrigin(req);
    const order = await createEdlPayPalOrder({
      orderRef,
      plan: planConfig.id,
      returnUrl: `${origin}/edl/paiement/retour?ref=${encodeURIComponent(orderRef)}`,
      cancelUrl: `${origin}/edl/abonnement?plan=${planConfig.id}&annule=1`,
    });

    if (!order.ok || !order.data) {
      // Commande PayPal refusée → la trace reste 'created' (audit).
      console.error('[edl/paypal/order] create failed:', order.error);
      return NextResponse.json(
        { error: 'PayPal est momentanément indisponible. Réessayez dans un instant.' },
        { status: 502 },
      );
    }

    await db.edlPurchase.update({
      where: { id: purchase.id },
      data: { paypalOrderId: order.data.orderId },
    });

    return NextResponse.json({ ok: true, approveUrl: order.data.approveUrl });
  } catch (error) {
    console.error('[edl/paypal/order] failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

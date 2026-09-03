import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  ensureExpressAccount,
  getStripe,
  refreshProviderConnectState,
  stripeConnectEnabled,
} from '@/lib/stripe-connect';

// =============================================================
// ÉTAPE 20 (V3) — Stripe Connect : onboarding des prestataires
//
//   GET  /api/stripe/onboarding → statut Connect du prestataire
//        (rafraîchit charges_enabled auprès de Stripe si une clé est
//        configurée ; sinon état local)
//
//   POST /api/stripe/onboarding → crée (idempotent) le compte Express
//        puis un AccountLink d'onboarding → { url } (redirection)
//        - sans STRIPE_SECRET_KEY : 503 en production ; en dev, mode
//          DÉMO qui simule un compte onboardé (même chemin UI).
//
// Accès : session prestataire active uniquement (rôle métier Provider).
// =============================================================

async function resolveProvider(userId: string) {
  return db.provider.findUnique({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      isActive: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      user: { select: { email: true } },
    },
  });
}

function maskAccountId(id: string): string {
  if (id.length <= 10) return 'acct_••••';
  return `${id.slice(0, 8)}••••${id.slice(-4)}`;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
    }
    const provider = await resolveProvider(userId);
    if (!provider || !provider.isActive) {
      return NextResponse.json({ error: 'Aucun profil prestataire actif.' }, { status: 403 });
    }

    // Avec clés : le statut Stripe fait foi (onboarding complété hors
    // plateforme → charges_enabled devient true ici).
    const state = await refreshProviderConnectState(provider.id);

    return NextResponse.json({
      connect: {
        available: stripeConnectEnabled,
        onboarded: state.onboarded,
        chargesEnabled: state.chargesEnabled,
        maskedAccountId: state.stripeAccountId ? maskAccountId(state.stripeAccountId) : null,
      },
    });
  } catch (error) {
    console.error('[stripe/onboarding GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
    }
    const provider = await resolveProvider(userId);
    if (!provider || !provider.isActive) {
      return NextResponse.json({ error: 'Aucun profil prestataire actif.' }, { status: 403 });
    }

    // ── MODE DÉMO (dev sans clés) : simule un compte onboardé ──
    if (!stripeConnectEnabled) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { error: 'Stripe Connect indisponible : configuration manquante.' },
          { status: 503 },
        );
      }
      const demoId = provider.stripeAccountId ?? `acct_demo_${provider.id.slice(0, 12)}`;
      await db.provider.update({
        where: { id: provider.id },
        data: {
          stripeAccountId: demoId,
          stripeChargesEnabled: true,
          ...(provider.stripeChargesEnabled ? {} : { stripeOnboardedAt: new Date() }),
        },
      });
      return NextResponse.json({ ok: true, mode: 'demo', onboarded: true, chargesEnabled: true });
    }

    // ── STRIPE RÉEL : compte Express + AccountLink ──
    const origin = req.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const accountId = await ensureExpressAccount({
      providerId: provider.id,
      businessName: provider.businessName,
      email: provider.user.email,
      existingAccountId: provider.stripeAccountId,
    });

    const stripe = await getStripe();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/provider?connect=refresh`,
      return_url: `${origin}/provider?connect=success`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ ok: true, mode: 'stripe', url: link.url }, { status: 201 });
  } catch (error) {
    console.error('[stripe/onboarding POST] Error:', error);
    return NextResponse.json(
      { error: "Impossible d'initialiser l'onboarding Stripe. Réessayez dans un instant." },
      { status: 500 },
    );
  }
}

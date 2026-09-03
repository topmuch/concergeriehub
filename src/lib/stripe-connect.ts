import { db } from '@/lib/db';
import { computeSplit, DEFAULT_COMMISSION_RATE } from '@/lib/orders';

// =============================================================
// ÉTAPE 20 (V3) — Stripe Connect & Payouts (serveur UNIQUEMENT)
//
// Modèle « destination charge » :
//   - l'invité paie UNE session Checkout sur le compte plateforme ;
//   - si le prestataire est onboardé (charges_enabled), la session
//     porte payment_intent_data.application_fee_amount (commission
//     plateforme) + transfer_data.destination (compte Express du
//     prestataire) → reversement AUTOMATIQUE par Stripe ;
//   - sinon, modèle 17.6 inchangé : encaissement intégral plateforme,
//     reversement manuel futur.
//
// Autorité serveur : le taux de commission appliqué est TOUJOURS
// recalculé ici (jamais lu de metadata client/Stripe).
// =============================================================

export const stripeConnectEnabled = Boolean(process.env.STRIPE_SECRET_KEY);

export async function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY manquante');
  }
  const Stripe = (await import('stripe')).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

/** Commission plateforme (€) retenue sur un paiement Connect. */
export function computePlatformFee(totalAmount: number): number {
  return computeSplit(totalAmount, DEFAULT_COMMISSION_RATE).commission;
}

/** Commission plateforme en CENTIMES (format Stripe application_fee_amount). */
export function computeApplicationFeeCents(totalAmount: number): number {
  return Math.round(computePlatformFee(totalAmount) * 100);
}

export interface ProviderConnectState {
  onboarded: boolean;      // un compte Express est rattaché
  chargesEnabled: boolean; // Stripe confirme la capacité d'encaissement
  stripeAccountId: string | null;
}

/** Statut Connect d'un prestataire (base locale, sans appel réseau). */
export async function getProviderConnectState(providerId: string): Promise<ProviderConnectState> {
  const provider = await db.provider.findUnique({
    where: { id: providerId },
    select: { stripeAccountId: true, stripeChargesEnabled: true },
  });
  if (!provider?.stripeAccountId) {
    return { onboarded: false, chargesEnabled: false, stripeAccountId: null };
  }
  return {
    onboarded: true,
    chargesEnabled: provider.stripeChargesEnabled,
    stripeAccountId: provider.stripeAccountId,
  };
}

/**
 * Rafraîchit le statut réel du compte Express auprès de Stripe
 * (charges_enabled / payouts_enabled) et le persiste en base.
 * Retourne l'état à jour — jamais throw (réseau indisponible → état local).
 */
export async function refreshProviderConnectState(providerId: string): Promise<ProviderConnectState> {
  const local = await getProviderConnectState(providerId);
  if (!stripeConnectEnabled || !local.stripeAccountId) return local;
  try {
    const stripe = await getStripe();
    const account = await stripe.accounts.retrieve(local.stripeAccountId);
    const chargesEnabled = Boolean(account.charges_enabled);
    if (chargesEnabled !== local.chargesEnabled) {
      await db.provider.update({
        where: { id: providerId },
        data: {
          stripeChargesEnabled: chargesEnabled,
          ...(chargesEnabled ? { stripeOnboardedAt: new Date() } : {}),
        },
      });
    }
    return { onboarded: true, chargesEnabled, stripeAccountId: local.stripeAccountId };
  } catch (error) {
    console.error('[stripe-connect] refreshProviderConnectState:', error);
    return local;
  }
}

/** Crée (idempotent) le compte Express du prestataire. */
export async function ensureExpressAccount(params: {
  providerId: string;
  businessName: string;
  email: string;
  existingAccountId: string | null;
}): Promise<string> {
  const stripe = await getStripe();
  if (params.existingAccountId) {
    return params.existingAccountId;
  }
  const account = await stripe.accounts.create({
    type: 'express',
    business_profile: { name: params.businessName.slice(0, 60) },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { providerId: params.providerId, platform: 'conciergerie-hub' },
  });
  await db.provider.update({
    where: { id: params.providerId },
    data: { stripeAccountId: account.id },
  });
  return account.id;
}

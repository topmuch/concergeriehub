// =============================================================
// Catalogue d'abonnements HÔTE — RoomScan (ÉTAPE 10)
//
// Offres (v5.17 — demande client, plus d'essai gratuit, 100 %
// PayPal Subscriptions depuis la page d'accueil) :
//  - Airbnb Solo : 29 €/mois (1 logement)
//  - Airbnb Pro  : 99 €/mois (conciergeries & multi-hôtes)
//  (facturation annuelle retirée du catalogue — les couples
//   (plan, cycle) offerts = prix non null ci-dessous)
//
// Les prix sont exprimés en euros. Utilisable côté client
// (affichage) comme côté serveur (validation + PayPal).
// =============================================================

export type HostPlanId = 'airbnb_solo' | 'airbnb_pro';
export type BillingCycle = 'monthly' | 'annual';

export interface HostPlan {
  id: HostPlanId;
  name: string;
  emoji: string;
  description: string;
  /** Prix par cycle — null = cycle non proposé */
  prices: { monthly: number | null; annual: number | null };
  maxProperties: number;
  highlight: boolean;
  badge?: string;
  features: { text: string; included: boolean }[];
}

export const HOST_PLANS: HostPlan[] = [
  {
    id: 'airbnb_solo',
    name: 'Airbnb Solo',
    emoji: '⭐',
    description: "Sublimez l'expérience de vos invités sur votre logement principal.",
    prices: { monthly: 29, annual: null },
    maxProperties: 1,
    highlight: true,
    badge: 'Le plus choisi',
    features: [
      { text: '1 Plaque QR Hub', included: true },
      { text: 'Wi-Fi & guidebook illimités', included: true },
      { text: 'Module upselling de base', included: true },
      { text: 'Support par email', included: true },
      { text: 'Analytics essentiels', included: true },
      { text: 'Multi-biens & équipe', included: false },
    ],
  },
  {
    id: 'airbnb_pro',
    name: 'Airbnb Pro',
    emoji: '🏢',
    description: 'Pour les gestionnaires et co-hôtelleries multi-biens.',
    prices: { monthly: 99, annual: null },
    maxProperties: 10,
    highlight: false,
    badge: 'Multi-biens',
    features: [
      { text: "Jusqu'à 10 logements", included: true },
      { text: 'Tous les modules Solo inclus', included: true },
      { text: 'Équipe : co-hôtes, staff, cleaning', included: true },
      { text: 'Plaques QR gravées incluses', included: true },
      { text: 'Statistiques multi-biens', included: true },
      { text: 'Support prioritaire dédié', included: true },
      { text: 'API & Webhooks', included: true },
    ],
  },
];

export function getHostPlan(id: string): HostPlan | undefined {
  return HOST_PLANS.find((p) => p.id === id);
}

/** Prix applicable pour un couple (plan, cycle) — null si non proposé. */
export function planPrice(plan: HostPlan, cycle: BillingCycle): number | null {
  return plan.prices[cycle];
}

/** Équivalent mensuel (pour l'affichage "soit X €/mois"). */
export function monthlyEquivalent(plan: HostPlan, cycle: BillingCycle): number | null {
  const price = plan.prices[cycle];
  if (price === null) return null;
  return cycle === 'annual' ? Math.round((price / 12) * 100) / 100 : price;
}

/** Formatage € à la française (34,73 €). */
export function formatEur(amount: number): string {
  return `${amount.toLocaleString('fr-FR', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

/**
 * Libellés humains du statut d'abonnement.
 * Statuts DB : 'active' | 'past_due' | 'cancelled' | 'trialing'
 */
export function subscriptionStatusMeta(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'active':
      return { label: 'Actif', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'trialing':
      return { label: 'Essai', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'past_due':
      return { label: 'Paiement échoué', className: 'bg-red-50 text-red-700 border-red-200' };
    case 'cancelled':
      return { label: 'Résilié', className: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return { label: status, className: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

/** Plan d'affichage pour un compte sans abonnement payant. */
export const FREE_PLAN_LABEL = 'Découverte (gratuit)';

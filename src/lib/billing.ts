// =============================================================
// Catalogue d'abonnements HÔTE — Conciergerie Hub (ÉTAPE 10)
//
// Offres du spec :
//  - Airbnb Solo : 9,90 €/mois OU 99 €/an (mise en avant)
//  - Airbnb Pro  : 199 €/an uniquement (multi-biens)
//  ("Famille" B2C du clone d'origine absorbée par le palier
//   gratuit "Découverte" — pivot 100 % B2B)
//
// Les prix sont exprimés en euros. Utilisable côté client
// (affichage) comme côté serveur (validation + Stripe).
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
    prices: { monthly: 9.9, annual: 99 },
    maxProperties: 1,
    highlight: true,
    badge: 'Le plus choisi',
    features: [
      { text: '1 logement, pièces illimitées', included: true },
      { text: 'Wi-Fi, Guidebook, check-out', included: true },
      { text: 'Mode Hôte protégé par PIN', included: true },
      { text: 'Plaque QR en aluminium gravée', included: true },
      { text: 'Annuaire de prestataires géolocalisés', included: true },
      { text: 'Répondeur vocal invités', included: true },
      { text: 'Statistiques de scans', included: true },
      { text: 'Multi-biens & équipe', included: false },
    ],
  },
  {
    id: 'airbnb_pro',
    name: 'Airbnb Pro',
    emoji: '🏢',
    description: 'Pour les gestionnaires et co-hôtelleries multi-biens.',
    prices: { monthly: null, annual: 199 },
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

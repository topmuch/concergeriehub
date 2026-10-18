// =============================================================
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » — tarif + libellés
// partagés (route publique /laundry/order, webhook Stripe, UI hôte).
// Les tarifs sont la source de vérité SERVEUR — jamais cru côté client.
// =============================================================

export type LaundryServiceType = 'ironing' | 'washing' | 'drycleaning';

export const LAUNDRY_PRICES: Record<
  LaundryServiceType,
  { unitPrice: number; unit: string; label: string; delay: string; emoji: string; description: string }
> = {
  ironing: {
    unitPrice: 5,
    unit: 'pièce',
    label: 'Repassage Express',
    delay: 'Retour en 4 h',
    emoji: '👔',
    description: 'Chemises et vêtements professionnels',
  },
  washing: {
    unitPrice: 15,
    unit: 'panier',
    label: 'Lessive Complète',
    delay: 'Retour en 24 h',
    emoji: '🧺',
    description: 'Lavage, séchage, pliage',
  },
  drycleaning: {
    unitPrice: 8,
    unit: 'pièce',
    label: 'Pressing à Sec',
    delay: 'Retour en 48 h',
    emoji: '🧥',
    description: 'Costumes, robes délicates',
  },
};

/** Libellé du créneau de récupération (matin / après-midi). */
export function pickupSlotLabel(slot: string): string {
  return slot === 'afternoon' ? 'cet après-midi' : 'ce matin';
}

/** Libellé humain d'un service (webhook, notifications, PDF). */
export function laundryServiceLabel(serviceType: string): string {
  return LAUNDRY_PRICES[serviceType as LaundryServiceType]?.label ?? serviceType;
}

/** Libellé d'une commande (quantité adaptée : panier vs pièces). */
export function laundryOrderSummary(serviceType: string, pieces: number): string {
  const t = LAUNDRY_PRICES[serviceType as LaundryServiceType];
  if (!t) return serviceType;
  return serviceType === 'washing'
    ? `${t.label} (1 panier)`
    : `${t.label} × ${pieces} ${t.unit}${pieces > 1 ? 's' : ''}`;
}

/** Statuts d'une commande pressing (affichage hôte). */
export const LAUNDRY_STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: 'Paiement en cours', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  REQUESTED: { label: 'Demandée', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PAID: { label: 'Réglée ✅', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  IN_PROGRESS: { label: 'En cours', className: 'bg-orange-50 text-orange-800 border-orange-200' },
  READY: { label: 'Prête à livrer', className: 'bg-teal-50 text-teal-800 border-teal-200' },
  DELIVERED: { label: 'Livrée', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CANCELLED: { label: 'Annulée', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

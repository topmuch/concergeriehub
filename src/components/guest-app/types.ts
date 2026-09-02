// =============================================================
// ÉTAPE 16 (V3) — Types partagés de l'App Invitée PWA
// (miroir du payload de /api/public/guest-app)
// ÉTAPE 17.2 — unitPrice (commande transactionnelle) + GuestOrder
// (miroir du GET /api/public/service-orders)
// ÉTAPE 17.5 — GuestServiceOffer : catalogue fin par bien (offre
// précise = offerId, prix re-résolu serveur au POST).
// ÉTAPE 17.6 — paymentStatus (paiement in-app, miroir du GET).
// ÉTAPE 19 — branding white-label (miroir du GET).
// =============================================================

import type { PropertyBranding } from '@/lib/branding';

/** ÉTAPE 19 — marque de la conciergerie (white-label). */
export type GuestBranding = PropertyBranding;

/** Offre du catalogue fin d'un prestataire pour CE bien (17.5). */
export interface GuestServiceOffer {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  unit: string;
}

export interface GuestService {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  description: string;
  priceLabel: string;
  /** Prix numérique de l'offre standard (null → "Sur devis" → email). */
  unitPrice: number | null;
  /** Catalogue fin du prestataire pour CE bien — prioritaire sur l'offre standard. */
  offers: GuestServiceOffer[];
}

export type GuestOrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'DELIVERED' | 'CANCELLED';

/** ÉTAPE 17.6 — statut de paiement (orthogonal au cycle de vie). */
export type GuestPaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED' | 'FAILED';

export interface GuestOrder {
  id: string;
  status: GuestOrderStatus;
  paymentStatus: GuestPaymentStatus;
  totalAmount: number;
  items: { name: string; qty: number; unitPrice: number }[] | unknown;
  deliveryDate: string | null;
  createdAt: string;
  provider: { businessName: string; category: string };
}

export interface GuestBookingInfo {
  guestName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface GuestPayload {
  active: boolean;
  /** ÉTAPE 19 — white-label (toujours présent, défauts plateforme). */
  branding: GuestBranding;
  property: {
    id: string;
    name: string;
    propertyType: string;
    propertyTypeLabel: string;
    propertyTypeEmoji: string;
    address: string | null;
  };
  ownerName: string | null;
  guest: {
    wifi: { networkName: string; password: string; securityType: string } | null;
    guidebook: { slug: string | null; title: string; body: string } | null;
    houseRules: string[] | null;
    services: GuestService[];
    booking: GuestBookingInfo | null;
    contact: { name: string; phone: string | null; email: string | null };
  };
}

export type GuestTab = 'home' | 'guide' | 'services' | 'help';

export const GUEST_TABS: { id: GuestTab; emoji: string; label: string }[] = [
  { id: 'home', emoji: '🏠', label: 'Accueil' },
  { id: 'guide', emoji: '📖', label: 'Guide' },
  { id: 'services', emoji: '🥐', label: 'Services' },
  { id: 'help', emoji: '🚨', label: 'Aide' },
];

/** Format FR court : "lun. 1 sept." */
export function formatFrDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

/** Nombre de jours avant la date ISO (arrondi, min 0). */
export function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

/** Métadonnées statut commande (chips invité) — lib orders côté serveur. */
export const GUEST_ORDER_STATUS_META: Record<GuestOrderStatus, { label: string; emoji: string; className: string }> = {
  PENDING: { label: 'En attente', emoji: '🟡', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40' },
  CONFIRMED: { label: 'Confirmée', emoji: '🔵', className: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/40' },
  PREPARING: { label: 'En préparation', emoji: '🟠', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40' },
  DELIVERED: { label: 'Livrée', emoji: '🟢', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40' },
  CANCELLED: { label: 'Annulée', emoji: '⚪', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-400/30' },
};

/** ÉTAPE 17.6 — métadonnées badge paiement (chips invité). */
export const GUEST_PAYMENT_STATUS_META: Record<GuestPaymentStatus, { label: string; emoji: string; className: string }> = {
  PAID: { label: 'Payée', emoji: '💳', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40' },
  UNPAID: { label: 'À payer', emoji: '💳', className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40' },
  REFUNDED: { label: 'Remboursée', emoji: '↩️', className: 'bg-muted text-muted-foreground border-border' },
  FAILED: { label: 'Paiement échoué', emoji: '⚠️', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-400/30' },
};

/** Format FR : "36,00 €" */
export function formatEurGuest(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

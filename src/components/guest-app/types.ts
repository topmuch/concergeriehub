// =============================================================
// ÉTAPE 16 (V3) — Types partagés de l'App Invitée PWA
// (miroir du payload de /api/public/guest-app)
// =============================================================

export interface GuestService {
  id: string;
  name: string;
  emoji: string;
  categoryLabel: string;
  description: string;
  priceLabel: string;
}

export interface GuestBookingInfo {
  guestName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export interface GuestPayload {
  active: boolean;
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

// =============================================================
// DASHBOARD « ÉTAT DES LIEUX » (module standalone) — TYPES & OUTILS
// Contrat de l'API /api/inspection/list + helpers de formatage
// et métadonnées de statut (aucune icône : dots CSS typographiques).
// =============================================================

/** Ligne d'inspection renvoyée par /api/inspection/list. */
export interface InspectionRow {
  id: string;
  propertyName: string;
  propertyAddress: string;
  ownerName: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  type: string; // 'ENTREE' | 'SORTIE'
  scheduledDate: string;
  status: string; // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  publicToken: string;
  cleanlinessScore: string | null; // 'IMPECCABLE' | 'CORRECT' | 'A_NETTOYER' | 'TRES_SALE'
  sha256Hash: string | null; // empreinte du document signé (null si PENDING)
  shareUrl: string;
  photoCount: number;
  completedAt: string | null;
  createdAt: string;
  linkedInspectionId: string | null;
}

/** Statut de l'abonnement au module (299 €/an). */
export interface InspectionSubscriptionState {
  status: string; // 'active' | 'cancelled'
  plan: string;
  endDate: string;
}

/** Réponse complète de /api/inspection/list. */
export interface InspectionListResponse {
  subscription: InspectionSubscriptionState;
  inspections: InspectionRow[];
}

/** Profil de l'hôte (étape 1 de l'onboarding, persisté en localStorage). */
export interface EdlProfile {
  fullName: string;
  email: string;
}

export const EDL_PROFILE_KEY = 'edl_profile';

/** Métadonnées de statut d'inspection (couleurs Saphir Luxe). */
export const INSPECTION_STATUS_META: Record<
  string,
  { label: string; badgeClass: string; dotColor: string }
> = {
  PENDING: {
    label: 'En attente',
    badgeClass: 'border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]',
    dotColor: '#fbbf24',
  },
  IN_PROGRESS: {
    label: 'En cours',
    badgeClass: 'border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-[#2dd4bf]',
    dotColor: '#2dd4bf',
  },
  COMPLETED: {
    label: 'Terminé',
    badgeClass: 'border-[#34d399]/30 bg-[#34d399]/10 text-[#34d399]',
    dotColor: '#34d399',
  },
  CANCELLED: {
    label: 'Annulé',
    badgeClass: 'border-white/20 bg-white/5 text-[#8fabc2]',
    dotColor: '#8fabc2',
  },
};

/** Badge de type : ENTRÉE teal / SORTIE corail. */
export const TYPE_BADGE: Record<string, string> = {
  ENTREE: 'border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-[#2dd4bf]',
  SORTIE: 'border-[#f07d6a]/30 bg-[#f07d6a]/10 text-[#f07d6a]',
};

/** Date + heure courte en français (ex. « 14 févr. 2026, 10:00 »). */
export function formatFrDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Date seule en français (ex. « 14 février 2026 »). */
export function formatFrDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** Formate une Date pour un input datetime-local (YYYY-MM-DDTHH:mm). */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Demain 10:00 — valeur par défaut du champ « Date visée ». */
export function defaultScheduledDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toDatetimeLocalValue(d);
}

/** Lien WhatsApp pré-rempli pour l'invité. */
export function whatsappLink(guestName: string, shareUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(
    `Bonjour ${guestName}, voici votre état des lieux : ${shareUrl}`,
  )}`;
}

/** Lien mailto pré-rempli pour l'invité. */
export function mailtoLink(guestEmail: string, guestName: string, shareUrl: string): string {
  const subject = 'Votre état des lieux — RoomScan';
  const body = `Bonjour ${guestName},\n\nVoici votre état des lieux : ${shareUrl}\n\nVous pourrez y vérifier chaque pièce, ajouter des photos et signer électroniquement.\n\nÀ très bientôt,`;
  return `mailto:${guestEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// =============================================================
// « DEMANDES PARTICULIÈRES » (v5.x) — méta partagées invité/hôte
//
// L'invité du Hub demande un équipement ou un service à l'hôte
// (lit d'appoint, lit bébé, siège bébé, serviettes supplémentaires…).
// Cette source unique décrit les types de demandes (model Prisma
// SpecialRequest.itemType — ne JAMAIS étendre ici sans le schéma) et
// les statuts de traitement, pour que la carte du Hub, l'API hôte et
// le panneau de suivi affichent exactement les mêmes libellés.
// =============================================================

export interface SpecialRequestItemMeta {
  id: string;
  emoji: string;
  label: string;
}

/** Types de demande (SpecialRequest.itemType) — ordre = ordre d'affichage. */
export const SPECIAL_REQUEST_ITEMS: SpecialRequestItemMeta[] = [
  { id: 'extra_bed', emoji: '🛏️', label: "Lit d'appoint" },
  { id: 'baby_crib', emoji: '👶', label: 'Lit bébé' },
  { id: 'baby_seat', emoji: '🚗', label: 'Siège bébé' },
  { id: 'high_chair', emoji: '🪑', label: 'Chaise haute' },
  { id: 'towels', emoji: '🧺', label: 'Serviettes supplémentaires' },
  { id: 'iron', emoji: '👔', label: 'Fer & table à repasser' },
  { id: 'cleaning', emoji: '🧹', label: 'Ménage' },
  { id: 'other', emoji: '✨', label: 'Autre' },
];

/** ids valides pour la validation zod des routes API. */
export const SPECIAL_REQUEST_ITEM_IDS = SPECIAL_REQUEST_ITEMS.map((i) => i.id);

/** Méta tolérante d'un type (types inconnus → « Autre », jamais throw). */
export function specialRequestItemMeta(id: string): SpecialRequestItemMeta {
  return (
    SPECIAL_REQUEST_ITEMS.find((i) => i.id === id) ?? {
      id,
      emoji: '✨',
      label: 'Demande particulière',
    }
  );
}

export interface SpecialRequestStatusMeta {
  label: string;
  /** Classes badge (hub invité, thème clair/sombre). */
  className: string;
  /** Couleur de pastille (dashboard hôte Saphir Luxe). */
  dot: string;
}

/** Statuts de traitement (SpecialRequest.status). */
export const SPECIAL_REQUEST_STATUS_META: Record<string, SpecialRequestStatusMeta> = {
  pending: {
    label: 'En attente',
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30',
    dot: '#fbbf24',
  },
  in_progress: {
    label: 'En cours',
    className:
      'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30',
    dot: '#2dd4bf',
  },
  done: {
    label: 'Traité',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30',
    dot: '#34d399',
  },
  cancelled: {
    label: 'Annulé',
    className:
      'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300 border border-slate-200 dark:border-white/15',
    dot: '#8fabc2',
  },
};

/** Méta tolérante d'un statut (statut inconnu → « En attente »-like). */
export function specialRequestStatusMeta(status: string): SpecialRequestStatusMeta {
  return SPECIAL_REQUEST_STATUS_META[status] ?? SPECIAL_REQUEST_STATUS_META.pending;
}

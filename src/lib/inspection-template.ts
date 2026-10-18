// =============================================================
// MODULE STANDALONE « ÉTAT DES LIEUX » (v4.97) — LIB PARTAGÉE
//
// Source unique des constantes du module indépendant (299 €/an) :
//   • types d'inspection (ENTRÉE / SORTIE) ;
//   • 4 états possibles d'une pièce ou d'un équipement ;
//   • 4 niveaux d'auto-évaluation de propreté ;
//   • template juridique FR des pièces + équipements (pré-rempli
//     à la création de chaque inspection) ;
//   • construction de l'URL publique de partage (/i/<token>).
// Utilisé par les routes API (création) ET le dashboard hôte.
// ZÉRO icône : typographie + glyphes purs uniquement.
// =============================================================

/** Types d'inspection proposés à la création. */
export const INSPECTION_TYPES = [
  { value: 'ENTREE', label: "État des lieux d'entrée" },
  { value: 'SORTIE', label: 'État des lieux de sortie' },
] as const;
export type InspectionTypeValue = (typeof INSPECTION_TYPES)[number]['value'];

/** Valeur de type valide (garde serveur). */
export function isInspectionType(v: unknown): v is InspectionTypeValue {
  return v === 'ENTREE' || v === 'SORTIE';
}

/** Libellé court affiché dans le dashboard (badge). */
export const INSPECTION_TYPE_LABEL: Record<InspectionTypeValue, string> = {
  ENTREE: 'Entrée',
  SORTIE: 'Sortie',
};

// ── États d'une pièce / d'un équipement ─────────────────────

export const STATE_VALUES = ['TRES_BON', 'BON', 'MOYEN', 'MAUVAIS'] as const;
export type InspectionStateValue = (typeof STATE_VALUES)[number];

export interface InspectionStateMeta {
  value: InspectionStateValue;
  label: string;
  /** Couleur hex du point CSS (aucune icône — pastilles typographiques). */
  color: string;
  /** Classes Tailwind du badge sur la nuit saphir. */
  badgeClass: string;
}

/** Méta des 4 états — couleurs Saphir Luxe (vert/teal/ambre/corail). */
export const STATE_META: Record<InspectionStateValue, InspectionStateMeta> = {
  TRES_BON: {
    value: 'TRES_BON',
    label: 'Très bon',
    color: '#34d399',
    badgeClass: 'border-[#34d399]/30 bg-[#34d399]/10 text-[#34d399]',
  },
  BON: {
    value: 'BON',
    label: 'Bon',
    color: '#2dd4bf',
    badgeClass: 'border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-[#2dd4bf]',
  },
  MOYEN: {
    value: 'MOYEN',
    label: 'Moyen',
    color: '#fbbf24',
    badgeClass: 'border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]',
  },
  MAUVAIS: {
    value: 'MAUVAIS',
    label: 'Mauvais',
    color: '#f07d6a',
    badgeClass: 'border-[#f07d6a]/30 bg-[#f07d6a]/10 text-[#f07d6a]',
  },
};

/** Garde tolérante : renvoie l'état si valide, sinon 'BON' (défaut DB). */
export function safeState(value: unknown): InspectionStateValue {
  return (STATE_VALUES as readonly string[]).includes(value as string)
    ? (value as InspectionStateValue)
    : 'BON';
}

// ── Auto-évaluation de propreté (section intégrée) ──────────

export const CLEANLINESS_VALUES = ['IMPECCABLE', 'CORRECT', 'A_NETTOYER', 'TRES_SALE'] as const;
export type CleanlinessValue = (typeof CLEANLINESS_VALUES)[number];

export interface CleanlinessMeta {
  value: CleanlinessValue;
  label: string;
  color: string;
  badgeClass: string;
}

/** Méta des 4 niveaux de propreté (photo obligatoire si A_NETTOYER / TRES_SALE). */
export const CLEANLINESS_META: Record<CleanlinessValue, CleanlinessMeta> = {
  IMPECCABLE: {
    value: 'IMPECCABLE',
    label: 'Impeccable',
    color: '#34d399',
    badgeClass: 'border-[#34d399]/30 bg-[#34d399]/10 text-[#34d399]',
  },
  CORRECT: {
    value: 'CORRECT',
    label: 'Correct',
    color: '#2dd4bf',
    badgeClass: 'border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-[#2dd4bf]',
  },
  A_NETTOYER: {
    value: 'A_NETTOYER',
    label: 'À nettoyer',
    color: '#fbbf24',
    badgeClass: 'border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fbbf24]',
  },
  TRES_SALE: {
    value: 'TRES_SALE',
    label: 'Très sale',
    color: '#f07d6a',
    badgeClass: 'border-[#f07d6a]/30 bg-[#f07d6a]/10 text-[#f07d6a]',
  },
};

// ── Template des pièces + équipements (EDL juridique FR) ────

/**
 * Élément pré-rempli d'une pièce. `electronic = true` → l'invité
 * peut joindre 2 preuves de fonctionnement (photo ON / photo OFF)
 * et l'élément apparaît dans la section « Électronique & 
 * électroménager » du PDF certifié.
 */
export interface InspectionTemplateItem {
  name: string;
  electronic: boolean;
}

/** Pièce pré-remplie : nom + liste d'équipements à vérifier. */
export interface InspectionTemplateRoom {
  name: string;
  items: InspectionTemplateItem[];
}

const e = (name: string): InspectionTemplateItem => ({ name, electronic: true });
const p = (name: string): InspectionTemplateItem => ({ name, electronic: false });

/**
 * Template officiel du module — checklist EXACTE du PDF certifié,
 * 4 sections (Cuisine, Salle à manger / Séjour, Chambres,
 * Salle de bain / WC). Dupliqué à la création de CHAQUE inspection
 * (InspectionRoom + InspectionItem, sortOrder = index).
 */
export const INSPECTION_TEMPLATE: InspectionTemplateRoom[] = [
  {
    name: 'Cuisine',
    items: [
      e('Plaque de cuisson'),
      e('Hotte aspirante'),
      e('Four'),
      e('Micro-ondes'),
      e('Réfrigérateur'),
      p('Évier(s) et robinetterie'),
      e('Lave-vaisselle'),
      e('Lave-linge'),
      e('Sèche-linge'),
      e('Détecteur de fumée'),
      e('Détecteur de Monoxyde de Carbone'),
      e('Cafetière'),
      p('Rangement/placard'),
      p('Tables'),
      p('Chaises'),
      p('Plan de travail'),
      p('Couverts'),
      p('Vaisselle'),
    ],
  },
  {
    name: 'Salle à manger / Séjour',
    items: [
      p('Canapé'),
      p('Fauteuils'),
      p('Table basse'),
      p('Table à manger'),
      p('Chaises'),
      e('Télévision'),
      p('Meuble TV'),
      p('Décorations murales'),
      p('Rideaux'),
      p('Éclairage'),
      p('Rangement/placard'),
    ],
  },
  {
    name: 'Chambres',
    items: [
      p('Lit'),
      p('Matelas'),
      p('Sommier'),
      p('Armoire / Placard'),
      p('Table de chevet'),
      p('Lampe'),
      p('Rideaux'),
      p('Éclairage'),
    ],
  },
  {
    name: 'Salle de bain / WC',
    items: [
      p('Lavabo'),
      p('Miroir'),
      p('Baignoire / Douche'),
      p('Meuble sous-vasque'),
      p('Sèche-serviettes'),
      p('WC'),
      p('Lave-mains'),
      p('Éclairage'),
    ],
  },
];

// ── Appareils électroniques (photos ON / OFF) ───────────────

/**
 * Noms des éléments considérés comme appareils électroniques /
 * électroménagers — preuve ON/OFF optionnelle + section dédiée
 * du PDF. Comparaison sur le nom EXACT de l'élément en base
 * (les inspections sont pré-remplies depuis INSPECTION_TEMPLATE,
 * donc les noms correspondent toujours ; les documents créés
 * avant v4.110 ne matchent pas → aucun changement d'affichage).
 */
export const ELECTRONIC_ITEM_NAMES: ReadonlySet<string> = new Set(
  INSPECTION_TEMPLATE.flatMap((room) =>
    room.items.filter((item) => item.electronic).map((item) => item.name),
  ),
);

/** Garde tolérante : l'élément est-il un appareil électronique ? */
export function isElectronicItem(name: string): boolean {
  return ELECTRONIC_ITEM_NAMES.has(name.trim());
}

// ── URL publique de partage ─────────────────────────────────

/**
 * Construit l'URL publique du document (/i/<token>) — page invité
 * légère (redirection vers /inspection/<token>). En client, passer
 * window.location.origin pour que le lien reste valable sur les
 * environnements de prévisualisation.
 */
export function inspectionShareUrl(publicToken: string, origin?: string): string {
  const base = (origin ?? 'https://roomscan.pro').replace(/\/+$/, '');
  return `${base}/i/${publicToken}`;
}

/**
 * Variante client : utilise l'origine courante si window est
 * disponible (navigateur), sinon l'URL canonique de production.
 */
export function currentShareUrl(publicToken: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : undefined;
  return inspectionShareUrl(publicToken, origin);
}

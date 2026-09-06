// =============================================================
// FIX-11 (AUD-FULL) — Matériaux des plaques QR physiques
//
// Écart audité : « matériaux Bois/Acrylique absents ». Ajout d'un
// choix de matériau RÉEL persisté dans le JSON designConfig
// (champs QrBatch.designConfig et PhysicalQrCode.designConfig,
// tous deux `String @default("{}")` — SCHÉMA GELÉ, aucune
// migration). Valeurs : 'aluminium' (défaut, rétro-compatible :
// toute entrée absente/inconnue retombe sur aluminium) | 'bois' |
// 'acrylique'.
//
// Prix : AUCUN système de prix par matériau n'existe dans le
// projet (pricing-section.tsx / billing.ts = plans d'abonnement
// landing, pas un prix unitaire plaque) → volontairement NON posé,
// pour ne pas inventer de données.
// =============================================================

export type PlaqueMaterial = 'aluminium' | 'bois' | 'acrylique';

export const DEFAULT_PLAQUE_MATERIAL: PlaqueMaterial = 'aluminium';

export const PLAQUE_MATERIALS: {
  value: PlaqueMaterial;
  label: string;
  emoji: string;
  hint: string;
}[] = [
  {
    value: 'aluminium',
    label: 'Aluminium',
    emoji: '⬜',
    hint: 'Standard gravé laser — intérieur comme extérieur',
  },
  {
    value: 'bois',
    label: 'Bois',
    emoji: '🪵',
    hint: 'Contreplaqué gravé — rendu chaleureux',
  },
  {
    value: 'acrylique',
    label: 'Acrylique',
    emoji: '💎',
    hint: 'Plexiglass transparent — effet moderne',
  },
];

export const PLAQUE_MATERIAL_META: Record<
  PlaqueMaterial,
  { label: string; emoji: string }
> = Object.fromEntries(
  PLAQUE_MATERIALS.map((m) => [m.value, { label: m.label, emoji: m.emoji }]),
) as Record<PlaqueMaterial, { label: string; emoji: string }>;

/** Normalise une valeur inconnue (JSON historique, DB, API) vers un
 *  matériau valide — rétro-compatible : défaut = aluminium. */
export function normalizePlaqueMaterial(raw: unknown): PlaqueMaterial {
  return PLAQUE_MATERIALS.some((m) => m.value === raw)
    ? (raw as PlaqueMaterial)
    : DEFAULT_PLAQUE_MATERIAL;
}

/** Extrait le matériau d'un designConfig JSON-as-string (défensif,
 *  jamais throw — les configs historiques sans `material` donnent
 *  aluminium). */
export function parsePlaqueMaterial(
  designConfig: string | null | undefined,
): PlaqueMaterial {
  if (!designConfig) return DEFAULT_PLAQUE_MATERIAL;
  try {
    const cfg = JSON.parse(designConfig) as { material?: unknown };
    return normalizePlaqueMaterial(cfg?.material);
  } catch {
    return DEFAULT_PLAQUE_MATERIAL;
  }
}

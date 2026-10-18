// =============================================================
// v4.43 « ONGLET MÉNAGE DÉDIÉ » — lib partagée hôte ↔ femme de ménage
//
// La checklist de nettoyage est configurée par l'hôte dans le
// dashboard (/airbnb/menage) :
//   • null (Property.cleaningChecklist) → checklist GÉNÉRALE
//     (DEFAULT_CLEANING_CHECKLIST, les 10 essentiels) ;
//   • JSON array de strings → checklist PERSONNALISÉE.
// La femme de ménage reçoit la checklist choisie via
// GET /api/public/hub/[slug]/cleaning/config (Mode Ménage du Hub).
// =============================================================

/** Checklist générale par défaut (10 points — les essentiels). */
export const DEFAULT_CLEANING_CHECKLIST: string[] = [
  'Lits défaits & draps changés',
  'Serviettes & torchons renouvelés',
  'Salle de bain nettoyée (WC, douche, lavabo)',
  'Cuisine nettoyée (plan de travail, évier, plaques)',
  'Sols aspirés / lavés',
  'Poubelles vidées',
  'Surfaces & vitres dépoussiérées',
  'Salon remis en ordre',
  'Appareils vérifiés (cafetière, bouilloire…)',
  'Portes & fenêtres fermées',
];

export const MAX_CHECKLIST_ITEMS = 20;
export const MAX_CHECKLIST_ITEM_LEN = 120;

export interface ResolvedChecklist {
  /** 'default' = checklist générale · 'custom' = checklist de l'hôte. */
  source: 'default' | 'custom';
  items: string[];
}

/** Parseur tolérant de Property.cleaningChecklist (JSON) — jamais de
 *  throw : en cas de forme invalide ou vide, repli checklist générale. */
export function resolveCleaningChecklist(
  raw: unknown,
): ResolvedChecklist {
  if (raw == null) {
    return { source: 'default', items: DEFAULT_CLEANING_CHECKLIST };
  }
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { source: 'default', items: DEFAULT_CLEANING_CHECKLIST };
    }
  }
  if (!Array.isArray(parsed)) {
    return { source: 'default', items: DEFAULT_CLEANING_CHECKLIST };
  }
  const items = parsed
    .filter((i): i is string => typeof i === 'string')
    .map((i) => i.trim())
    .filter((i) => i.length > 0 && i.length <= MAX_CHECKLIST_ITEM_LEN)
    .slice(0, MAX_CHECKLIST_ITEMS);
  if (items.length === 0) {
    return { source: 'default', items: DEFAULT_CLEANING_CHECKLIST };
  }
  return { source: 'custom', items };
}

/** Valide une checklist soumise par l'hôte (1..20 items non vides). */
export function validateCustomChecklist(
  items: unknown,
): { ok: true; items: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(items)) {
    return { ok: false, reason: 'Checklist invalide.' };
  }
  const cleaned: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') {
      return { ok: false, reason: 'Checklist invalide.' };
    }
    const trimmed = item.trim();
    if (!trimmed) {
      return { ok: false, reason: 'Chaque point de la checklist doit être renseigné.' };
    }
    if (trimmed.length > MAX_CHECKLIST_ITEM_LEN) {
      return {
        ok: false,
        reason: `Chaque point est limité à ${MAX_CHECKLIST_ITEM_LEN} caractères.`,
      };
    }
    cleaned.push(trimmed);
  }
  if (cleaned.length === 0) {
    return { ok: false, reason: 'Ajoutez au moins un point à votre checklist.' };
  }
  if (cleaned.length > MAX_CHECKLIST_ITEMS) {
    return {
      ok: false,
      reason: `Maximum ${MAX_CHECKLIST_ITEMS} points par checklist.`,
    };
  }
  return { ok: true, items: cleaned };
}

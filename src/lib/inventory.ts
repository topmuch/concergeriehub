// =============================================================
// v4.54 « ALERTES STOCK » — catalogue des 4 postes surveillés,
// partagé par la route staff, la route hôte et l'UI (staff + hôte).
// =============================================================

export const INVENTORY_ITEMS: Record<string, { label: string; emoji: string }> = {
  serviettes: { label: 'Serviettes', emoji: '🛁' },
  papier_toilette: { label: 'Papier toilette', emoji: '🧻' },
  savon_shampooing: { label: 'Savon / Shampooing', emoji: '🧼' },
  capsules_cafe: { label: 'Capsules café', emoji: '☕' },
};

/** Libellé + emoji d'un poste (repli générique si inconnu). */
export function inventoryItemMeta(item: string): { label: string; emoji: string } {
  return INVENTORY_ITEMS[item] ?? { label: item, emoji: '📦' };
}

/** Métadonnées des 3 états de stock. */
export const INVENTORY_STATUS_META: Record<string, { label: string; short: string; className: string }> = {
  ok: { label: '✅ OK', short: 'OK', className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' },
  low: { label: '⚠️ Stock bas', short: 'Bas', className: 'bg-amber-50 text-amber-800 border-amber-200 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300' },
  empty: { label: '❌ Épuisé', short: 'Épuisé', className: 'bg-rose-50 text-rose-700 border-rose-200 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300' },
};

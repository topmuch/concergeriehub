// =============================================================
// ÉTAPE 17 (V3) — Moteur de transaction : métier ServiceOrder
// Partagé entre l'API publique (invité) et l'API hôte.
//
// Séparation financière (invariant) :
//   totalAmount = commission + hostEarning  (± centime d'arrondi)
// =============================================================

/** Statuts du cycle de vie (mirroir du commentaire OrderStatus du schéma). */
export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Transitions autorisées — le cycle est piloté par l'hôte/conciergerie. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === 'string' && (ORDER_STATUSES as readonly string[]).includes(v);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Commission par défaut de Conciergerie Hub (15 %) — configurable par
 *  prestataire/bien dans une future sous-étape. */
export const DEFAULT_COMMISSION_RATE = 0.15;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface OrderItem {
  name: string;
  qty: number;
  unitPrice: number;
}

/**
 * Valide et normalise les lignes de commande reçues du client.
 * Retourne null si le payload est invalide (jamais throw).
 */
export function parseOrderItems(raw: unknown): OrderItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null;
  const items: OrderItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') return null;
    const o = it as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const qty = o.qty;
    const unitPrice = o.unitPrice;
    if (name.length < 1 || name.length > 120) return null;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 20) return null;
    if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10_000) return null;
    items.push({ name, qty, unitPrice: round2(unitPrice) });
  }
  return items;
}

export function itemsTotal(items: OrderItem[]): number {
  return round2(items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0));
}

export function computeSplit(total: number, rate: number = DEFAULT_COMMISSION_RATE) {
  const commission = round2(total * rate);
  return { commission, hostEarning: round2(total - commission) };
}

/** Métadonnées d'affichage des statuts (badges dashboard + chips invité). */
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; emoji: string; badge: string }> = {
  PENDING: { label: 'À confirmer', emoji: '🟡', badge: 'bg-amber-500' },
  CONFIRMED: { label: 'Confirmée', emoji: '🔵', badge: 'bg-teal-600' },
  PREPARING: { label: 'En préparation', emoji: '🟠', badge: 'bg-orange-500' },
  DELIVERED: { label: 'Livrée', emoji: '🟢', badge: 'bg-emerald-600' },
  CANCELLED: { label: 'Annulée', emoji: '⚪', badge: 'bg-rose-400' },
};

/** Format FR : "36,00 €" */
export function formatEur2(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

/**
 * Anti-spam en mémoire (par clé — ex: propertyId) : fenêtre glissante.
 * SQLite dev / mono-instance : suffisant ; Redis en prod le jour venu.
 */
const rateBuckets = new Map<string, number[]>();

export function rateLimit(key: string, maxPerMinute = 10): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (rateBuckets.get(key) || []).filter((t) => t > windowStart);
  if (arr.length >= maxPerMinute) {
    rateBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}

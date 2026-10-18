'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// =============================================================
// REFONTE SERVICES PREMIUM (V4.11) — Store du PANIER FLOTTANT
// (style Uber Eats) de l'App Invitée.
//
// • Un panier PAR SLUG de hub (Record<slug, items>) — l'invité peut
//   visiter plusieurs logements sans mélanger les paniers.
// • Persisté en localStorage (« ch-guest-cart ») → survit à un
//   refresh, à la mise en arrière-plan et au retour Stripe.
// • Le prix (unitPrice) n'est qu'INFORMATIF pour l'affichage : au
//   checkout, le serveur re-price chaque ligne depuis ServiceOffer /
//   hourlyRate (invariant ÉTAPE 17.5 — jamais cru client).
// • Cap 20 par ligne (aligné sur parseOrderLines côté serveur).
// =============================================================

/** Ligne du panier — identifiée par prestataire + offre (ou standard). */
export interface CartItem {
  /** providerId + ':' + (offerId | 'std:' + offerName) — clé de fusion. */
  lineKey: string;
  providerId: string;
  providerName: string;
  /** Offre catalogue (ServiceOffer.id) ou null = offre standard. */
  offerId: string | null;
  /** Libellé affiché (nom de l'offre ou « <service> — offre standard »). */
  offerName: string;
  serviceEmoji: string;
  categoryLabel: string;
  /** Affichage uniquement — le serveur re-price au checkout. */
  unitPrice: number;
  unit: string;
  qty: number;
}

interface CartState {
  items: Record<string, CartItem[]>;
  /** Vibre le badge du FloatingCart à chaque ajout (framer key). */
  lastAddedAt: Record<string, number>;
  add: (slug: string, item: Omit<CartItem, 'qty'> & { qty?: number }) => void;
  setQty: (slug: string, lineKey: string, qty: number) => void;
  remove: (slug: string, lineKey: string) => void;
  clear: (slug: string) => void;
}

const MAX_QTY = 20;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      lastAddedAt: {},
      add: (slug, item) =>
        set((state) => {
          const list = state.items[slug] ?? [];
          const existing = list.find((i) => i.lineKey === item.lineKey);
          const qty = Math.min(MAX_QTY, (existing?.qty ?? 0) + (item.qty ?? 1));
          const next = existing
            ? list.map((i) => (i.lineKey === item.lineKey ? { ...i, qty } : i))
            : [...list, { ...item, qty } as CartItem];
          return {
            items: { ...state.items, [slug]: next },
            lastAddedAt: { ...state.lastAddedAt, [slug]: Date.now() },
          };
        }),
      setQty: (slug, lineKey, qty) =>
        set((state) => {
          const list = state.items[slug] ?? [];
          if (qty <= 0) {
            return { items: { ...state.items, [slug]: list.filter((i) => i.lineKey !== lineKey) } };
          }
          const capped = Math.min(MAX_QTY, Math.floor(qty));
          return {
            items: {
              ...state.items,
              [slug]: list.map((i) => (i.lineKey === lineKey ? { ...i, qty: capped } : i)),
            },
          };
        }),
      remove: (slug, lineKey) =>
        set((state) => ({
          items: { ...state.items, [slug]: (state.items[slug] ?? []).filter((i) => i.lineKey !== lineKey) },
        })),
      clear: (slug) =>
        set((state) => ({ items: { ...state.items, [slug]: [] } })),
    }),
    {
      name: 'ch-guest-cart',
      storage: createJSONStorage(() => localStorage),
      // On ne persiste QUE les items — lastAddedAt reste volatile.
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

// ── Helpers de sélection (calculs panier) ──

export function cartItemsOf(slug: string): CartItem[] {
  return useCartStore.getState().items[slug] ?? [];
}

export function cartCount(slug: string): number {
  return cartItemsOf(slug).reduce((s, i) => s + i.qty, 0);
}

export function cartTotal(slug: string): number {
  return Math.round(cartItemsOf(slug).reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;
}

/** Regroupe les lignes par prestataire (checkout = 1 commande/provider). */
export function groupCartByProvider(items: CartItem[]): Record<string, CartItem[]> {
  const groups: Record<string, CartItem[]> = {};
  for (const item of items) {
    (groups[item.providerId] ??= []).push(item);
  }
  return groups;
}

/** Petit « ding » de confirmation (Web Audio, après geste utilisateur). */
export function playDing(): void {
  try {
    const Ctx =
      window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => void ctx.close().catch(() => undefined);
  } catch {
    /* audio indisponible — feedback visuel seul */
  }
}

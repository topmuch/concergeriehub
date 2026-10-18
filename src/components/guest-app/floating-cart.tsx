'use client';

import { motion } from 'framer-motion';
import { formatEurGuest } from './types';
import { useCartStore } from './cart-store';

// =============================================================
// REFONTE SERVICES PREMIUM (V4.11) — PANIER FLOTTANT (style Uber Eats)
// Barre fixe au-dessus de la bottom-nav : apparaît en slide-up au
// premier ajout, le badge rebondit à chaque ajout, « Commander → »
// ouvre le checkout. Montée d'art : la barre reste sous le bouton
// « Retour » et au-dessus de la navigation (z-30 / bottom-nav z-40).
// =============================================================

export function FloatingCart({
  slug,
  onCheckout,
  /** REFONTE HUB QR (V4.14) — overlay plein écran sans bottom-nav :
   * la barre se cale à bottom-4 au lieu de remonter au-dessus de la nav. */
  embedded = false,
}: {
  slug: string;
  onCheckout: () => void;
  embedded?: boolean;
}) {
  const count = useCartStore((s) => cartCountOf(s, slug));
  const total = useCartStore((s) => totalOf(s, slug));
  const lastAddedAt = useCartStore((s) => s.lastAddedAt[slug] ?? 0);

  if (count <= 0) return null;

  return (
    <motion.div
      initial={{ y: 96, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 96, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={
        embedded
          ? 'fixed bottom-4 left-4 right-4 z-30 mx-auto max-w-[calc(100vw-2rem)] sm:max-w-lg'
          : 'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-30 mx-auto max-w-[calc(100vw-2rem)] sm:max-w-lg'
      }
      role="region"
      aria-label="Panier"
    >
      <div className="rounded-2xl bg-stone-900 text-white shadow-2xl shadow-black/40 border border-white/10 p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <motion.div
            key={lastAddedAt} // re-monte à chaque ajout → effet bounce
            initial={{ scale: 0.4 }}
            animate={{ scale: [0.4, 1.25, 1] }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="h-10 w-10 shrink-0 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm"
            aria-hidden="true"
          >
            {count}
          </motion.div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight">Voir le panier</p>
            <p className="text-xs text-stone-400 leading-tight">{formatEurGuest(total)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          className="shrink-0 bg-amber-500 text-white px-5 h-10 rounded-xl font-bold text-sm hover:bg-amber-400 active:scale-[0.97] transition-all cursor-pointer"
          aria-label={`Commander ${count} article${count > 1 ? 's' : ''} pour ${formatEurGuest(total)}`}
        >
          Commander →
        </button>
      </div>
    </motion.div>
  );
}

// ── Sélecteurs stables (zustand v5 : éviter les calculs dans le render) ──
function cartCountOf(state: { items: Record<string, { qty: number }[]> }, slug: string): number {
  return (state.items[slug] ?? []).reduce((sum, i) => sum + i.qty, 0);
}
function totalOf(state: { items: Record<string, { qty: number; unitPrice: number }[]> }, slug: string): number {
  return Math.round((state.items[slug] ?? []).reduce((sum, i) => sum + i.qty * i.unitPrice, 0) * 100) / 100;
}

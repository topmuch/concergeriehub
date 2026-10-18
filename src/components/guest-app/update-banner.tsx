'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SW_UPDATE_EVENT } from './sw-registrar';

// =============================================================
// PHASE FINALE (V4.9) — Bannière « Nouvelle version disponible ».
// Le SW annonce la mise à jour (sw-registrar.tsx) ; au clic on
// active le nouveau SW (SKIP_WAITING) puis la page se recharge
// proprement au controllerchange. Repli : reload après 4 s.
// =============================================================

export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const workerRef = useRef<ServiceWorker | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    const onReady = (e: Event) => {
      if (requestedRef.current) return; // mise à jour déjà en cours
      const detail = (e as CustomEvent<ServiceWorker | undefined>).detail;
      workerRef.current = detail ?? null;
      setReady(true);
    };
    window.addEventListener(SW_UPDATE_EVENT, onReady);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onReady);
  }, []);

  const refresh = () => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    setReady(false);

    let reloaded = false;
    const doReload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    try {
      navigator.serviceWorker.addEventListener('controllerchange', doReload, { once: true });
      workerRef.current?.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      /* SW indisponible → le repli ci-dessous prend le relais */
    }
    // Repli : si le nouveau SW ne prend pas le contrôle sous 4 s.
    setTimeout(doReload, 4000);
  };

  return (
    <AnimatePresence>
      {ready && (
        <motion.div
          initial={{ y: 72, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 72, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="fixed inset-x-0 z-50 px-4 bottom-[calc(84px+env(safe-area-inset-bottom))]"
          role="status"
          aria-live="polite"
        >
          <div className="max-w-lg mx-auto flex items-center gap-3 rounded-2xl bg-card border border-border shadow-lg px-4 py-3">
            <span className="text-lg select-none" aria-hidden="true">✨</span>
            <p className="flex-1 text-xs font-semibold text-card-foreground leading-snug">
              Nouvelle version de l&apos;app disponible
            </p>
            <button
              type="button"
              onClick={refresh}
              className="shrink-0 text-xs font-bold h-9 px-4 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
            >
              Mettre à jour
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

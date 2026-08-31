'use client';

import { useEffect } from 'react';

// =============================================================
// ÉTAPE 16 (V3) — Enregistrement du Service Worker (app invitée)
// Le SW (public/sw.js) met en cache le guidebook, les règles et
// le Wi-Fi pour l'usage hors-ligne dans le logement.
// =============================================================

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    // Léger différé : ne concurrence pas le chargement initial.
    const timer = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* silencieux — l'app reste 100 % fonctionnelle en ligne */
      });
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  return null;
}

'use client';

import { useEffect } from 'react';

// =============================================================
// PHASE FINALE (V4.9) — Enregistrement du Service Worker (invité)
// + détection de mise à jour : quand une nouvelle version du SW
// est installée en attente, on émet SW_UPDATE_EVENT → la bannière
// « Nouvelle version disponible » (update-banner.tsx) s'affiche.
// Le SW (public/sw.js) met en cache le guidebook, les règles et
// le Wi-Fi pour l'usage hors-ligne dans le logement.
// =============================================================

/** Événement custom : un nouveau Service Worker attend d'activer. */
export const SW_UPDATE_EVENT = 'ch-sw-update-ready';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    let reg: ServiceWorkerRegistration | null = null;

    // Vérification silencieuse toutes les heures (nouvelle version).
    const hourly = setInterval(() => {
      reg?.update().catch(() => undefined);
    }, 60 * 60 * 1000);

    const announceWaiting = (r: ServiceWorkerRegistration) => {
      // Un SW en attente + un contrôleur actif = mise à jour prête.
      // (Au 1er install il n'y a pas de contrôleur → activation
      // transparente via clients.claim(), sans bannière.)
      if (r.waiting && navigator.serviceWorker.controller) {
        window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: r.waiting }));
      }
    };

    // Léger différé : ne concurrence pas le chargement initial.
    const timer = setTimeout(() => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((r) => {
          if (cancelled) return;
          reg = r;
          // v4.119 — re-check IMMÉDIAT : register() ne re-télécharge pas
          // toujours /sw.js si le navigateur vient de faire son check de
          // routine. Un update() explicite garantit la détection d'une
          // nouvelle version dès CE chargement (avant : délai jusqu'à 1 h
          // via l'interval horaire → le client pouvait rester sur l'ancien
          // code sans jamais voir la bannière de mise à jour).
          r.update().catch(() => undefined);
          announceWaiting(r);
          r.addEventListener('updatefound', () => {
            const nextWorker = r.installing;
            if (!nextWorker) return;
            nextWorker.addEventListener('statechange', () => {
              if (nextWorker.state === 'installed') announceWaiting(r);
            });
          });
        })
        .catch(() => {
          /* silencieux — l'app reste 100 % fonctionnelle en ligne */
        });
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(hourly);
    };
  }, []);

  return null;
}

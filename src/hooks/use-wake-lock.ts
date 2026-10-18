'use client';

// =============================================================
// v4.51 « OPTIMISATION TABLETTE — LUXE TOTAL » — PHASE 4 WAKE LOCK
//
// Une tablette posée sur un support dans le salon ne doit PAS
// s'éteindre pendant que l'invité lit le Guidebook ou regarde la
// vidéo de bienvenue. Ce hook active l'API native Screen Wake Lock
// (navigator.wakeLock.request('screen') — 100 % navigateur, zéro
// permission intrusive) tant que le Hub est ouvert.
//
// Robustesse :
//   • navigateur non supporté (Firefox/Safari anciens) → échec
//     SILENCIEUX, la mise en veille normale reprend ;
//   • le Wake Lock est automatiquement levé quand l'onglet passe
//     en arrière-plan → ré-acquisition dès le visibilitychange
//     « visible » (retour sur le Hub) ;
//   • démontage propre (release) — jamais de fuite de verrou.
// =============================================================

import { useEffect, useRef } from 'react';

/** Types minimaux de la Wake Lock API (absents de certaines lib.dom). */
interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Maintient l'écran allumé tant que `enabled` est vrai (défaut) et que
 * le Hub est visible. Aucune valeur de retour : le comportement est
 * entièrement implicite (l'écran ne s'éteint pas, c'est tout).
 */
export function useWakeLock(enabled = true): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') {
      // Non supporté (Firefox, Safari < 16.4…) → silencieux.
      return;
    }

    let cancelled = false;

    const requestLock = async () => {
      // Déjà actif, démontage en cours ou onglet en arrière-plan
      // (la spec refuse request() hors « visible ») → rien à faire.
      if (cancelled || sentinelRef.current) return;
      if (document.visibilityState !== 'visible') return;
      try {
        const sentinel = await nav.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        // Le navigateur peut lever le verrou de lui-même (batterie
        // faible, onglet caché…) : on remet le ref à null pour que le
        // visibilitychange puisse ré-acquérir proprement.
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null;
        });
      } catch {
        // Refus navigateur / économie d'énergie → échec SILENCIEUX.
      }
    };

    const releaseLock = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
    };

    // Le Wake Lock se désactive dès que l'utilisateur change d'onglet
    // ou verrouille l'écran : on le réactive au retour sur le Hub.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void requestLock();
    };

    void requestLock();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      releaseLock();
    };
  }, [enabled]);
}

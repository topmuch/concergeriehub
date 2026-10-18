'use client';

import { useEffect, useState } from 'react';
import { WelcomeVideoCard } from './welcome-video';

// =============================================================
// 8 AMÉLIORATIONS (PHASE 1) — 1.1 VIDÉO DE BIENVENUE AVEC EXPIRATION
// Wrapper conditionnel autour de <WelcomeVideoCard> :
//   • Au 1er scan du QR, un timestamp est enregistré en localStorage
//     : `ch-guest-firstscan-<slug>` (ou `…-<slug>-<bookingId>` si un
//     séjour ?b= est mémorisé → nouvelle fenêtre d'1 h par séjour).
//   • À chaque affichage : si < 1 heure (3 600 000 ms) → la vidéo
//     s'affiche. Si ≥ 1 h → masquée (l'invité a déjà vu l'essentiel).
//   • Minuteur de sortie : si l'invité garde l'app ouverte, la vidéo
//     disparaît exactement à l'expiration (pas seulement au refresh).
//   • SSR-sûr : rendu initial vide (le timestamp n'est lisible que
//     côté client), puis apparition sans flash ni hydration mismatch.
//   • Stockage indisponible (navigation privée stricte) → vidéo
//     affichée (comportement généreux par défaut).
// =============================================================

/** Fenêtre d'affichage de la vidéo : 1 heure après le 1er scan. */
const SHOW_TTL_MS = 3_600_000;

function firstScanKey(slug: string, bookingId?: string | null): string {
  return bookingId
    ? `ch-guest-firstscan-${slug}-${bookingId}`
    : `ch-guest-firstscan-${slug}`;
}

export function TimeLimitedWelcomeVideo({
  slug,
  url,
  hostName,
  propertyName,
  bookingId = null,
}: {
  slug: string;
  url: string;
  hostName: string | null;
  propertyName: string;
  /** Séjour mémorisé (?b=) — clé par séjour pour rejouer la vidéo aux nouveaux arrivants. */
  bookingId?: string | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      // Sort de la pile synchrone de l'effet avant tout setState
      // (règle react-hooks/set-state-in-effect — même pattern que use-weather).
      await Promise.resolve();
      if (cancelled) return;

      try {
        const key = firstScanKey(slug, bookingId);
        const raw = window.localStorage.getItem(key);
        const now = Date.now();

        if (!raw) {
          // Premier scan → on horodate et on affiche.
          window.localStorage.setItem(key, String(now));
          setVisible(true);
          // Minuteur de sortie : expiration exacte même sans refresh.
          timer = setTimeout(() => setVisible(false), SHOW_TTL_MS);
        } else {
          const first = parseInt(raw, 10);
          if (!Number.isFinite(first)) {
            // Valeur corrompue → on repart d'un premier scan « maintenant ».
            window.localStorage.setItem(key, String(now));
            setVisible(true);
            timer = setTimeout(() => setVisible(false), SHOW_TTL_MS);
          } else {
            const elapsed = now - first;
            if (elapsed < SHOW_TTL_MS) {
              setVisible(true);
              timer = setTimeout(() => setVisible(false), SHOW_TTL_MS - elapsed);
            } else {
              // > 1 h → la vidéo reste masquée (déjà vue).
              setVisible(false);
            }
          }
        }
      } catch {
        // localStorage indisponible → on affiche (jamais bloquant).
        setVisible(true);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [slug, bookingId]);

  // Expirée (ou 1er rendu SSR) → rien du tout, la carte disparaît.
  if (!visible) return null;

  return (
    <WelcomeVideoCard
      url={url}
      hostName={hostName}
      propertyName={propertyName}
    />
  );
}

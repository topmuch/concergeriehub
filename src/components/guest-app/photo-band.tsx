'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// =============================================================
// v4.25 « HUB RÉEL — PHOTOS PARTOUT » — Bande photo réelle pour
// les en-têtes de modules de la PWA invitée (Coffre-fort numérique,
// Guidebook, Kit de survie, Carte secrète, états vides…).
//
//   • photo en object-cover + voile dégradé (texte blanc lisible)
//   • échec de chargement → fallback gradient + emoji historique
//     (jamais de carte vide, toujours lisible)
//   • contenu (titre/sous-titre) posé en overlay via children
// =============================================================

export function PhotoBand({
  src,
  emoji,
  alt,
  className,
  overlay = 'from-black/70 via-black/35 to-black/15',
  children,
}: {
  /** Photo réelle (URL distante https: — CSP img-src ok — ou chemin local). */
  src: string;
  /** Emoji de repli si la photo échoue (défaut 🏠). */
  emoji?: string;
  /** Texte alternatif de la photo (défaut : vide, décoratif). */
  alt?: string;
  /** Classes du conteneur (hauteur, arrondis, marges…). */
  className?: string;
  /** Dégradé de lisibilité (Tailwind from-/via-/to-). */
  overlay?: string;
  /** Contenu en overlay (titre, badge, bouton…). */
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-gradient-to-br from-secondary via-card to-secondary',
        className,
      )}
    >
      {!failed ? (
        <>
          <img
            src={src}
            alt={alt ?? ''}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
          <div
            aria-hidden="true"
            className={cn('absolute inset-0 bg-gradient-to-t', overlay)}
          />
        </>
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-5xl select-none"
        >
          {emoji ?? '🏠'}
        </span>
      )}
      {children && <div className="relative">{children}</div>}
    </div>
  );
}

'use client';

// =============================================================
// ADAPTIVE VIDEO (v5.15) — lecteur au VRAI format de la vidéo.
//
// Demande client : « la vidéo générée doit être en format téléphone »
// — les lecteurs étaient en `aspect-video` (16:9 paysage) ou carré →
// la vidéo portrait (téléphone) s'affichait au centre avec des
// BANDES NOIRES à gauche et à droite (pillarbox).
//
// Ici : le conteneur épouse le ratio RÉEL du fichier, découvert via
// `onLoadedMetadata` (aucune migration DB nécessaire — fonctionne
// aussi pour les vidéos déjà enregistrées). Avant metadata, repli
// 9/16 : les captures se font au téléphone, format portrait.
// =============================================================
import { useState } from 'react';

import { cn } from '@/lib/utils';

export function AdaptiveVideo({
  src,
  className,
  ariaLabel,
}: {
  src: string;
  className?: string;
  ariaLabel: string;
}) {
  const [ratio, setRatio] = useState<number | null>(null);

  return (
    <div className="flex justify-center bg-black">
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        aria-label={ariaLabel}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            setRatio(v.videoWidth / v.videoHeight);
          }
        }}
        style={ratio ? { aspectRatio: `${ratio}` } : { aspectRatio: '9 / 16' }}
        className={cn(
          'block bg-black',
          // Portrait (téléphone) : remplit la largeur du mobile, plafonné
          // à 540 px sur desktop pour garder le « format téléphone »
          // centré. Paysage : pleine largeur classique.
          ratio !== null && ratio > 1
            ? 'h-auto w-full'
            : 'h-auto max-h-[85vh] w-full max-w-[min(100%,540px)]',
          className,
        )}
      />
    </div>
  );
}

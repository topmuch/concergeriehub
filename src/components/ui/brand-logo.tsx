'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * BrandLogo — logo officiel RoomScan (maison au balcon + « Roomscan »).
 * NOUVEAU logo officiel client (v5.9) — extraction haute résolution
 * (754×283 depuis la source 809×312), fond transparent, bleu #055492.
 * Proportions d'origine strictement préservées (ratio verrouillé).
 *
 * Assets (public/brand/) :
 *  - roomscan-logo.png       754×283 — logo complet, bleu #055492 (fonds clairs)
 *  - roomscan-logo-white.png 754×283 — logo complet blanc (fonds sombres)
 *  - roomscan-icon.png       171×169 — emblème seul (sans wordmark)
 *  - roomscan-icon-white.png 171×169 — emblème seul blanc (fonds sombres)
 */
interface BrandLogoProps {
  /** 'dark' = pour fonds clairs (couleurs d'origine) ; 'light' = pour fonds sombres (blanc) */
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showWordmark?: boolean;
  /** Hauteur px exacte (prioritaire sur `size`) — harmonisation v5.10 :
   *  un seul composant, tailles pixel-perfect par contexte. */
  height?: number;
  className?: string;
}

/* Hauteur d'affichage par taille — la largeur suit le ratio intrinsèque (w-auto).
 * v5.9 — nouveau logo officiel + tailles « xl » (120 px) et « hero » (176 px)
 * pour un affichage GRAND FORMAT (accueil, connexions). sm/md/lg conservés. */
const LOGO_HEIGHT = { sm: 44, md: 60, lg: 88, xl: 120, hero: 176 } as const;

/* Dimensions intrinsèques (ratio 754:283 ≈ 2.665, emblème 171:169 ≈ 1.01) */
const WORDMARK = { w: 754, h: 283 } as const;
const EMBLEM = { w: 171, h: 169 } as const;

export function BrandLogo({
  variant = 'dark',
  size = 'md',
  showWordmark = true,
  height: heightOverride,
  className,
}: BrandLogoProps) {
  const h = heightOverride ?? LOGO_HEIGHT[size];
  const src = showWordmark
    ? variant === 'light'
      ? '/brand/roomscan-logo-white.png'
      : '/brand/roomscan-logo.png'
    : variant === 'light'
      ? '/brand/roomscan-icon-white.png'
      : '/brand/roomscan-icon.png';
  const dims = showWordmark ? WORDMARK : EMBLEM;

  return (
    <span className={cn('inline-flex items-center select-none', className)}>
      <Image
        src={src}
        alt="RoomScan"
        width={dims.w}
        height={dims.h}
        className="w-auto select-none"
        style={{ height: h }}
        priority
      />
    </span>
  );
}

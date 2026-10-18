'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * BrandLogo — logo officiel RoomScan (maison + R + « RoomScan »).
 * Image réelle fournie par le client : proportions d'origine strictement
 * préservées (ratio verrouillé, jamais étiré ni recadré).
 *
 * Assets (public/brand/) :
 *  - roomscan-logo.png  212×163 — logo complet, couleurs d'origine (fonds clairs)
 *  - roomscan-logo-white.png — logo complet, « Room » en blanc (fonds sombres)
 *  - roomscan-icon.png  124×121 — icône seule (sans wordmark)
 *  - roomscan-icon-white.png — icône seule blanche (fonds sombres)
 */
interface BrandLogoProps {
  /** 'dark' = pour fonds clairs (couleurs d'origine) ; 'light' = pour fonds sombres (wordmark blanc) */
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

/* Hauteur d'affichage par taille — la largeur suit le ratio intrinsèque (w-auto).
 * v4.68 — tailles augmentées (+30 %) à la demande du client : le logo était
 * trop discret dans le hub et sur la landing.
 * v4.73 — nouvelle augmentation demandée par le client : logo encore plus
 * présent sur l'accueil, le footer et le hub. */
const LOGO_HEIGHT = { sm: 44, md: 60, lg: 88 } as const;

export function BrandLogo({ variant = 'dark', size = 'md', showWordmark = true, className }: BrandLogoProps) {
  const h = LOGO_HEIGHT[size];
  const src = showWordmark
    ? variant === 'light'
      ? '/brand/roomscan-logo-white.png'
      : '/brand/roomscan-logo.png'
    : variant === 'light'
      ? '/brand/roomscan-icon-white.png'
      : '/brand/roomscan-icon.png';

  return (
    <span className={cn('inline-flex items-center select-none', className)}>
      <Image
        src={src}
        alt="RoomScan"
        width={showWordmark ? 212 : 124}
        height={showWordmark ? 163 : 121}
        className="w-auto select-none"
        style={{ height: h }}
        priority
      />
    </span>
  );
}

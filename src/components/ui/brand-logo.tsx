'use client';

import { cn } from '@/lib/utils';

/**
 * BrandLogo — logo texte "Conciergerie Hub" avec tuile emoji.
 * Remplace l'ancien logo PNG (ORDOMOTIK) partout dans l'app.
 */
interface BrandLogoProps {
  /** 'dark' = pour fonds clairs (texte slate-900) ; 'light' = pour fonds sombres (texte blanc) */
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

const TILE_SIZE = {
  sm: 'h-7 w-7 text-sm rounded-lg',
  md: 'h-9 w-9 text-lg rounded-lg',
  lg: 'h-12 w-12 text-2xl rounded-xl',
} as const;

const TEXT_SIZE = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
} as const;

export function BrandLogo({ variant = 'dark', size = 'md', showWordmark = true, className }: BrandLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex items-center justify-center shrink-0 leading-none shadow-sm',
          TILE_SIZE[size],
          variant === 'dark' ? 'bg-slate-900' : 'bg-white',
        )}
      >
        <span className="translate-y-[-1px]">🗝️</span>
      </span>
      {showWordmark && (
        <span className={cn('font-bold tracking-tight leading-none', TEXT_SIZE[size], variant === 'dark' ? 'text-slate-900' : 'text-white')}>
          Conciergerie <span className="text-emerald-500">Hub</span>
        </span>
      )}
    </span>
  );
}

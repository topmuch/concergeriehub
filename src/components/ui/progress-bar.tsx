'use client';

import { cn } from '@/lib/utils';

/**
 * ProgressBar — barre de progression B2B fine et lisible.
 * Piste slate-100, remplissage emerald-600 (accent marque).
 */
interface ProgressBarProps {
  /** Valeur entre 0 et 100 */
  value: number;
  /** Épaisseur de la piste */
  size?: 'sm' | 'md';
  /** Libellé affiché au-dessus (gauche) */
  label?: string;
  /** Afficher le pourcentage à droite du libellé */
  showPercent?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  size = 'md',
  label,
  showPercent = false,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));

  return (
    <div className={cn('w-full', className)}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <p className="text-xs font-medium text-slate-500">{label}</p>}
          {showPercent && (
            <p className="text-xs font-semibold text-slate-700 tabular-nums">{clamped}%</p>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'w-full bg-slate-100 rounded-full overflow-hidden',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        <div
          className="h-full bg-emerald-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

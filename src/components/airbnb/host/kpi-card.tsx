'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// =============================================================
// KPICard — carte de statistique du Dashboard Client
// (icône emoji + valeur + label + variation optionnelle)
// Style QRTags Pro : carte blanche, bordure slate-200, ombre douce.
// =============================================================

export interface KPICardProps {
  icon: string;
  value: string | number;
  label: string;
  /** Variation vs période précédente, en % (ex: +12). */
  delta?: number | null;
  /** Texte complémentaire sous la valeur (ex: "vs mois précédent"). */
  hint?: string;
  loading?: boolean;
  /** Clic optionnel → carte interactive. */
  onClick?: () => void;
  className?: string;
}

export function KPICard({
  icon,
  value,
  label,
  delta,
  hint,
  loading = false,
  onClick,
  className,
}: KPICardProps) {
  const interactive = Boolean(onClick);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={interactive ? { y: -3 } : undefined}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        'group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow',
        interactive && 'cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40',
        className,
      )}
      aria-label={`${label} : ${loading ? 'chargement' : value}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-100 transition-colors group-hover:bg-[#FEF1EF]"
        >
          {icon}
        </span>
        {delta !== null && delta !== undefined && !loading && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
              delta >= 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700',
            )}
          >
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-8 w-24 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />
      ) : (
        <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      )}
      <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
      {hint && !loading && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </motion.div>
  );
}

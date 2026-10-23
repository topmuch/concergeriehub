'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// =============================================================
// KPICard — carte de statistique du Dashboard Hôte
// v5.2 « SAPHIR LUXE » : carte verre luxueuse TYPOGRAPHIQUE —
// SANS icône ni emoji (demande client) : label en petites
// capitales espacées, valeur chiffre serif, chip et hint.
//
// RÉTRO-COMPATIBILITÉ : l'ancienne API (icon/emoji, tone,
// delta: number|null, loading, onClick, className) reste
// supportée pour orders-content.tsx et plates-content.tsx —
// les props icon/emoji ne sont plus rendues (design sans icônes)
// et `tone` devient un simple accent de point coloré.
// =============================================================

export type KPITone = 'rausch' | 'emerald' | 'amber' | 'violet' | 'teal' | 'orange';

/** Accent coloré du point (design sans icône — le chiffre est le héros). */
const TONE_DOTS: Record<KPITone, string> = {
  rausch: '#5cadf0',
  emerald: '#86e9cb',
  amber: '#e9c47c',
  violet: '#cdb6ff',
  teal: '#2dd4bf',
  orange: '#ffab92',
};

export interface KPICardProps {
  label: string;
  value: string | number;
  /** Ancienne prop (design sans icônes : non rendue). */
  emoji?: string;
  /** Ancienne prop (design sans icônes : non rendue). */
  icon?: unknown;
  /** v4.59 — tonalité chromatique → accent du point coloré. */
  tone?: KPITone;
  /** v4.59 — pastille d'info en haut à droite (ex : « ▲ 12% », « nouveau »). */
  chip?: { text: string; tone?: 'positive' | 'negative' | 'neutral' };
  /** Ancienne API — variation vs période précédente, en % (convertie en chip). */
  delta?: number | null;
  /** Texte complémentaire sous la valeur (ex : "vs mois précédent"). */
  hint?: string;
  loading?: boolean;
  /** Clic optionnel → carte interactive. */
  onClick?: () => void;
  className?: string;
}

export function KPICard({
  label,
  value,
  tone,
  chip,
  delta,
  hint,
  loading = false,
  onClick,
  className,
}: KPICardProps) {
  const interactive = Boolean(onClick);

  // Chip : nouvelle API prioritaire, sinon conversion de l'ancienne `delta`.
  const resolvedChip =
    chip ??
    (delta != null && !loading
      ? {
          text: `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}%`,
          tone: (delta >= 0 ? 'positive' : 'negative') as 'positive' | 'negative',
        }
      : undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
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
        // v5.7 — demande client : fond plein #FF385C (rouge Airbnb).
        // .kpi-solid surcharge le verre .lux-card ; .lux-keep-dark
        // préserve l'encre blanche des textes internes en mode Jour.
        'lux-card lux-card-hover kpi-solid lux-keep-dark group relative p-5',
        interactive &&
          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60',
        className,
      )}
      aria-label={`${label} : ${loading ? 'chargement' : value}`}
    >
      <span
        className="lux-dot absolute right-4 top-5 opacity-80"
        style={{ backgroundColor: tone ? TONE_DOTS[tone] : '#5cadf0' }}
        aria-hidden="true"
      />
      <p className="lux-eyebrow">{label}</p>
      {loading ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded-lg bg-white/10" aria-hidden="true" />
      ) : (
        <p className="lux-num mt-2 text-3xl leading-none text-white">{value}</p>
      )}
      {resolvedChip && !loading && (
        <span className="lux-chip mt-3 inline-flex">
          <span
            className="lux-dot"
            style={{ backgroundColor: resolvedChip.tone === 'positive' ? '#34d399' : resolvedChip.tone === 'negative' ? '#f07d6a' : '#8fabc2' }}
            aria-hidden="true"
          />
          {resolvedChip.text}
        </span>
      )}
      {hint && !loading && <p className="mt-2 text-[11.5px] text-[#8fabc2]">{hint}</p>}
    </motion.div>
  );
}

'use client';

// =============================================================
// REFONTE SERVICES PREMIUM (V4.11) — Visuels des services.
// v4.23 — « HUB RÉEL » : chaque offre peut porter une VRAIE photo
// (ServiceOffer.imageUrl, injectée par le seed démo / le dashboard).
//   • imageUrl présent  → photo plein cadre (object-cover) posée sur
//     le gradient signature (visible pendant le chargement) ;
//     en cas d'erreur de chargement la photo se masque → fallback
//     gradient + emoji, toujours lisible.
//   • imageUrl absent   → gradient + emoji (comportement V4.11).
// Le mapping gradient est déterministe : un même service garde
// toujours le même visuel.
// =============================================================

import { cn } from '@/lib/utils';

/** Gradient Tailwind par libellé de catégorie (providerCategoryMeta). */
const CATEGORY_GRADIENTS: Record<string, string> = {
  'Petit-déjeuner': 'from-amber-400 to-orange-500',
  Arrivée: 'from-rose-400 to-pink-500',
  Pratique: 'from-green-400 to-teal-500',
  Sommelier: 'from-purple-400 to-pink-500',
  Pressing: 'from-teal-400 to-cyan-500',
  'Chef à domicile': 'from-rose-400 to-red-500',
  'Bien-être': 'from-emerald-400 to-teal-500',
  'Visites & expériences': 'from-violet-400 to-fuchsia-500',
  Transferts: 'from-[#6d9cc4] to-cyan-500',
  'Baby-sitting': 'from-pink-300 to-rose-400',
};

const DEFAULT_GRADIENT = 'from-stone-400 to-stone-600';

export function getCategoryGradient(categoryLabel: string): string {
  return CATEGORY_GRADIENTS[categoryLabel] ?? DEFAULT_GRADIENT;
}

/** Couverture visuelle d'un service — photo réelle si fournie, sinon gradient + emoji géant. */
export function ServiceCover({
  emoji,
  categoryLabel,
  imageUrl,
  className,
  emojiClassName,
  alt,
}: {
  emoji: string;
  categoryLabel: string;
  /** Photo réelle de l'offre/prestataire (v4.23 « hub réel »). */
  imageUrl?: string | null;
  className?: string;
  emojiClassName?: string;
  /** Texte alternatif de la photo (défaut : vide, décoratif). */
  alt?: string;
}) {
  return (
    <div
      aria-hidden={!imageUrl}
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-gradient-to-br',
        getCategoryGradient(categoryLabel),
        className,
      )}
    >
      {/* halo lumineux premium */}
      <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/25 blur-2xl" />
      <div className="absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-white/15 blur-xl" />
      <span
        aria-hidden="true"
        className={cn('drop-shadow-sm select-none', emojiClassName ?? 'text-6xl')}
      >
        {emoji}
      </span>
      {/* Photo réelle — posée PAR-DESSUS l'emoji (progressive) ; onError → fallback emoji */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
    </div>
  );
}

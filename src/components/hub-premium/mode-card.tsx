'use client';

import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { ArrowRight, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================
// HUB PREMIUM « LUXE TECH » — ModeCard
// Carte d'entrée du hub (Mode Invité / Mode Hôte) :
//   • fond gradient diagonal + texture de points subtile
//   • tilt 3D manuel (max 6°, ressort physique, souris uniquement)
//   • halo spotlight qui suit le curseur (CSS vars --mx/--my)
//   • badge pill « verre » en haut à droite
//   • CTA « Entrer » : brillance qui traverse au survol (invité) /
//     shimmer en boucle (hôte)
// Entrée choreographiée : fade-in + slide-up avec délai en prop.
// Zéro re-render React pendant le move (MotionValues).
// =============================================================

const SPRING = { stiffness: 260, damping: 22, mass: 0.6 };
const MAX_TILT_DEG = 6;
const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

type ModeVariant = 'guest' | 'host';

interface ModeCardProps {
  variant: ModeVariant;
  emoji: string;
  title: string;
  subtitle: string;
  description?: string;
  badge: string;
  ctaLabel: string;
  /** Délai d'entrée (chorégraphie d'accueil du hub). */
  delay?: number;
  onClick: () => void;
  className?: string;
}

const GRADIENTS: Record<ModeVariant, string> = {
  guest: 'from-[#0066EF] to-[#0052C4] shadow-[0_18px_50px_-16px_rgba(0,102,239,0.6)]',
  host: 'from-[#07235B] to-[#0A3273] shadow-[0_18px_50px_-16px_rgba(7,35,91,0.6)]',
};

export function ModeCard({
  variant,
  emoji,
  title,
  subtitle,
  description,
  badge,
  ctaLabel,
  delay = 0,
  onClick,
  className,
}: ModeCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  // Tilt 3D — MotionValues + springs (aucun setState → 60 fps garantis)
  const rotateX = useSpring(useMotionValue(0), SPRING);
  const rotateY = useSpring(useMotionValue(0), SPRING);

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Halo spotlight (variables CSS consommées par .spotlight-surface)
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    if (reduceMotion || e.pointerType !== 'mouse') return;
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(nx * MAX_TILT_DEG * 2);
    rotateX.set(-ny * MAX_TILT_DEG * 2);
  };

  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={`${title} — ${subtitle}`}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: EASE_EXPO }}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={{ scale: 0.985 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={cn(
        'group spotlight-surface relative w-full cursor-pointer overflow-hidden rounded-3xl',
        'bg-gradient-to-br p-6 text-left transition-shadow duration-500',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2',
        GRADIENTS[variant],
        className,
      )}
    >
      {/* Texture de points + halos lumineux décoratifs */}
      <span aria-hidden="true" className="texture-dots absolute inset-0 opacity-50" />
      <span aria-hidden="true" className="absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
      <span aria-hidden="true" className="absolute -bottom-14 -left-12 h-40 w-40 rounded-full bg-black/10 blur-2xl" />

      {/* Badge pill verre (haut-droite) */}
      <span className="absolute right-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
        {variant === 'host' && <Lock className="h-3 w-3" aria-hidden="true" />}
        {badge}
      </span>

      <span className="relative z-10 flex flex-col items-start gap-3 pr-20">
        {/* Icône 64 px + glow (pulse lent pour la carte hôte) */}
        <span
          aria-hidden="true"
          className={cn(
            'select-none text-[64px] leading-none',
            'drop-shadow-[0_0_24px_rgba(255,255,255,0.6)]',
            variant === 'host' && 'inline-block animate-pulse-slow',
          )}
        >
          {emoji}
        </span>

        {/* font-serif explicite : .display-title seul ne suffit pas —
            la var --font-serif du theme est résolue au niveau :root où
            --font-playfair (next/font sur <body>) est inconnue. */}
        <span className="display-title font-serif! text-3xl font-bold text-white">{title}</span>
        <span className="text-sm font-medium text-white/80">{subtitle}</span>
        {description && <span className="text-xs text-white/65">{description}</span>}

        {/* CTA « Entrer » — shimmer en boucle (.shimmer-line) sur les
            deux variantes + brillance traversante au survol (invité) */}
        <span
          className={cn(
            'shimmer-line relative mt-2 inline-flex h-11 items-center overflow-hidden rounded-full border border-white/30 bg-white/15 px-5',
            'text-sm font-semibold text-white backdrop-blur-sm transition-colors duration-300 group-hover:bg-white/25',
          )}
        >
          {/* Brillance qui traverse le bouton au survol (carte invité) */}
          {variant === 'guest' && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -translate-x-[220%] -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[320%]"
            />
          )}
          <span className="relative z-10 inline-flex items-center gap-2">
            {ctaLabel}
            <ArrowRight
              className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        </span>
      </span>
    </motion.button>
  );
}

'use client';

import { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

// =============================================================
// DESIGN PREMIUM « LUXE TECH » — GlassCard
// Carte glassmorphism (bg blanc translucide + blur + bordure fine)
// avec 3 effets signature activables :
//   • spotlight : halo radial qui suit le curseur (CSS vars --mx/--my)
//   • tilt 3D   : rotation max 8° + scale 1.02, ressort physique
//   • press     : scale 0.98 au touch (feedback tactile)
// Utilise des MotionValues → zéro re-render React pendant le move.
// =============================================================

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  /** Halo lumineux qui suit le curseur/dotigt (défaut : true). */
  spotlight?: boolean;
  /** Tilt 3D au survol/dotigt (défaut : false — à réserver aux cartes héro). */
  tilt?: boolean;
  /** Amplitude max du tilt en degrés. */
  tiltMax?: number;
  /** Scale au hover (défaut 1.0 = aucun zoom). */
  hoverScale?: number;
  onClick?: () => void;
  role?: string;
  'aria-label'?: string;
  style?: React.CSSProperties;
}

const SPRING = { stiffness: 260, damping: 24, mass: 0.6 };

export function GlassCard({
  children,
  className,
  spotlight = true,
  tilt = false,
  tiltMax = 8,
  hoverScale = 1,
  onClick,
  role,
  'aria-label': ariaLabel,
  style,
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Tilt 3D — MotionValues + springs (aucun setState → 60 fps garantis)
  const rx = useSpring(useMotionValue(0), SPRING);
  const ry = useSpring(useMotionValue(0), SPRING);
  const scale = useSpring(useMotionValue(1), SPRING);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Spotlight — variables CSS, le navigateur re-peint seul.
    if (spotlight) {
      el.style.setProperty('--mx', `${px}px`);
      el.style.setProperty('--my', `${py}px`);
    }

    if (tilt) {
      const nx = px / rect.width - 0.5; // -0.5 … 0.5
      const ny = py / rect.height - 0.5;
      ry.set(nx * tiltMax * 2);
      rx.set(-ny * tiltMax * 2);
    }
  };

  const onPointerEnter = () => {
    if (tilt) scale.set(1.02);
    else if (hoverScale !== 1) scale.set(hoverScale);
  };

  const onPointerLeave = () => {
    rx.set(0);
    ry.set(0);
    scale.set(1);
  };

  const interactive = Boolean(onClick) || tilt || hoverScale !== 1;

  return (
    <motion.div
      ref={ref}
      role={role}
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerEnter={interactive ? onPointerEnter : undefined}
      onPointerLeave={interactive ? onPointerLeave : undefined}
      style={
        tilt
          ? { rotateX: rx, rotateY: ry, scale, transformPerspective: 900, ...style }
          : hoverScale !== 1
            ? { scale, ...style }
            : style
      }
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cn(
        'relative overflow-hidden rounded-2xl glass glass-hover',
        spotlight && 'spotlight-surface',
        'transition-colors duration-500',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

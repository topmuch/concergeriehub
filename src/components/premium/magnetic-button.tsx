'use client';

import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';

// =============================================================
// DESIGN PREMIUM « LUXE TECH » — MagneticButton
// CTA « magnétique » : le bouton glisse de quelques pixels vers le
// curseur quand il s'approche (rayon d'attraction), scale 0.98 au
// clic, fond gradient animé, et explosion de confettis au clic
// (14 particules, auto-nettoyées). Zéro re-render au move
// (MotionValues), confettis en state local (event-driven).
// v4.61 — gradient signature « AIRBNB PRO » (fini le trio
// ambre/rose/émeraude) ; v5.1 (COLOR-A) — CTA bleu logo
// #0052C4→#0066EF→#0047B3 + glow bleu + confettis aux couleurs
// de la marque.
// =============================================================

interface Confetto {
  id: number;
  angle: number;
  distance: number;
  size: number;
  delay: number;
}

const CONFETTI_COLORS = ['#0066EF', '#0052C4', '#0047B3', '#3B82F6', '#ffffff'];

let confettoSeq = 0;

export function MagneticButton({
  children,
  className,
  onClick,
  confetti = true,
  attractRadius = 120,
  type = 'button',
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  confetti?: boolean;
  attractRadius?: number;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 300, damping: 22 });
  const y = useSpring(useMotionValue(0), { stiffness: 300, damping: 22 });
  const [burst, setBurst] = useState<Confetto[]>([]);

  const handleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const influence = Math.max(0, 1 - dist / (rect.width / 2 + attractRadius));
    x.set(dx * 0.18 * influence);
    y.set(dy * 0.22 * influence);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  const handleClick = () => {
    if (confetti) {
      const burstId = ++confettoSeq;
      const next: Confetto[] = Array.from({ length: 14 }, (_, i) => ({
        id: burstId * 100 + i,
        angle: (i / 14) * Math.PI * 2 + Math.random() * 0.4,
        distance: 46 + Math.random() * 42,
        size: 4 + Math.random() * 4,
        delay: Math.random() * 0.05,
      }));
      setBurst(next);
      setTimeout(() => setBurst([]), 1100);
    }
    onClick?.();
  };

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      onClick={handleClick}
      whileTap={{ scale: 0.97 }}
      style={{ x, y }}
      className={cn(
        'relative cursor-pointer select-none overflow-visible rounded-2xl font-semibold',
        'bg-[linear-gradient(93deg,#0052C4,#0066EF,#0047B3)] bg-[length:200%_auto]',
        'animate-gradient text-white shadow-[0_10px_40px_rgba(0,82,196,0.30)]',
        'hover:shadow-[0_14px_56px_rgba(0,82,196,0.45)]',
        'transition-shadow duration-500',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>

      {/* Confettis aux couleurs de la marque au clic */}
      {burst.map((c) => (
        <motion.span
          key={c.id}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 rounded-full"
          style={{
            width: c.size,
            height: c.size,
            backgroundColor: CONFETTI_COLORS[c.id % CONFETTI_COLORS.length],
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos(c.angle) * c.distance,
            y: Math.sin(c.angle) * c.distance - 24,
            opacity: 0,
            scale: 0.4,
          }}
          transition={{ duration: 0.9, delay: c.delay, ease: 'easeOut' }}
        />
      ))}
    </motion.button>
  );
}

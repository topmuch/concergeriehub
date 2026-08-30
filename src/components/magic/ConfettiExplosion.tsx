'use client';

import { useCallback, useState } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiExplosionProps {
  trigger?: boolean;
  colors?: string[];
  onComplete?: () => void;
}

export function ConfettiExplosion({ trigger, colors, onComplete }: ConfettiExplosionProps) {
  const [fired, setFired] = useState(false);

  const fire = useCallback(() => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.6 },
      colors: colors ?? ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'],
      disableForReducedMotion: true,
    });
    onComplete?.();
  }, [colors, onComplete]);

  if (trigger && !fired) {
    setFired(true);
    setTimeout(fire, 100);
  }

  return null;
}

/** Hook to trigger confetti manually */
export function useConfetti() {
  const fire = useCallback((colors?: string[]) => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.6 },
      colors: colors ?? ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'],
      disableForReducedMotion: true,
    });
  }, []);

  return { fire };
}

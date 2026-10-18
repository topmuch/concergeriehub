'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

// =============================================================
// DESIGN PREMIUM « LUXE TECH » — SmoothScroll (Lenis)
// Scroll ultra-doux (1,2 s, easing expo) pour la landing page.
// Désactivé si prefers-reduced-motion (accessibilité) et sur les
// ancres internes natives. À monter UNE FOIS par page concernée.
// =============================================================

export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      duration: 1.2,
      // Équivalent cubic-bezier(0.25, 0.1, 0.25, 1) — décélération douce.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return null;
}

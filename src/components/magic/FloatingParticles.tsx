'use client';

import { useEffect, useRef } from 'react';

interface FloatingParticlesProps {
  /** Number of particles (default: 25) */
  count?: number;
  /** CSS color string (default: rgba(255,255,255,0.3)) */
  color?: string;
  /** Base size in px (default: 4) */
  size?: number;
  /** Animation duration in seconds (default: 18) */
  duration?: number;
  /** If true, particles drift horizontally too */
  drift?: boolean;
}

export function FloatingParticles({
  count = 25,
  color = 'rgba(255,255,255,0.3)',
  size = 4,
  duration = 18,
  drift = true,
}: FloatingParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animId = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const container = containerRef.current;
    if (!container) return;

    const id = ++animId.current;
    const particles: HTMLDivElement[] = [];
    const globalDriftX = drift ? (Math.random() > 0.5 ? '' : '-') + (15 + Math.random() * 30) + 'px' : '0px';

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const s = size * (0.5 + Math.random());
      const left = Math.random() * 100;
      const delay = Math.random() * duration;
      const dur = duration * (0.6 + Math.random() * 0.8);
      const startOpacity = 0.15 + Math.random() * 0.35;

      p.style.cssText = `
        position:absolute;
        width:${s}px;height:${s}px;
        border-radius:50%;
        background:${color};
        left:${left}%;
        bottom:-10px;
        opacity:0;
        animation:pfloat-${id} ${dur}s ${delay}s infinite ease-out;
        will-change:transform,opacity;
      `;
      container.appendChild(p);
      particles.push(p);
    }

    // Inject unique keyframes
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      @keyframes pfloat-${id} {
        0% { transform: translateY(0) translateX(0); opacity: 0; }
        8% { opacity: ${0.3 + Math.random() * 0.3}; }
        50% { transform: translateY(-50vh) translateX(${globalDriftX}); }
        85% { opacity: 0.15; }
        100% { transform: translateY(-105vh) translateX(${globalDriftX}); opacity: 0; }
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      particles.forEach((p) => p.remove());
      styleEl.remove();
    };
  }, [count, color, size, duration, drift]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    />
  );
}

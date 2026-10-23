'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';

// =============================================================
// DESIGN PREMIUM « LUXE TECH » — FloatingParticles
// 30 à 50 particules flottantes (bleu vif/pastel, glow doux) en
// arrière-plan. PRNG déterministe (mulberry32) → rendu identique
// serveur/client, zéro erreur d'hydratation. Pause automatique via
// prefers-reduced-motion (framer-motion n'anime que si autorisé).
// v4.61 — recalibré pour fond clair « AIRBNB PRO » ; v5.1 (COLOR-A)
// : teintes bleu logo plus discrètes, glow bleu au lieu d'ambre.
// =============================================================

const COLORS = ['bg-[#055492]', 'bg-[#8fb1cc]', 'bg-[#1173c7]'];

/** PRNG déterministe — même graine → même séquence SSR/client. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  left: number;
  top: number;
  size: number;
  color: string;
  glow: boolean;
  duration: number;
  delay: number;
  drift: number;
}

export function FloatingParticles({ count = 38, seed = 7, className = '' }: { count?: number; seed?: number; className?: string }) {
  const particles = useMemo<Particle[]>(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, (_, i) => ({
      left: Math.round(rand() * 10000) / 100,
      top: Math.round(rand() * 10000) / 100,
      size: 2 + Math.round(rand() * 2), // 2–4 px
      color: COLORS[i % COLORS.length],
      glow: rand() > 0.6,
      duration: 5 + rand() * 10, // 5–15 s
      delay: -rand() * 12, // départ négatif → désynchronisé dès le 1er rendu
      drift: (rand() - 0.5) * 40,
    }));
  }, [count, seed]);

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute rounded-full ${p.color} ${p.glow ? 'opacity-40 shadow-[0_0_10px_2px_rgba(5, 84, 146,0.35)]' : 'opacity-25'}`}
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size }}
          animate={{ y: [0, -26, 0], x: [0, p.drift, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

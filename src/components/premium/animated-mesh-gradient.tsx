'use client';

import { motion } from 'framer-motion';

// =============================================================
// DESIGN PREMIUM « LUXE TECH » — AnimatedMeshGradient
// 4 blobs de couleur qui flottent lentement derrière le contenu
// (fixed, -z, blur massif). Crée la profondeur « Apple keynote »
// sans coût de rendu (transform/blur GPU).
// v5.1 (COLOR-A) — les voiles clairs ET les variantes dark: passent
// en famille bleu logo à faible opacité (landing claire + surfaces
// light/dark du hub). Décoratif pur — aucune valeur sémantique.
// =============================================================

type Blob = {
  className: string;
  animate: { x: (string | number)[]; y: (string | number)[]; scale?: number[] };
  duration: number;
};

const BLOBS: Blob[] = [
  {
    className: 'bg-[#055492]/[0.12] dark:bg-[#1173c7]/25',
    animate: { x: ['0%', '12%', '-6%', '0%'], y: ['0%', '-10%', '8%', '0%'] },
    duration: 22,
  },
  {
    className: 'bg-[#c8dfef]/40 dark:bg-[#1173c7]/20',
    animate: { x: ['0%', '-14%', '10%', '0%'], y: ['0%', '10%', '-8%', '0%'] },
    duration: 26,
  },
  {
    className: 'bg-[#1173c7]/[0.10] dark:bg-sky-500/20',
    animate: { x: ['0%', '10%', '-12%', '0%'], y: ['0%', '8%', '-6%', '0%'], scale: [1, 1.15, 0.95, 1] },
    duration: 30,
  },
  {
    className: 'bg-[#043455]/[0.08] dark:bg-[#055492]/15',
    animate: { x: ['0%', '-8%', '14%', '0%'], y: ['0%', '-12%', '6%', '0%'], scale: [1, 0.9, 1.1, 1] },
    duration: 34,
  },
];

export function AnimatedMeshGradient({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
    >
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          className={`absolute h-[46vmax] w-[46vmax] rounded-full blur-3xl ${blob.className}`}
          style={{ top: `${12 + i * 22}%`, left: `${i % 2 === 0 ? -8 + i * 4 : 42 + i * 3}%` }}
          animate={blob.animate}
          transition={{ duration: blob.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';

// =============================================================
// AnimatedCheck — coche qui « se dessine » (pathLength 0 → 1)
// lorsqu'elle entre dans le viewport. Partagée par les sections
// Avant/Après et Pricing (features avec checks animés).
// =============================================================

export function AnimatedCheck({ delay = 0 }: { delay?: number }) {
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.35, delay, ease: 'backOut' }}
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3 w-3 text-emerald-600 dark:text-emerald-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d="M20 6 9 17l-5-5"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.45, delay: delay + 0.1, ease: 'easeOut' }}
        />
      </svg>
    </motion.span>
  );
}

'use client';

import { motion } from 'framer-motion';

// =============================================================
// DESIGN PREMIUM « LUXE TECH » — Reveal & StaggerWords
//   • <Reveal>          : apparition au scroll (opacity + y 40px,
//                         easing expo, déclenché à 20 % visible)
//   • <StaggerWords>    : titre qui apparaît mot par mot (fade +
//                         slide-up), pour l'effet « keynote Apple »
// =============================================================

const EASE_EXPO = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  delay = 0,
  y = 40,
  duration = 0.8,
  className,
  once = true,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.2 }}
      transition={{ duration, delay, ease: EASE_EXPO }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerWords({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.09,
  highlightFrom,
  highlightClassName = 'font-serif italic text-gradient-lux animate-gradient',
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  /** Index du mot (0-based) à partir duquel appliquer le style lux. */
  highlightFrom?: number;
  highlightClassName?: string;
}) {
  const words = text.split(/\s+/);
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          aria-hidden="true"
          className={`inline-block ${highlightFrom !== undefined && i >= highlightFrom ? highlightClassName : wordClassName ?? ''}`}
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: delay + i * stagger, ease: EASE_EXPO }}
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  );
}

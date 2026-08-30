'use client';

import { motion } from 'framer-motion';
import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function PageTransition({ children, className = '', delay = 0 }: PageTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Animated entry for a page icon with optional pulse rings */
export function AnimatedIcon({
  children,
  delay = 0,
  className = '',
  pulseRings = 0,
  wobble = false,
  ringColor = 'rgba(255,255,255,0.25)',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  pulseRings?: number;
  wobble?: boolean;
  ringColor?: string;
}) {
  const iconMotion = wobble
    ? { scale: 1, rotate: [0, 10, -10, 0], opacity: 1 }
    : { scale: 1, rotate: 0, opacity: 1 };

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180, opacity: 0 }}
      animate={iconMotion}
      transition={{
        type: 'spring',
        stiffness: 150,
        damping: 12,
        delay,
        ...(wobble ? { rotate: { duration: 5, repeat: Infinity, ease: 'easeInOut' } } : {}),
      }}
      className={`relative inline-flex ${className}`}
    >
      {children}
      {/* Pulse rings */}
      {pulseRings > 0 &&
        Array.from({ length: pulseRings }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border-2 pointer-events-none"
            style={{ borderColor: ringColor }}
            animate={{
              scale: [1, 1.5, 1.8],
              opacity: [0.3, 0.1, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeOut',
              delay: i * 0.4,
            }}
          />
        ))}
    </motion.div>
  );
}

/** Animated title that slides up */
export function AnimatedTitle({ children, delay = 0.2, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Branded footer for public scan pages */
export function BrandedFooter({ delay = 1 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="mt-10 pb-6 text-center"
    >
      <p className="text-white/50 text-xs flex items-center justify-center gap-1.5">
        Propulsé par{' '}
        <a
          href="https://qrdomotik.roomscan.pro"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-white/80 hover:text-white transition-colors underline underline-offset-2 decoration-white/30"
        >
          QR Domotik
        </a>
        {' '}•{' '}
        <a
          href="/"
          className="font-medium text-white/70 hover:text-white transition-colors"
        >
          Créer les miens →
        </a>
      </p>
    </motion.div>
  );
}

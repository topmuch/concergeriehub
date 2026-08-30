'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import React from 'react';

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: React.ReactNode;
  className?: string;
  /** Enable hover scale effect */
  hover?: boolean;
  /** Add a colored glow shadow around the card */
  glow?: string;
  /** Reduce blur for performance */
  light?: boolean;
}

export function GlassCard({
  children,
  className = '',
  hover = true,
  glow,
  light = false,
  ...motionProps
}: GlassCardProps) {
  return (
    <motion.div
      whileHover={hover ? { scale: 1.02, y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={
        `bg-white/10 ${light ? 'backdrop-blur-lg' : 'backdrop-blur-2xl'} rounded-3xl border border-white/20
        ${glow ? `shadow-[0_0_40px_${glow},0_8px_32px_rgba(0,0,0,0.12)]` : 'shadow-[0_8px_32px_rgba(0,0,0,0.12)]'}
        ${className}`
      }
      {...motionProps}
    >
      {children}
    </motion.div>
  );
}

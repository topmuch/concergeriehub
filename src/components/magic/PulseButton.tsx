'use client';

import { motion, type HTMLMotionProps, useMotionValue, useTransform, useSpring } from 'framer-motion';
import React, { useState } from 'react';

interface PulseButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: React.ReactNode;
  pulse?: boolean;
  glow?: string;
  variant?: 'glass' | 'white';
  className?: string;
  onClick?: () => void;
}

export function PulseButton({
  children,
  pulse = true,
  glow = '0 0 20px rgba(255,255,255,0.4)',
  variant = 'glass',
  className = '',
  onClick,
  ...motionProps
}: PulseButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      whileHover={{ scale: 1.05, boxShadow: glow }}
      whileTap={{ scale: 0.95 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
      className={
        `relative overflow-hidden w-full font-bold py-4 px-6 rounded-2xl text-lg
        transition-colors ${className} ${
          variant === 'white'
            ? 'text-blue-600 bg-white shadow-xl'
            : 'text-white bg-white/15 backdrop-blur-sm border border-white/25 shadow-lg'
        }`
      }
      {...motionProps}
    >
      {pulse && (
        <span
          className={`absolute inset-0 rounded-2xl animate-ping-slow ${
            variant === 'white' ? 'bg-blue-100' : 'bg-white/10'
          }`}
          aria-hidden="true"
        />
      )}
      {/* Shine sweep on hover */}
      <motion.span
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"
        animate={{ x: hovered ? ['100%', '-100%'] : '-100%' }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      />
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
      <style>{`
        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 0.4; }
          75%, 100% { transform: scale(1.15); opacity: 0; }
        }
        .animate-ping-slow {
          animation: ping-slow 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </motion.button>
  );
}

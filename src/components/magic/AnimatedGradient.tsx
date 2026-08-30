'use client';

import React from 'react';

export type GradientPreset = 'setup' | 'hub-guest' | 'hub-family';

const GRADIENT_PRESETS: Record<GradientPreset, { from: string; via: string; to: string }> = {
  setup: { from: '#7c3aed', via: '#9333ea', to: '#4f46e5' },
  'hub-guest': { from: '#10b981', via: '#14b8a6', to: '#06b6d4' },
  'hub-family': { from: '#581c87', via: '#7c3aed', to: '#a21caf' },
};

interface AnimatedGradientProps {
  preset?: GradientPreset;
  from?: string;
  via?: string;
  to?: string;
  duration?: number;
  children?: React.ReactNode;
  className?: string;
}

export function AnimatedGradient({
  preset,
  from,
  via,
  to,
  duration = 20,
  children,
  className = '',
}: AnimatedGradientProps) {
  const g = preset
    ? GRADIENT_PRESETS[preset]
    : { from: from ?? '#7c3aed', via: via ?? '#9333ea', to: to ?? '#4f46e5' };

  const animName = `ag-${preset ?? 'custom'}-${g.from.slice(1)}`;

  return (
    <div className={`relative min-h-screen overflow-hidden ${className}`}>
      {/* Main animated gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${g.from} 0%, ${g.via} 50%, ${g.to} 100%)`,
          backgroundSize: '400% 400%',
          animation: `${animName} ${duration}s ease infinite`,
        }}
      />

      {/* Subtle radial glow at top */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% -20%, rgba(255,255,255,0.2) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      {/* Bottom vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 120%, rgba(0,0,0,0.3) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen">{children}</div>

      <style>{`
        @keyframes ${animName} {
          0%, 100% { background-position: 0% 50%; }
          25% { background-position: 100% 0%; }
          50% { background-position: 100% 100%; }
          75% { background-position: 0% 100%; }
        }
      `}</style>
    </div>
  );
}

'use client';

import { type ReactNode } from 'react';

/**
 * Carte style B2B (ex QRTags) : fond blanc, bordure slate-200 fine,
 * radius xl, ombre douce. Épuré, professionnel, sans gradients.
 */
interface QRTCardProps {
  children: ReactNode;
  className?: string;
  /** Header optionnel avec emoji + titre + badge */
  header?: {
    emoji?: string;
    title: string;
    badge?: string;
  };
  /** Sous-titre descriptif sous le header */
  subtitle?: string;
}

export function QRTCard({ children, className = '', header, subtitle }: QRTCardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}
    >
      {header && (
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2.5 mb-1.5">
            {header.emoji && (
              <span className="text-lg leading-none">{header.emoji}</span>
            )}
            <h3 className="text-sm font-semibold text-slate-900">
              {header.title}
            </h3>
            {header.badge && (
              <span className="ml-auto bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                {header.badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 -mt-1">{subtitle}</p>
          )}
        </div>
      )}
      <div className={header ? 'px-5 pb-5' : 'p-5'}>
        {children}
      </div>
    </div>
  );
}

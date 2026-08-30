'use client';

import { type ReactNode } from 'react';

/**
 * QRTags-style card : fond blanc, bordure noire 2px, radius 12px,
 * ombre décalée 4px. Inspire du design QRTags adapte en violet.
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
      className={`bg-white border-2 border-black rounded-[12px] shadow-[4px_4px_0_rgba(0,0,0,0.08)] ${className}`}
    >
      {header && (
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2.5 mb-1.5">
            {header.emoji && (
              <span className="text-lg leading-none">{header.emoji}</span>
            )}
            <h3 className="text-base font-extrabold uppercase tracking-wide text-black">
              {header.title}
            </h3>
            {header.badge && (
              <span className="ml-auto bg-gray-100 border border-gray-300 text-xs font-bold px-2 py-0.5 rounded">
                {header.badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] text-gray-500 -mt-1">{subtitle}</p>
          )}
        </div>
      )}
      <div className={header ? 'px-5 pb-5' : 'p-5'}>
        {children}
      </div>
    </div>
  );
}

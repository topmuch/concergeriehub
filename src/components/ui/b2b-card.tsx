'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * B2BCard — carte blanche épurée, style SaaS professionnel.
 * Bordure slate-200, ombre légère, radius xl. Pas de gradients.
 */
interface B2BCardProps {
  children: ReactNode;
  className?: string;
  /** En-tête optionnel : emoji + titre + badge + sous-titre */
  header?: {
    emoji?: string;
    title: string;
    subtitle?: string;
    badge?: string;
    /** Élément aligné à droite (bouton, switch…) */
    action?: ReactNode;
  };
  /** Pied de carte optionnel (fond gris très clair) */
  footer?: ReactNode;
  /** Ombre portée légère au survol */
  hover?: boolean;
}

export function B2BCard({ children, className, header, footer, hover = false }: B2BCardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-xl shadow-sm',
        hover && 'transition-shadow duration-200 hover:shadow-md',
        className,
      )}
    >
      {header && (
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          {header.emoji && (
            <span className="text-xl leading-none select-none" aria-hidden="true">
              {header.emoji}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-900 leading-tight">{header.title}</h3>
              {header.badge && (
                <span className="inline-flex items-center bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                  {header.badge}
                </span>
              )}
            </div>
            {header.subtitle && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{header.subtitle}</p>
            )}
          </div>
          {header.action}
        </div>
      )}
      <div className={cn(header ? 'px-5 pb-5' : 'p-5')}>{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-xl">{footer}</div>
      )}
    </div>
  );
}

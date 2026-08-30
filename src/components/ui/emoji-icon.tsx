'use client';

import { cn } from '@/lib/utils';

/**
 * EmojiIcon — icône emoji dans une tuile arrondie.
 * Remplace les icônes SVG : lisible, universel, zéro dépendance.
 */
type EmojiIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type EmojiIconVariant = 'default' | 'accent' | 'dark' | 'plain';

interface EmojiIconProps {
  emoji: string;
  size?: EmojiIconSize;
  variant?: EmojiIconVariant;
  className?: string;
}

const SIZE_CLASSES: Record<EmojiIconSize, string> = {
  xs: 'h-7 w-7 text-sm rounded-lg',
  sm: 'h-9 w-9 text-base rounded-lg',
  md: 'h-11 w-11 text-xl rounded-xl',
  lg: 'h-14 w-14 text-2xl rounded-xl',
  xl: 'h-20 w-20 text-4xl rounded-2xl',
};

const VARIANT_CLASSES: Record<EmojiIconVariant, string> = {
  default: 'bg-slate-50 border border-slate-200 shadow-sm',
  accent: 'bg-emerald-50 border border-emerald-200 shadow-sm',
  dark: 'bg-slate-900 border border-slate-900 shadow-sm',
  plain: '',
};

export function EmojiIcon({ emoji, size = 'md', variant = 'default', className }: EmojiIconProps) {
  return (
    <span
      role="img"
      aria-label={emoji}
      className={cn(
        'inline-flex items-center justify-center shrink-0 select-none leading-none',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {emoji}
    </span>
  );
}

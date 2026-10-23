'use client';

// =============================================================
// UI PARTAGÉE — module « Ménage & Stock »
// Petits briques communes aux 5 onglets : champ de saisie saphir,
// bouton fantôme, point de chargement pulsé (aucune icône).
// =============================================================
import { cn } from '@/lib/utils';

/** Classes communes des champs de saisie sur la nuit saphir. */
export const LUX_FIELD =
  'rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50';

/** Bouton secondaire fantôme (shadcn Button + teintes lux). */
export const LUX_GHOST_BTN =
  'rounded-full border-white/12 bg-white/[0.04] font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white';

/** Point pulsé — indicateur de chargement (remplace toute icône busy). */
export function LuxBusyDot({ color = 'rgba(255,255,255,0.9)', className }: { color?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('lux-dot animate-pulse', className)}
      style={{ backgroundColor: color }}
    />
  );
}

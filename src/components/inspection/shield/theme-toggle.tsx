'use client';

// =============================================================
// ROOMSCAN INVENTAIRE — BASCULE MODE CLAIR / SOMBRE (v5.0).
// Demande client : « mettre un mode sombre claire bleuté luxueux ».
// next-themes (ThemeProvider attribute="class" déjà monté dans le
// root layout) : on bascule la classe .dark sur <html> ; tout le
// design system .luxe-* / .shield-page réagit automatiquement.
// Rendu SANS état monté : les deux icônes sont rendues en permanence
// et masquées en CSS (dark:hidden / hidden dark:block) — zéro
// mismatch d'hydratation, zéro setState dans un effet.
// =============================================================
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Basculer entre mode clair et mode sombre"
      title="Mode clair / mode sombre"
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9b45b] ${
        variant === 'dark'
          ? 'text-blue-100 hover:bg-white/10 hover:text-white'
          : 'text-slate-500 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
      }`}
    >
      {/* Lune visible en mode clair (→ basculer en sombre) */}
      <Moon className="h-[18px] w-[18px] dark:hidden" aria-hidden="true" />
      {/* Soleil visible en mode sombre (→ revenir au clair) */}
      <Sun className="hidden h-[18px] w-[18px] dark:block" aria-hidden="true" />
    </button>
  );
}

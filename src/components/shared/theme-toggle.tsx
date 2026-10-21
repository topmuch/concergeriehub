'use client';

// =============================================================
// ThemeToggle — bascule clair / sombre (next-themes) partagée par
// les deux dashboards (Espace Hôte + Console Superadmin). Icône
// soleil/lune avec transition, garde d'hydratation (icône neutre
// tant que le thème n'est pas monté côté client).
// =============================================================
import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Vrai uniquement après hydratation (pattern lint-safe du shell hôte). */
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle({ className, variant = 'ghost' }: { className?: string; variant?: 'ghost' | 'light' | 'ink' }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = mounted ? resolvedTheme === 'dark' : false;

  const base = 'relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors';
  const skin =
    variant === 'light'
      ? 'text-white/85 hover:bg-white/15 hover:text-white' // sur fond coloré foncé (sidebar admin)
      : variant === 'ink'
        ? 'text-[#3a1408]/80 hover:bg-white/45 hover:text-[#2a0d05]' // sur fond corail clair (sidebar hôte)
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'; // sur header glass

  return (
    <button
      type="button"
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(base, skin, className)}
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-[18px] w-[18px] animate-in fade-in zoom-in-50" />
        ) : (
          <Moon className="h-[18px] w-[18px] animate-in fade-in zoom-in-50" />
        )
      ) : (
        <span className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}

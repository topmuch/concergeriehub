'use client';

// =============================================================
// v4.77-c2 — SÉLECTEUR DE LANGUE des espaces hôte (5 drapeaux)
// -------------------------------------------------------------
// Deux variantes, même source de vérité (useAdminLang) :
//   • variant="pills" → 5 drapeaux cliquables en pastille discrète
//     (page de connexion, fond sombre, en haut à droite) ;
//   • variant="menu" → dropdown compact avec drapeau + langue
//     active et coche sur la langue courante (header/sidebar du
//     dashboard hôte).
// =============================================================

import { Check, ChevronDown, Languages } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ADMIN_LANGS, useAdminLang } from '@/lib/admin-i18n';

export function AdminLangSwitcher({
  variant = 'menu',
  className,
}: {
  variant?: 'pills' | 'menu';
  className?: string;
}) {
  const { lang, setLang, t } = useAdminLang();
  const current = ADMIN_LANGS.find((l) => l.code === lang) ?? ADMIN_LANGS[0];

  // ── Pastille 5 drapeaux (page de connexion) ──
  if (variant === 'pills') {
    return (
      <div
        role="group"
        aria-label={t('Choisir la langue')}
        className={cn(
          'flex items-center gap-0.5 rounded-full border border-slate-700/50 bg-slate-900/60 p-1 backdrop-blur',
          className,
        )}
      >
        {ADMIN_LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            aria-pressed={lang === l.code}
            aria-label={l.label}
            title={l.label}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]',
              lang === l.code
                ? 'scale-105 bg-white/15 shadow-sm ring-1 ring-white/40'
                : 'opacity-60 hover:bg-white/10 hover:opacity-100',
            )}
          >
            <span aria-hidden="true">{l.flag}</span>
          </button>
        ))}
      </div>
    );
  }

  // ── Dropdown compact (sidebar/header du dashboard hôte) ──
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('Choisir la langue')}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 text-sm font-semibold text-foreground shadow-sm transition-all hover:shadow-md dark:border-white/15 dark:bg-white/10',
            className,
          )}
        >
          <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span aria-hidden="true" className="text-base leading-none">
            {current.flag}
          </span>
          <span className="hidden text-xs sm:inline">{current.label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t('Choisir la langue')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ADMIN_LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code)}
            className="gap-2"
            aria-selected={lang === l.code}
          >
            <span aria-hidden="true" className="w-5 text-center text-base leading-none">
              {l.flag}
            </span>
            <span className="flex-1 font-medium">{l.label}</span>
            {lang === l.code && <Check className="h-4 w-4 text-[#0066EF]" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AdminLangSwitcher;

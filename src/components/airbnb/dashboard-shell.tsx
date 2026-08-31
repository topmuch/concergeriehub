'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

/**
 * DashboardShell — coquille de l'Espace Hôte B2B (/airbnb/dashboard/*).
 * Header sticky avec BrandLogo + navigation, contenu, footer collé en bas
 * (min-h-screen flex flex-col + mt-auto). Toaster sonner monté localement.
 */

const NAV_ITEMS = [
  { href: '/airbnb/dashboard', label: 'Dashboard', emoji: '📊' },
  { href: '/airbnb/dashboard/plaques', label: 'Plaques', emoji: '🏷️' },
  { href: '/airbnb/dashboard/providers', label: 'Prestataires', emoji: '🧹' },
  { href: '/airbnb/billing', label: 'Abonnement', emoji: '💳' },
];

interface DashboardShellProps {
  children: ReactNode;
  /** Nom complet de l'utilisateur connecté (null si visiteur) */
  userName?: string | null;
}

export function DashboardShell({ children, userName }: DashboardShellProps) {
  const pathname = usePathname();
  const initials = userName
    ? userName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('')
    : '?';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ----- Header sticky ----- */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto w-full px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" aria-label="Retour au site Conciergerie Hub" className="shrink-0">
              <BrandLogo size="sm" />
            </Link>
            <nav aria-label="Navigation espace hôte" className="flex items-center gap-1 sm:gap-2">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === '/airbnb/dashboard'
                    ? pathname === '/airbnb/dashboard'
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-2.5 py-2 transition-colors',
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
                    )}
                  >
                    <span aria-hidden="true">{item.emoji}</span>
                    <span className="hidden xs:inline sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {userName && (
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden="true"
                  className="h-8 w-8 rounded-full bg-slate-900 text-white text-xs font-bold inline-flex items-center justify-center shrink-0"
                >
                  {initials}
                </span>
                <span className="hidden sm:block text-sm font-semibold text-slate-900 truncate max-w-[140px]">
                  {userName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ----- Contenu ----- */}
      <main className="flex-1 w-full">{children}</main>

      {/* ----- Footer (collé en bas grâce à mt-auto) ----- */}
      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto w-full px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            🗝️ <span className="font-semibold text-slate-700">Conciergerie Hub</span> — Espace Hôte
          </p>
          <p className="text-xs text-slate-400">
            La conciergerie digitale de vos locations — sans application
          </p>
        </div>
      </footer>

      <Toaster position="top-center" richColors />
    </div>
  );
}

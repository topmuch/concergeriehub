'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

/**
 * AdminShell — coquille de la Console Superadmin (/admin/*).
 * Même style QRTags que l'Espace Hôte (fond slate-50, cartes
 * blanches) avec une identité "contrôle" : badge bouclier sombre.
 * Footer collé en bas (min-h-screen flex flex-col + mt-auto).
 */

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Vue d\u2019ensemble', emoji: '📊' },
  { href: '/admin/providers', label: 'Prestataires', emoji: '🧹' },
  { href: '/admin/hosts', label: 'Hôtes', emoji: '🏠' },
];

interface AdminShellProps {
  children: ReactNode;
  adminName: string;
}

export function AdminShell({ children, adminName }: AdminShellProps) {
  const pathname = usePathname();
  const initials = adminName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'SA';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ----- Header sticky ----- */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto w-full px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-5 min-w-0">
            <Link href="/" aria-label="Retour au site Conciergerie Hub" className="shrink-0">
              <BrandLogo size="sm" />
            </Link>
            <span
              className="hidden md:inline-flex items-center gap-1.5 bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
              title="Session Superadmin"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Superadmin
            </span>
            <nav aria-label="Navigation console superadmin" className="flex items-center gap-1 sm:gap-2">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === '/admin/dashboard'
                    ? pathname === '/admin/dashboard'
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

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className="h-8 w-8 rounded-full bg-slate-900 text-white text-xs font-bold inline-flex items-center justify-center shrink-0"
              >
                {initials}
              </span>
              <span className="hidden sm:block text-sm font-semibold text-slate-900 truncate max-w-[140px]">
                {adminName}
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
        </div>
      </header>

      {/* ----- Contenu ----- */}
      <main className="flex-1 w-full">{children}</main>

      {/* ----- Footer (collé en bas grâce à mt-auto) ----- */}
      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto w-full px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            🛡️ <span className="font-semibold text-slate-700">Conciergerie Hub</span> — Console Superadmin
          </p>
          <p className="text-xs text-slate-400">
            Centre de contrôle de la plateforme — accès restreint
          </p>
        </div>
      </footer>

      <Toaster position="top-center" richColors />
    </div>
  );
}

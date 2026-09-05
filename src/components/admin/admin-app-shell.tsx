'use client';

import { type ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, ShieldCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdminAppSidebar } from '@/components/admin/admin-app-sidebar';
import { AdminGlobalSearch } from '@/components/admin/admin-global-search';
import { AdminNotifications } from '@/components/admin/admin-notifications';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';

// =============================================================
// AdminAppShell — coquille Console Superadmin V3 (8 modules)
// Sidebar slate-900 (AdminAppSidebar) + header blanc sticky :
// burger, titre de section, recherche globale, notifications,
// badge Superadmin, menu profil (identité + déconnexion).
// Contenu sur fond slate-50, footer collé en bas (mt-auto).
// =============================================================

const SECTION_TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p === '/admin' || p.startsWith('/admin/dashboard'), title: '📊 Tableau de bord' },
  { match: (p) => p.startsWith('/admin/users'), title: '👥 Clients & Hôtes' },
  { match: (p) => p.startsWith('/admin/subscriptions'), title: '💳 Abonnements' },
  { match: (p) => p.startsWith('/admin/qr'), title: '⬛ Générateur QR' },
  { match: (p) => p.startsWith('/admin/providers'), title: '🧰 Prestataires' },
  { match: (p) => p.startsWith('/admin/transactions'), title: '🛒 Transactions' },
  { match: (p) => p.startsWith('/admin/emails'), title: '📧 Emails' },
  { match: (p) => p.startsWith('/admin/logs'), title: '📜 Logs & Tickets' },
  { match: (p) => p.startsWith('/admin/settings'), title: '⚙️ Paramètres' },
];

interface AdminAppShellProps {
  children: ReactNode;
  adminName: string;
  adminEmail: string;
}

export function AdminAppShell({ children, adminName, adminEmail }: AdminAppShellProps) {
  const pathname = usePathname();
  const section = SECTION_TITLES.find((s) => s.match(pathname));
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SidebarProvider>
      <AdminAppSidebar adminName={adminName} adminEmail={adminEmail} />
      <SidebarInset className="min-h-screen flex flex-col bg-slate-50">
        {/* ----- Header blanc sticky ----- */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-3 sm:px-6">
          <SidebarTrigger
            aria-label="Afficher ou masquer le menu"
            className="text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          />
          <h1 className="hidden truncate text-lg font-extrabold tracking-tight text-slate-900 lg:block xl:text-2xl">
            {section?.title ?? 'Console'}
          </h1>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <AdminGlobalSearch />
            <AdminNotifications />
            <span
              className="hidden items-center gap-1.5 bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full xl:inline-flex"
              title="Session Superadmin"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Superadmin
            </span>

            {/* ----- Menu profil ----- */}
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Menu du profil"
                  aria-haspopup="menu"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white transition-opacity hover:opacity-90 sm:h-9 sm:w-9"
                >
                  {adminName
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? '')
                    .join('') || 'SA'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-bold text-slate-900">{adminName}</p>
                  <p className="truncate text-xs font-normal text-slate-500">{adminEmail}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="cursor-pointer text-red-600 focus:text-red-600"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ----- Contenu ----- */}
        <main className="flex-1 w-full text-slate-900">{children}</main>

        {/* ----- Footer copyright (collé en bas : mt-auto) ----- */}
        <footer className="mt-auto border-t border-slate-200 bg-white py-4">
          <p className="text-center text-xs text-slate-500">
            Copyright © <span className="font-semibold text-slate-700">Conciergerie Hub</span> 2025
            — Centre de contrôle de la plateforme, accès restreint
          </p>
        </footer>

        <Toaster position="top-center" richColors />
      </SidebarInset>
    </SidebarProvider>
  );
}

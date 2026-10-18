'use client';

import { type ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
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
// AdminAppShell — v5.2 « SAPHIR LUXE » : sidebar nuit saphir (tokens
// lux-sidebar) + header glass luxueux (recherche, notifications,
// monogramme, thème via sidebar), surface nuit bleutée lux-bg,
// footer collé bas. Design SANS ICÔNES (demande client).
// =============================================================

const SECTION_TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p === '/admin' || p.startsWith('/admin/dashboard'), title: 'Tableau de bord' },
  { match: (p) => p.startsWith('/admin/users'), title: 'Clients & Hôtes' },
  { match: (p) => p.startsWith('/admin/hosts'), title: 'Biens & Plaques' },
  { match: (p) => p.startsWith('/admin/subscriptions'), title: 'Abonnements' },
  { match: (p) => p.startsWith('/admin/qr'), title: 'Générateur QR' },
  { match: (p) => p.startsWith('/admin/providers'), title: 'Prestataires' },
  { match: (p) => p.startsWith('/admin/transactions'), title: 'Transactions' },
  { match: (p) => p.startsWith('/admin/emails'), title: 'Emails' },
  { match: (p) => p.startsWith('/admin/content'), title: 'Contenu universel' },
  { match: (p) => p.startsWith('/admin/logs'), title: 'Logs & Tickets' },
  { match: (p) => p.startsWith('/admin/settings'), title: 'Paramètres' },
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
      <SidebarInset className="lux lux-bg min-h-screen flex flex-col">
        {/* ----- Header glass luxueux ----- */}
        <header className="lux-header sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <SidebarTrigger
            aria-label="Afficher ou masquer le menu"
            className="text-white/70 hover:bg-white/8 hover:text-white"
          />
          <div className="hidden items-center gap-2.5 lg:flex">
            <h1 className="truncate text-lg font-semibold tracking-tight text-white">
              {section?.title ?? 'Console'}
            </h1>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[#e9c47c]/35 bg-[#e9c47c]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e9c47c]"
              title="Session Superadmin"
            >
              Superadmin
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <AdminGlobalSearch />
            <AdminNotifications />

            {/* ----- Menu profil ----- */}
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Menu du profil"
                  aria-haspopup="menu"
                  className="lux-num flex h-10 w-10 items-center justify-center rounded-full bg-[#e9c47c] text-xs font-semibold text-[#1a1206] ring-2 ring-[#e9c47c]/30 transition-transform hover:scale-105 sm:h-9 sm:w-9"
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
                  <p className="truncate text-sm font-bold text-foreground">{adminName}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{adminEmail}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="cursor-pointer text-red-400 focus:text-red-400 focus:bg-white/8"
                >
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ----- Contenu ----- */}
        <main className="flex-1 w-full text-foreground">{children}</main>

        {/* ----- Footer copyright (collé en bas : mt-auto) ----- */}
        <footer className="mt-auto border-t border-white/8 py-4">
          <p className="text-center text-xs text-[#8fa0c2]">
            Copyright © <span className="lux-display font-semibold text-white/80">RoomScan</span> 2025
            — Centre de contrôle de la plateforme, accès restreint
          </p>
        </footer>

        <Toaster position="top-center" richColors />
      </SidebarInset>
    </SidebarProvider>
  );
}

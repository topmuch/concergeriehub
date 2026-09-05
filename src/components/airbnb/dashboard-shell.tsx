'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Building2,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Palette,
  QrCode,
  ReceiptText,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { NotificationsBell } from '@/components/airbnb/notifications-bell';
import { cn } from '@/lib/utils';

// =============================================================
// DashboardShell — coquille « Travl » de l'Espace Hôte B2B
// (/airbnb/dashboard/* et /airbnb/billing).
//
// Modèle : sidebar coral pleine hauteur (logo + navigation +
// carte utilisateur) + header blanc sticky (burger, titre de
// section, notifications, avatar) + contenu sur fond gris clair +
// footer copyright centré. Sidebar shadcn : Sheet mobile natif,
// collapsible en icônes sur desktop.
// =============================================================

const NAV_ITEMS = [
  { href: '/airbnb/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/airbnb/dashboard/portfolio', label: 'Portfolio', icon: Building2 },
  { href: '/airbnb/dashboard/orders', label: 'Commandes', icon: ReceiptText },
  { href: '/airbnb/dashboard/automations', label: 'Automatisations', icon: Zap },
  { href: '/airbnb/dashboard/plaques', label: 'Plaques', icon: QrCode },
  { href: '/airbnb/dashboard/providers', label: 'Prestataires', icon: Sparkles },
  { href: '/airbnb/dashboard/branding', label: 'Branding', icon: Palette },
  { href: '/airbnb/billing', label: 'Abonnement', icon: CreditCard },
];

const SECTION_TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p === '/airbnb/dashboard', title: 'Dashboard' },
  { match: (p) => p.startsWith('/airbnb/dashboard/portfolio'), title: 'Portfolio' },
  { match: (p) => p.startsWith('/airbnb/dashboard/orders'), title: 'Commandes' },
  { match: (p) => p.startsWith('/airbnb/dashboard/automations'), title: 'Automatisations' },
  { match: (p) => p.startsWith('/airbnb/dashboard/plaques'), title: 'Plaques QR' },
  { match: (p) => p.startsWith('/airbnb/dashboard/providers'), title: 'Prestataires' },
  { match: (p) => p.startsWith('/airbnb/dashboard/branding'), title: 'Branding' },
  { match: (p) => p.startsWith('/airbnb/billing'), title: 'Abonnement' },
];

function initialsOf(name: string | null | undefined): string {
  return (
    name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

interface DashboardShellProps {
  children: ReactNode;
  /** Nom complet de l'utilisateur connecté (null si visiteur) */
  userName?: string | null;
}

export function DashboardShell({ children, userName }: DashboardShellProps) {
  const pathname = usePathname();
  const section = SECTION_TITLES.find((s) => s.match(pathname));
  const initials = initialsOf(userName);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-white/10">
        {/* ----- Logo ----- */}
        <SidebarHeader className="pt-5 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Retour au site">
                <Link href="/" aria-label="Retour au site Conciergerie Hub">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-base font-extrabold text-[#E23F2B] shadow-sm"
                  >
                    CH
                  </span>
                  <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
                    <span className="truncate text-base font-extrabold text-white">
                      Conciergerie Hub
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                      Espace Hôte
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* ----- Navigation ----- */}
        <SidebarContent className="px-2 pt-2">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {NAV_ITEMS.map((item) => {
                  const active =
                    item.href === '/airbnb/dashboard'
                      ? pathname === '/airbnb/dashboard'
                      : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'h-11 rounded-xl text-[15px] font-medium text-white/85 hover:bg-white/10 hover:text-white data-[active=true]:bg-white data-[active=true]:font-bold data-[active=true]:text-[#E23F2B] data-[active=true]:hover:bg-white data-[active=true]:hover:text-[#E23F2B]',
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span>{item.label}</span>
                          <ChevronRight
                            className="ml-auto h-4 w-4 opacity-60 group-data-[collapsible=icon]:hidden"
                            aria-hidden="true"
                          />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* ----- Carte utilisateur ----- */}
        <SidebarFooter className="pb-5">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-[#E23F2B]"
                >
                  {initials}
                </span>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-bold text-white">{userName ?? 'Invité'}</p>
                  <p className="text-[11px] text-white/70">Hôte · Conciergerie Hub</p>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  title="Se déconnecter"
                  aria-label="Se déconnecter"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white group-data-[collapsible=icon]:hidden"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-screen flex flex-col bg-[#F4F5F7]">
        {/* ----- Header blanc sticky ----- */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <SidebarTrigger
            aria-label="Afficher ou masquer le menu"
            className="text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          />
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {section?.title ?? 'Espace Hôte'}
          </h1>
          {userName && (
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {/* Centre de notifications hôte (badge) */}
              <NotificationsBell />
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EE4B35] text-xs font-extrabold text-white"
              >
                {initials}
              </span>
            </div>
          )}
        </header>

        {/* ----- Contenu ----- */}
        <main className="flex-1 w-full">{children}</main>

        {/* ----- Footer copyright (collé en bas : mt-auto) ----- */}
        <footer className="mt-auto border-t border-slate-200 bg-white py-4">
          <p className="text-center text-xs text-slate-500">
            Copyright © <span className="font-semibold text-slate-700">Conciergerie Hub</span> 2025
            — La conciergerie digitale de vos locations, sans application
          </p>
        </footer>

        <Toaster position="top-center" richColors />
      </SidebarInset>
    </SidebarProvider>
  );
}

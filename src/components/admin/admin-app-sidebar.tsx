'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ChevronRight,
  Globe,
  LayoutDashboard,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
// =============================================================
// AdminAppSidebar — barre latérale de la Console Superadmin V2.
// Navigation principale (Vue d'ensemble / Hôtes / Prestataires),
// identité Superadmin, déconnexion. Collapsible en icônes,
// Sheet automatique sur mobile (shadcn Sidebar).
// =============================================================

const NAV_ITEMS = [
  {
    href: '/admin/dashboard',
    label: 'Vue d\u2019ensemble',
    description: 'KPIs, revenus et activité',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/hosts',
    label: 'Hôtes',
    description: 'Comptes et abonnements',
    icon: Users,
  },
  {
    href: '/admin/providers',
    label: 'Prestataires',
    description: 'Annuaire et géolocalisation',
    icon: Sparkles,
  },
];

interface AdminAppSidebarProps {
  adminName: string;
  adminEmail: string;
}

export function AdminAppSidebar({ adminName, adminEmail }: AdminAppSidebarProps) {
  const pathname = usePathname();

  const initials =
    adminName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'SA';

  return (
    <Sidebar collapsible="icon">
      {/* ----- En-tête : marque + badge contrôle ----- */}
      <SidebarHeader className="pt-5 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Retour au site">
              <Link href="/" aria-label="Retour au site Conciergerie Hub">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#E23F2B] shadow-sm"
                >
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
                  <span className="truncate text-base font-extrabold text-white">
                    Conciergerie Hub
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                    Console Superadmin
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ----- Navigation principale ----- */}
      <SidebarContent className="px-2 pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-white/60">Pilotage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === '/admin/dashboard'
                    ? pathname === '/admin/dashboard' || pathname === '/admin'
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={`${item.label} — ${item.description}`}
                    >
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className="h-11 rounded-xl text-[15px] font-medium text-white/85 hover:bg-white/10 hover:text-white data-[active=true]:bg-white data-[active=true]:font-bold data-[active=true]:text-[#E23F2B] data-[active=true]:hover:bg-white data-[active=true]:hover:text-[#E23F2B]"
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-white/60">Plateforme</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith('/admin/emails')}
                  tooltip="Emails transactionnels — outbox et retries"
                >
                  <Link
                    href="/admin/emails"
                    aria-current={pathname.startsWith('/admin/emails') ? 'page' : undefined}
                    className="h-11 rounded-xl text-[15px] font-medium text-white/85 hover:bg-white/10 hover:text-white data-[active=true]:bg-white data-[active=true]:font-bold data-[active=true]:text-[#E23F2B] data-[active=true]:hover:bg-white data-[active=true]:hover:text-[#E23F2B]"
                  >
                    <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>Emails</span>
                    <ChevronRight
                      className="ml-auto h-4 w-4 opacity-60 group-data-[collapsible=icon]:hidden"
                      aria-hidden="true"
                    />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Site public — Conciergerie Hub" asChild>
                  <Link
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    className="h-11 rounded-xl text-[15px] font-medium text-white/85 hover:bg-white/10 hover:text-white"
                  >
                    <Globe className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>Site public</span>
                    <ChevronRight
                      className="ml-auto h-4 w-4 opacity-60 group-data-[collapsible=icon]:hidden"
                      aria-hidden="true"
                    />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ----- Pied : compte admin ----- */}
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
                <p className="truncate text-sm font-bold text-white">{adminName}</p>
                <p className="truncate text-[11px] text-white/70">{adminEmail}</p>
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
  );
}

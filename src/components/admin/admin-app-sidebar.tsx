'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
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
import { cn } from '@/lib/utils';

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
    <Sidebar collapsible="icon" className="border-r border-slate-200">
      {/* ----- En-tête : marque + badge contrôle ----- */}
      <SidebarHeader className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Retour au site">
              <Link href="/" aria-label="Retour au site Conciergerie Hub">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"
                >
                  <ShieldCheck className="h-4.5 w-4.5" />
                </span>
                <span className="flex min-w-0 flex-col items-start gap-0.5 leading-none">
                  <BrandLogo size="sm" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Console Superadmin
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ----- Navigation principale ----- */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Pilotage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
                        className={cn(
                          active
                            ? 'bg-slate-900 text-white hover:bg-slate-800 hover:text-white'
                            : 'text-slate-600',
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Plateforme</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith('/admin/emails')}
                  tooltip="Emails transactionnels — outbox et retries"
                >
                  <Link
                    href="/admin/emails"
                    aria-current={pathname.startsWith('/admin/emails') ? 'page' : undefined}
                    className={cn(
                      pathname.startsWith('/admin/emails')
                        ? 'bg-slate-900 text-white hover:bg-slate-800 hover:text-white'
                        : 'text-slate-600',
                    )}
                  >
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    <span className="font-medium">Emails</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Site public — Conciergerie Hub" asChild>
                  <Link href="/" target="_blank" rel="noreferrer">
                    <span aria-hidden="true" className="text-base leading-none">
                      🌐
                    </span>
                    <span className="font-medium">Site public</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ----- Pied : compte admin ----- */}
      <SidebarFooter className="pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white"
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-semibold text-slate-900">{adminName}</p>
                <p className="truncate text-[11px] text-slate-500">{adminEmail}</p>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 group-data-[collapsible=icon]:hidden"
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

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ChevronRight,
  CreditCard,
  Globe,
  LayoutDashboard,
  LogOut,
  Mail,
  QrCode,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wrench,
  Home,
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
// AdminAppSidebar — Console Superadmin V3 (8 modules, prompt SaaS)
// Style QRTags imposé : fond slate-900, texte blanc, emojis,
// icônes lucide-react. Les 8 modules :
//  1 Dashboard · 2 Clients · 3 Générateur QR · 4 Abonnements
//  5 Prestataires · 6 Transactions · 7 Paramètres · 8 Logs
// + Emails (Plateforme) et lien vers le site public.
// =============================================================

interface NavItem {
  href: string;
  label: string;
  emoji: string;
  description: string;
  icon: React.ElementType;
  exact?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Pilotage',
    items: [
      {
        href: '/admin/dashboard',
        label: 'Tableau de bord',
        emoji: '📊',
        description: 'KPIs temps réel, revenus et activité',
        icon: LayoutDashboard,
        exact: true,
      },
      {
        href: '/admin/users',
        label: 'Clients & Hôtes',
        emoji: '👥',
        description: 'Comptes, plans et actions',
        icon: Users,
      },
      {
        // AUD-FULL : /admin/hosts était orphelin (page existante,
        // aucun lien) — intégré à la navigation (FIX-9c).
        href: '/admin/hosts',
        label: 'Biens & Plaques',
        emoji: '🏠',
        description: 'Hôtes, propriétés et plaques QR',
        icon: Home,
      },
      {
        href: '/admin/subscriptions',
        label: 'Abonnements',
        emoji: '💳',
        description: 'MRR, plans, factures, coupons',
        icon: CreditCard,
      },
    ],
  },
  {
    label: 'Opérations',
    items: [
      {
        href: '/admin/qr',
        label: 'Générateur QR',
        emoji: '⬛',
        description: 'Lots, plaques physiques, setup tokens',
        icon: QrCode,
      },
      {
        href: '/admin/providers',
        label: 'Prestataires',
        emoji: '🧰',
        description: 'Annuaire, carte, vérifications',
        icon: Wrench,
      },
      {
        href: '/admin/transactions',
        label: 'Transactions',
        emoji: '🛒',
        description: 'Commandes, marketplace, reversements',
        icon: ShoppingCart,
      },
    ],
  },
  {
    label: 'Plateforme',
    items: [
      {
        href: '/admin/emails',
        label: 'Emails',
        emoji: '📧',
        description: 'Outbox transactionnelle et retries',
        icon: Mail,
      },
      {
        href: '/admin/logs',
        label: 'Logs & Tickets',
        emoji: '📜',
        description: 'Audit, scans, support',
        icon: ScrollText,
      },
      {
        href: '/admin/settings',
        label: 'Paramètres',
        emoji: '⚙️',
        description: 'Plateforme, white-label, sécurité',
        icon: Settings,
      },
    ],
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
    <Sidebar
      collapsible="icon"
      style={{ ['--sidebar' as string]: '#0f172a' }} // Module 1 — fond slate-900 imposé
    >
      {/* ----- En-tête : marque + badge contrôle ----- */}
      <SidebarHeader className="pt-5 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Retour au site">
              <Link href="/" aria-label="Retour au site Conciergerie Hub">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-900 shadow-sm"
                >
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
                  <span className="truncate text-base font-extrabold text-white">
                    Conciergerie Hub
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                    Console Superadmin
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ----- Navigation 8 modules ----- */}
      <SidebarContent className="px-2 pt-2">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-white/50">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href || pathname === '/admin'
                    : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={`${item.emoji} ${item.label} — ${item.description}`}
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className="h-11 rounded-xl text-[14px] font-medium text-white/85 hover:bg-white/10 hover:text-white data-[active=true]:bg-white data-[active=true]:font-bold data-[active=true]:text-slate-900 data-[active=true]:hover:bg-white data-[active=true]:hover:text-slate-900"
                        >
                          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            <span aria-hidden="true" className="mr-1.5">{item.emoji}</span>
                            {item.label}
                          </span>
                          <ChevronRight
                            className="ml-auto h-4 w-4 opacity-50 group-data-[collapsible=icon]:hidden"
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
        ))}

        {/* Lien externe : site public */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Ouvrir le site public Conciergerie Hub" asChild>
                  <Link
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    className="h-11 rounded-xl text-[14px] font-medium text-white/85 hover:bg-white/10 hover:text-white"
                  >
                    <Globe className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>🌐 Site public</span>
                    <ChevronRight
                      className="ml-auto h-4 w-4 opacity-50 group-data-[collapsible=icon]:hidden"
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-slate-900"
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-bold text-white">{adminName}</p>
                <p className="truncate text-[11px] text-white/60">{adminEmail}</p>
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

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
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
import { ThemeToggle } from '@/components/shared/theme-toggle';

// =============================================================
// AdminAppSidebar — v6.0 « LUXE AURA » — sidebar rouge Airbnb,
// navigation TYPOGRAPHIQUE SANS ICÔNES : pastille colorée par groupe,
// onglet actif = pilule blanche (via .lux-sidebar en CSS), profil +
// bascule thème.
// =============================================================

// v6.0 — point de couleur par groupe (Pilotage / Opérations / Plateforme)
const GROUP_DOTS: Record<string, string> = {
  Pilotage: '#ffd76a',
  'Opérations': '#7ce7c8',
  'Plateforme': '#9ec1ff',
};

interface NavItem {
  href: string;
  label: string;
  description: string;
  exact?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Pilotage',
    items: [
      {
        href: '/admin/dashboard',
        label: 'Tableau de bord',
        description: 'KPIs temps réel, revenus et activité',
        exact: true,
      },
      {
        href: '/admin/monitoring',
        label: 'Tour de Contrôle',
        description: 'Santé système, incidents et crons',
      },
      {
        href: '/admin/users',
        label: 'Clients & Hôtes',
        description: 'Comptes, plans et actions',
      },
      {
        href: '/admin/hosts',
        label: 'Biens & Plaques',
        description: 'Hôtes, propriétés et plaques QR',
      },
      {
        href: '/admin/subscriptions',
        label: 'Abonnements',
        description: 'MRR, plans, factures, coupons',
      },
      {
        href: '/admin/invoices',
        label: 'Commissions',
        description: 'Factures mensuelles des hôtes',
      },
      {
        href: '/admin/notification-settings',
        label: 'Notifications',
        description: 'Smart Prompts, contrôle global, impact',
      },
    ],
  },
  {
    label: 'Opérations',
    items: [
      {
        href: '/admin/qr',
        label: 'Générateur QR',
        description: 'Lots, plaques physiques, setup tokens',
      },
      {
        href: '/admin/providers',
        label: 'Prestataires',
        description: 'Annuaire, carte, vérifications',
      },
      {
        href: '/admin/transactions',
        label: 'Transactions',
        description: 'Commandes, marketplace, reversements',
      },
    ],
  },
  {
    label: 'Plateforme',
    items: [
      {
        href: '/admin/emails',
        label: 'Emails',
        description: 'Outbox transactionnelle et configuration',
      },
      {
        href: '/admin/content',
        label: 'Contenu universel',
        description: 'Guidebook & appareils partagés',
      },
      {
        href: '/admin/voices',
        label: 'Voix plateforme',
        description: 'Voix par défaut des messages du Hub',
      },
      {
        href: '/admin/logs',
        label: 'Logs & Tickets',
        description: 'Audit, scans, support',
      },
      {
        href: '/admin/settings',
        label: 'Paramètres',
        description: 'Plateforme, white-label, sécurité',
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
      className="lux-sidebar lux-sidebar-admin border-none"
      style={{ ['--sidebar' as string]: 'transparent' }}
    >
      {/* ----- En-tête : marque + badge contrôle ----- */}
      <SidebarHeader className="relative z-10 pb-2 pt-5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Retour au site">
              <Link href="/" aria-label="Retour au site RoomScan">
                {/* Logo officiel RoomScan — variante blanche (fonds sombres), proportions d'origine */}
                <Image
                  src="/brand/roomscan-icon-white.png"
                  alt=""
                  width={124}
                  height={121}
                  className="shrink-0"
                  style={{ height: 40, width: 'auto' }}
                />
                <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
                  <span className="lux-display truncate text-base font-semibold text-white">
                    RoomScan
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#e9c47c]">
                    Console Superadmin
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ----- Navigation 3 groupes (typographique, sans icône) ----- */}
      <SidebarContent className="lux-scroll relative z-10 px-2 pt-2">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.3em] text-white/60">
              <span
                className="lux-dot shrink-0"
                style={{ backgroundColor: GROUP_DOTS[group.label] ?? '#ffffff' }}
                aria-hidden="true"
              />
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href || pathname === '/admin'
                    : pathname.startsWith(item.href);
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
                          aria-label={`${item.label} — ${item.description}`}
                        >
                          <span className="truncate">{item.label}</span>
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
                <SidebarMenuButton tooltip="Ouvrir le site public RoomScan" asChild>
                  <Link
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Ouvrir le site public RoomScan"
                  >
                    <span>Site public</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ----- Pied : bascule thème + compte admin ----- */}
      <SidebarFooter className="relative z-10 pb-5">
        <div className="mb-2 flex items-center justify-end px-2 group-data-[collapsible=icon]:justify-center">
          <ThemeToggle variant="light" />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
              <span
                aria-hidden="true"
                className="lux-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9c47c] text-xs font-semibold text-[#1a1206]"
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-semibold text-white">{adminName}</p>
                <p className="truncate text-[11px] text-white/55">{adminEmail}</p>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60 transition-colors hover:bg-white/10 hover:text-white group-data-[collapsible=icon]:hidden"
              >
                Quitter
              </button>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

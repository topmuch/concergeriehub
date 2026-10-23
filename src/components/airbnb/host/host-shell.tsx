'use client';

import { type ReactNode, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { NotificationsBell } from '@/components/airbnb/notifications-bell';
import { MessagesButton, MessagesNavBadge } from '@/components/airbnb/messages-badge';
import {
  HostProvider,
  useHostContext,
  type HostProperty,
} from '@/components/airbnb/host/host-context';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/shared/theme-toggle';
// v4.77-c2 « ADMIN I18N » — libellés du shell (sidebar/header) en 5 langues.
import { AdminLangProvider, useAdminLang } from '@/lib/admin-i18n';
import { AdminLangSwitcher } from '@/components/admin/lang-switcher';

// =============================================================
// HostShell — v5.2 « SAPHIR LUXE » — refonte design du shell
// Espace Hôte (/airbnb/*) — demande client : design simple, luxueux,
// professionnel · mode sombre bleuté · SANS ICÔNES :
//  • Sidebar nuit saphir — navigation TYPOGRAPHIQUE (majuscules
//    espacées, filet doré sur l'onglet actif) ;
//  • Navigation RÉORGANISÉE (inchangée fonctionnellement) en 4 groupes
//    (Pilotage / Mes biens / Services / Business) + « Mes tâches » ;
//  • Header glass luxueux : sélecteur de propriété (point coloré),
//    messages, alertes, ajout de bien — aucun pictogramme ;
//  • Rôles conservés : managementOnly / ownerOnly / teamMemberOnly
//    (AUDIT 4-c inchangé).
// =============================================================

// v6.0 « LUXE AURA » — pastille colorée par groupe de navigation :
// chaque groupe de la sidebar porte son point de couleur (sans icône).
const GROUP_DOTS: Record<string, string> = {
  Pilotage: '#ffd76a',
  'Mes biens': '#7ce7c8',
  Services: '#9ec1ff',
  Business: '#ffb3c8',
  // Task 42-c — groupe Aide (Mode d'emploi + FAQ) : vert menthe doux.
  Aide: '#a7f3d0',
};

interface NavItem {
  href: string;
  label: string;
  /** Réservé aux profils de gestion (owner / manager). */
  managementOnly: boolean;
  /** Réservé au propriétaire d'au moins un bien (Facturation). */
  ownerOnly?: boolean;
  /** Réservé aux membres d'équipe — masqué d'un propriétaire pur. */
  teamMemberOnly?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Pilotage',
    items: [
      { href: '/airbnb/dashboard', label: "Vue d'ensemble", managementOnly: false },
      { href: '/airbnb/dashboard/coach', label: 'Coach IA', managementOnly: true },
      { href: '/airbnb/calendar', label: 'Calendrier', managementOnly: false },
      // AUDIT 4-c — interventions des membres d'équipe (ménage, maintenance).
      { href: '/airbnb/my-assignments', label: 'Mes tâches', managementOnly: false, teamMemberOnly: true },
      { href: '/airbnb/messages', label: 'Messages', managementOnly: false },
      // v4.69 — PHASE 2 — mini-CRM « Invités » (historique complet par séjour).
      { href: '/airbnb/guests', label: 'Invités', managementOnly: false },
    ],
  },
  {
    label: 'Mes biens',
    items: [
      { href: '/airbnb/properties', label: 'Propriétés', managementOnly: false },
      { href: '/airbnb/plates', label: 'Plaques QR', managementOnly: false },
      // PREMIUM (V5) : /airbnb/guest-experience redirige vers le bien sélectionné.
      { href: '/airbnb/guest-experience', label: 'Expérience Invité', managementOnly: true },
      // v4.74 « SMART PROMPTS » — notifications temporelles du hub.
      { href: '/airbnb/notifications', label: 'Notifications', managementOnly: true },
      // v4.74 « BOUTIQUE DE SOUVENIRS » — produits vendus au départ.
      { href: '/airbnb/souvenirs', label: 'Souvenirs', managementOnly: true },
    ],
  },
  {
    label: 'Services',
    items: [
      // DIGITAL CONCIERGE (V4.1) — managementOnly : codes d'accès sensibles.
      { href: '/airbnb/concierge', label: 'Conciergerie', managementOnly: true },
      // v4.43 « ONGLET MÉNAGE DÉDIÉ ».
      { href: '/airbnb/menage', label: 'Ménage & Stock', managementOnly: true },
      // v4.103 — MODULE STANDALONE « ÉTAT DES LIEUX » (299 €/an) :
      // l'hôte crée, partage et suit ses EDL (dashboard dédié hors shell).
      { href: '/inspection/dashboard', label: 'États des Lieux', managementOnly: true },
      { href: '/airbnb/providers', label: 'Prestataires', managementOnly: false },
      { href: '/airbnb/team', label: 'Équipe', managementOnly: true },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/airbnb/orders', label: 'Commandes & Revenus', managementOnly: true },
      // AUDIT 4-c — ownerOnly : masquée aux managers / membres d'équipe.
      { href: '/airbnb/billing', label: 'Facturation', managementOnly: true, ownerOnly: true },
      { href: '/airbnb/settings', label: 'Paramètres', managementOnly: true },
    ],
  },
  // Task 42-c — nouveau groupe Aide : guide Mode d'emploi + FAQ.
  {
    label: 'Aide',
    items: [
      { href: '/airbnb/mode-demploi', label: "Mode d'emploi", managementOnly: false },
      { href: '/airbnb/faq', label: 'FAQ', managementOnly: false },
    ],
  },
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

export interface HostShellProps {
  children: ReactNode;
  userName: string | null;
  userEmail: string | null;
  planName: string;
  accessLevel: 'full' | 'team';
}

export function HostShell({ children, userName, userEmail, planName, accessLevel }: HostShellProps) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? 'Hôte';

  return (
    // v4.77-c2 — le shell (sidebar + header) est traduit en 5 langues via
    // AdminLangProvider (langue partagée avec le login et le hub hôte).
    <AdminLangProvider>
    <HostProvider accessLevel={accessLevel} userFirstName={firstName}>
      <ShellRoot
        userName={userName}
        userEmail={userEmail}
        planName={planName}
        accessLevel={accessLevel}
      >
        {children}
      </ShellRoot>
    </HostProvider>
    </AdminLangProvider>
  );
}

function ShellRoot({
  children,
  userName,
  userEmail,
  planName,
  accessLevel,
}: Required<Omit<HostShellProps, 'children'>> & { children: ReactNode }) {
  const pathname = usePathname();
  // v4.77-c2 — traduction des libellés du shell (clé = texte FR source).
  const { t } = useAdminLang();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Portfolio déjà chargé par le HostProvider (une seule requête
  // /api/airbnb/properties pour tout le shell) — sert à dériver
  // l'ownership réel sans nouvelle requête (audit 4-c).
  const { properties, plan } = useHostContext();
  // Vrai uniquement après hydratation — évite le mismatch des IDs Radix
  // auto-générés (aria-controls) entre le rendu serveur et le client.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // AUDIT 4-c — ownership réel : au moins un bien possédé (isOwner
  // par bien, ou ownedCount du plan renvoyé par l'API portfolio).
  const ownsAProperty =
    properties.some((p: HostProperty) => p.isOwner) || (plan?.ownedCount ?? 0) > 0;
  // Membre d'équipe quelque part (bien accessible non possédé) →
  // CLEANER / MAINTENANCE / MANAGER membre d'un bien d'autrui.
  const isTeamMemberSomewhere = properties.some((p: HostProperty) => !p.isOwner);

  const isItemVisible = (item: NavItem): boolean => {
    if (item.ownerOnly) return accessLevel === 'full' && ownsAProperty;
    if (item.teamMemberOnly) return accessLevel === 'team' || isTeamMemberSomewhere;
    return accessLevel === 'full' || !item.managementOnly;
  };

  // v4.60 — sur une page « expérience invité » (détail bien
  // /airbnb/properties/[id]/guest-experience), seul l'onglet
  // « Expérience Invité » s'allume — pas « Propriétés » en même temps.
  const isActive = (item: NavItem): boolean => {
    if (item.href === '/airbnb/dashboard') return pathname === '/airbnb/dashboard';
    // v4.74 — pages détaillées /properties/[id]/notifications et /souvenirs :
    // seul l'onglet dédié s'allume (pas « Propriétés » en même temps).
    if (pathname.includes('/notifications')) return item.href === '/airbnb/notifications';
    if (pathname.includes('/souvenirs')) return item.href === '/airbnb/souvenirs';
    if (pathname.includes('/guest-experience')) return item.href === '/airbnb/guest-experience';
    return pathname.startsWith(item.href);
  };

  // La nav groupée est réutilisée par la sidebar desktop ET le drawer
  // mobile : au clic sur un lien on referme le drawer (no-op desktop).
  const navList = (
    <nav
      aria-label={t("Navigation de l'espace hôte")}
      className="flex flex-col gap-5 px-4"
      onClick={() => setMobileOpen(false)}
    >
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter(isItemVisible);
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[9.5px] font-bold uppercase tracking-[0.3em] text-[#43150a]/75">
              <span
                className="lux-dot shrink-0"
                style={{ backgroundColor: GROUP_DOTS[group.label] ?? '#ffffff' }}
                aria-hidden="true"
              />
              {t(group.label)}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map((item, i) => {
                const active = isActive(item);
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.025 * i, duration: 0.22, ease: 'easeOut' }}
                  >
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex min-h-[38px] items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-200',
                        active
                          ? 'bg-white text-[#b84a26] shadow-[0_10px_24px_-10px_rgba(90,25,5,0.55)]'
                          : 'text-[#3a1408]/85 hover:bg-white/25 hover:text-[#2a0d05]',
                      )}
                    >
                      <span className="truncate">{t(item.label)}</span>
                      {/* Onglet MESSAGES : badge vocaux non lus + signalements ouverts */}
                      {item.href === '/airbnb/messages' && <MessagesNavBadge />}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const logo = (
    <Link href="/" aria-label={t('Retour au site RoomScan')} className="flex items-center gap-2.5 px-5 py-1">
      {/* Logo officiel RoomScan — variante blanche (fonds sombres), proportions d'origine */}
      <Image
        src="/brand/roomscan-icon-white.png"
        alt=""
        width={171}
        height={169}
        className="shrink-0"
        style={{ height: 40, width: 'auto' }}
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="lux-display truncate text-[15px] font-semibold text-[#2a0d05]">RoomScan</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#5c1d0a]">
          {t('Espace Hôte')}
        </span>
      </span>
    </Link>
  );

  const profileBlock = (
    <div className="mx-3 mb-4">
      <div className="mb-2 flex items-center justify-end px-1">
        <ThemeToggle variant="ink" />
      </div>
      <div className="flex items-center gap-2.5 rounded-2xl border border-[#2a0d05]/15 bg-white/45 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="lux-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#b84a26] shadow-sm"
        >
          {initialsOf(userName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#2a0d05]">{userName ?? t('Invité')}</p>
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-[#3a1408]/70">{planName}</p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          title={t('Se déconnecter')}
          aria-label={t('Se déconnecter')}
          className="shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3a1408]/70 transition-colors hover:bg-white/45 hover:text-[#2a0d05]"
        >
          {t('Quitter')}
        </button>
      </div>
    </div>
  );

  return (
    // NB : le scope .lux n'est PAS sur ce wrapper — la sidebar reste
    // corail de marque #f58364 dans les deux modes (v6.1 DUO BRAND) ;
    // le contenu porte lui-même .lux.lux-bg.lux-host ci-dessous.
    <div className="flex min-h-screen">
      {/* ===================== SIDEBAR DESKTOP (260px, corail #f58364) ===================== */}
      <aside className="lux-sidebar lux-sidebar-host fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col overflow-hidden md:flex">
        <div className="relative z-10 flex h-16 items-center border-b border-white/10">{logo}</div>
        <div className="lux-scroll relative z-10 flex-1 overflow-y-auto py-4">{navList}</div>
        <div className="relative z-10">{profileBlock}</div>
      </aside>

      {/* ===================== CONTENU ===================== */}
      <div className="lux lux-bg lux-host flex min-h-screen w-full flex-col md:ml-[260px] md:w-[calc(100%-260px)]">
        {/* ----- Header glass luxueux ----- */}
        <header className="lux-header sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 px-4 sm:gap-3 sm:px-6">
          {/* Burger mobile → drawer Sheet (monté après hydratation :
              IDs Radix stables, zéro mismatch aria-controls) */}
          {mounted ? (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 hover:bg-white/8 hover:text-white md:hidden"
                  aria-label={t('Ouvrir le menu')}
                >
                  {t('Menu')}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="lux-sidebar lux-sidebar-host w-[290px] overflow-y-auto border-none p-0"
              >
                <SheetHeader className="border-b border-white/10 pb-2 pt-4">
                  <SheetTitle asChild>
                    <div>{logo}</div>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex h-[calc(100%-5rem)] flex-col justify-between pb-4 pt-4">
                  <div className="lux-scroll flex-1 overflow-y-auto">{navList}</div>
                  {profileBlock}
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <span aria-hidden="true" className="h-9 w-9 shrink-0 md:hidden" />
          )}

          {/* Sélecteur de propriété (multi-propriétés) */}
          <PropertySelector />

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* v4.77-c2 — sélecteur de langue (5 drapeaux, dropdown) */}
            <AdminLangSwitcher />
            {/* Bouton MESSAGES (badge : vocales non lus + signalements) */}
            {accessLevel === 'full' && <MessagesButton />}
            <NotificationsBell />
            {accessLevel === 'full' && <AddPropertyButton />}
          </div>
        </header>

        {/* ----- Contenu scrollable ----- */}
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full flex-1 p-4 sm:p-6"
        >
          {children}
        </motion.main>

        {/* ----- Footer collé en bas (mt-auto) ----- */}
        <footer className="mt-auto border-t border-white/8 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-xs text-[#8fabc2]">
            Copyright © <span className="lux-display font-semibold text-white/80">RoomScan</span> 2025
            — {t('La conciergerie digitale de vos locations, sans application')}
          </p>
        </footer>
      </div>

      <Toaster position="top-center" richColors />
    </div>
  );
}

// =============================================================
// Sélecteur de propriété du header — alimenté par HostContext
// =============================================================

function PropertySelector() {
  const {
    properties,
    propertiesLoading,
    selectedId,
    setSelectedId,
    selectedProperty,
  } = useHostContext();
  // v4.77-c2 — libellés du sélecteur traduits (clé = texte FR source).
  const { t } = useAdminLang();

  if (propertiesLoading) {
    return <Skeleton className="h-9 w-40 rounded-full bg-white/10 sm:w-56" aria-hidden="true" />;
  }

  const showAllOption = properties.length > 1;
  const label =
    selectedId === 'all'
      ? `${t('Toutes les propriétés')} (${properties.length})`
      : selectedProperty?.name ?? t('Aucune propriété');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 max-w-[190px] items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 text-sm font-medium text-white/90 transition-all hover:border-white/25 hover:bg-white/[0.08] sm:max-w-[260px]"
          aria-label={`${t('Propriété sélectionnée')} : ${label}`}
        >
          <span
            className="lux-dot shrink-0"
            style={{ backgroundColor: selectedId === 'all' ? '#2dd4bf' : '#5cadf0' }}
            aria-hidden="true"
          />
          <span className="truncate">{label}</span>
          <span className="shrink-0 text-[#8fabc2]" aria-hidden="true">▾</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 border-white/10 bg-[#0d1530] text-white">
        <DropdownMenuLabel className="lux-eyebrow">
          {t('Propriété sélectionnée')}
        </DropdownMenuLabel>
        {showAllOption && (
          <>
            <DropdownMenuItem
              onClick={() => setSelectedId('all')}
              className="gap-2 focus:bg-white/8 focus:text-white"
              aria-selected={selectedId === 'all'}
            >
              <span className="lux-dot shrink-0" style={{ backgroundColor: '#2dd4bf' }} aria-hidden="true" />
              <span className="flex-1 truncate font-semibold">{t('Toutes les propriétés')}</span>
              {selectedId === 'all' && <span className="text-[#e9c47c]" aria-hidden="true">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/8" />
          </>
        )}
        {properties.map((p: HostProperty) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className="gap-2 focus:bg-white/8 focus:text-white"
            aria-selected={selectedId === p.id}
          >
            <span className="lux-dot shrink-0" style={{ backgroundColor: '#5cadf0' }} aria-hidden="true" />
            <span className="flex-1 truncate">{p.name}</span>
            {selectedId === p.id && <span className="text-[#e9c47c]" aria-hidden="true">✓</span>}
          </DropdownMenuItem>
        ))}
        {properties.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-[#8fabc2]">
            {t("Aucune propriété pour l'instant — ajoutez-en une pour démarrer.")}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =============================================================
// Bouton « Ajouter une propriété » du header
// =============================================================

function AddPropertyButton() {
  const router = useRouter();
  const { t } = useAdminLang();
  return (
    <Button
      type="button"
      onClick={() => router.push('/airbnb/properties?new=1')}
      className="lux-btn h-9 rounded-full px-3 text-xs sm:px-4"
      aria-label={t('Ajouter une propriété')}
    >
      <span className="hidden lg:inline">{t('Ajouter une propriété')}</span>
      <span className="lg:hidden">{t('Ajouter')}</span>
    </Button>
  );
}

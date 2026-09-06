'use client';

import { type ReactNode, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Home,
  LogOut,
  Menu,
  Plus,
} from 'lucide-react';
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
import {
  HostProvider,
  useHostContext,
  type HostProperty,
} from '@/components/airbnb/host/host-context';
import { cn } from '@/lib/utils';

// =============================================================
// HostShell — coquille QRTags Pro du Dashboard Client (/airbnb/*)
//
// • Sidebar claire fixe 250px (bg-white border-r) : logo, 9 entrées
//   de navigation avec emojis, profil utilisateur en bas (avatar,
//   nom, plan).
// • Header sticky : burger mobile, sélecteur de propriété
//   (multi-propriétés), notifications (cloche + badge réel),
//   bouton « Ajouter une propriété ».
// • Contenu scrollable (padding 24px) + footer copyright collé en
//   bas (mt-auto).
// • Rôles : accessLevel 'team' (CLEANER/MAINTENANCE) → navigation
//   réduite (pas de Facturation / Équipe / Paramètres / Revenus).
// =============================================================

interface NavItem {
  href: string;
  emoji: string;
  label: string;
  /** Réservé aux profils de gestion (owner / manager). */
  managementOnly: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/airbnb/dashboard', emoji: '📊', label: "Vue d'ensemble", managementOnly: false },
  { href: '/airbnb/properties', emoji: '🏠', label: 'Mes Propriétés', managementOnly: false },
  { href: '/airbnb/plates', emoji: '📱', label: 'Plaques QR', managementOnly: false },
  { href: '/airbnb/orders', emoji: '💰', label: 'Commandes & Revenus', managementOnly: true },
  { href: '/airbnb/providers', emoji: '🧹', label: 'Prestataires', managementOnly: false },
  { href: '/airbnb/team', emoji: '👥', label: 'Équipe', managementOnly: true },
  { href: '/airbnb/calendar', emoji: '📅', label: 'Calendrier', managementOnly: false },
  { href: '/airbnb/settings', emoji: '⚙️', label: 'Paramètres', managementOnly: true },
  { href: '/airbnb/billing', emoji: '💳', label: 'Facturation', managementOnly: true },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  // Vrai uniquement après hydratation — évite le mismatch des IDs Radix
  // auto-générés (aria-controls) entre le rendu serveur et le client.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const nav = NAV_ITEMS.filter((item) => accessLevel === 'full' || !item.managementOnly);

  // La nav est réutilisée par la sidebar desktop ET le drawer mobile :
  // au clic sur un lien on referme le drawer (no-op sur desktop).
  const navList = (
    <nav
      aria-label="Navigation de l'espace hôte"
      className="flex flex-col gap-1 px-3"
      onClick={() => setMobileOpen(false)}
    >
      {nav.map((item, i) => {
        const active =
          item.href === '/airbnb/dashboard'
            ? pathname === '/airbnb/dashboard'
            : pathname.startsWith(item.href);
        return (
          <motion.div
            key={item.href}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 * i, duration: 0.25, ease: 'easeOut' }}
          >
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-all duration-200',
                active
                  ? 'bg-[#FEF1EF] font-bold text-[#E23F2B] shadow-[inset_3px_0_0_0_#E23F2B]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <span aria-hidden="true" className="w-6 text-center text-lg transition-transform duration-200 group-hover:scale-110">
                {item.emoji}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          </motion.div>
        );
      })}
    </nav>
  );

  const logo = (
    <Link href="/" aria-label="Retour au site Conciergerie Hub" className="flex items-center gap-2.5 px-5 py-1">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E23F2B] text-base font-extrabold text-white shadow-sm"
      >
        CH
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[15px] font-bold text-slate-900">Conciergerie Hub</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Espace Hôte
        </span>
      </span>
    </Link>
  );

  const profileBlock = (
    <div className="mx-3 mb-4 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E23F2B] text-xs font-extrabold text-white"
      >
        {initialsOf(userName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900">{userName ?? 'Invité'}</p>
        <p className="truncate text-[11px] font-medium text-slate-500">{planName}</p>
      </div>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/' })}
        title="Se déconnecter"
        aria-label="Se déconnecter"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* ===================== SIDEBAR DESKTOP (250px) ===================== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[250px] flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-16 items-center border-b border-slate-100">{logo}</div>
        <div className="flex-1 overflow-y-auto py-4">{navList}</div>
        {profileBlock}
      </aside>

      {/* ===================== CONTENU ===================== */}
      <div className="flex min-h-screen w-full flex-col md:ml-[250px] md:w-[calc(100%-250px)]">
        {/* ----- Header sticky ----- */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:gap-3 sm:px-6">
          {/* Burger mobile → drawer Sheet (monté après hydratation :
              IDs Radix stables, zéro mismatch aria-controls) */}
          {mounted ? (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Ouvrir le menu"
                >
                  <Menu className="h-5 w-5 text-slate-700" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] bg-white p-0 text-slate-900">
                <SheetHeader className="border-b border-slate-100 pb-2 pt-4">
                  <SheetTitle asChild>
                    <div>{logo}</div>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex h-[calc(100%-5rem)] flex-col justify-between pb-4 pt-4">
                  <div className="flex-1 overflow-y-auto">{navList}</div>
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
            <NotificationsBell />
            {accessLevel === 'full' && <AddPropertyButton />}
          </div>
        </header>

        {/* ----- Contenu scrollable (padding 24px) ----- */}
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full flex-1 p-4 sm:p-6"
        >
          {children}
        </motion.main>

        {/* ----- Footer collé en bas (mt-auto) ----- */}
        <footer className="mt-auto border-t border-slate-200 bg-white py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-xs text-slate-500">
            Copyright © <span className="font-semibold text-slate-700">Conciergerie Hub</span> 2025
            — La conciergerie digitale de vos locations, sans application
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

  if (propertiesLoading) {
    return <Skeleton className="h-9 w-40 rounded-lg sm:w-56" aria-hidden="true" />;
  }

  const showAllOption = properties.length > 1;
  const label =
    selectedId === 'all'
      ? `Toutes les propriétés (${properties.length})`
      : selectedProperty?.name ?? 'Aucune propriété';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 max-w-[190px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 sm:max-w-[260px] sm:px-3"
          aria-label={`Propriété sélectionnée : ${label}`}
        >
          <Home className="h-4 w-4 shrink-0 text-[#E23F2B]" aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Propriété sélectionnée
        </DropdownMenuLabel>
        {showAllOption && (
          <>
            <DropdownMenuItem
              onClick={() => setSelectedId('all')}
              className="gap-2"
              aria-selected={selectedId === 'all'}
            >
              <span className="w-4 text-center" aria-hidden="true">🏢</span>
              <span className="flex-1 truncate font-semibold">Toutes les propriétés</span>
              {selectedId === 'all' && <Check className="h-4 w-4 text-[#E23F2B]" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {properties.map((p: HostProperty) => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className="gap-2"
            aria-selected={selectedId === p.id}
          >
            <span className="w-4 text-center" aria-hidden="true">🏠</span>
            <span className="flex-1 truncate">{p.name}</span>
            {selectedId === p.id && <Check className="h-4 w-4 text-[#E23F2B]" />}
          </DropdownMenuItem>
        ))}
        {properties.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-slate-500">
            Aucune propriété pour l&apos;instant — ajoutez-en une pour démarrer.
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
  return (
    <Button
      type="button"
      onClick={() => router.push('/airbnb/properties?new=1')}
      className="h-9 rounded-lg bg-[#E23F2B] px-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#c93725] hover:shadow sm:px-3"
      aria-label="Ajouter une propriété"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Ajouter une propriété</span>
    </Button>
  );
}

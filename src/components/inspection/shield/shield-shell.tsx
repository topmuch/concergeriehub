'use client';

// =============================================================
// ROOMSCAN INVENTAIRE V2 (ex-Bouclier) — Shell du dashboard.
// v5.0 — refonte « Luxe Bleuté » (demande client) :
//   · LOGO RoomScan réel (public/brand/roomscan-icon-white.png)
//     dans la sidebar ET dans les en-têtes (mobile + desktop) ;
//   · renommage « Bouclier » → « Inventaire » (sidebar, marque,
//     libellés accessibles) ;
//   · sidebar dégradé bleu profond (.shield-sidebar) + halo doré
//     discret en mode sombre — ambiance luxe ;
//   · MODE SOMBRE / CLAIR : bascule soleil/lune dans la topbar
//     desktop et le header mobile (theme-toggle.tsx) ;
//   · contenu : fond dégradé bleuté .shield-page — cartes .luxe-card.
// Menu à 8 onglets (Tableau de bord, Ménage à faire, Check-ins,
// Check-outs, Mes biens, Documents, Inventaire, Abonnement) +
// section Aide à 4 onglets (Mode d'emploi, FAQ — v4.158 ; Badges
// de confiance, Application mobile — v4.160).
// Mobile-first : topbar + tiroir latéral animé (framer-motion).
// =============================================================
import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award,
  BookOpen,
  Boxes,
  Building2,
  CircleHelp,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Smartphone,
  SprayCan,
  X,
} from 'lucide-react';
import { ShieldBell } from './shield-bell';
import { ThemeToggle } from './theme-toggle';

export interface ShieldUser {
  name: string | null;
  email: string | null;
}

type ShieldMenuItem = { href: string; label: string; icon: typeof LayoutDashboard };

const MENU: ShieldMenuItem[] = [
  { href: '/inspection/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/inspection/menage', label: 'Ménage à faire', icon: SprayCan },
  { href: '/inspection/check-ins', label: 'Check-ins', icon: LogIn },
  { href: '/inspection/check-outs', label: 'Check-outs', icon: LogOut },
  { href: '/inspection/biens', label: 'Mes biens', icon: Building2 },
  { href: '/inspection/documents', label: 'Documents', icon: FileText },
  { href: '/inspection/bouclier', label: 'Inventaire', icon: Boxes },
  { href: '/inspection/abonnement', label: 'Abonnement', icon: CreditCard },
];

// v4.158 — section Aide du dashboard Inventaire : même contenu que le
// groupe Aide du dashboard hôte (Task 42-c). Pages sous la garde du
// layout (shield) — session + entitlement EDL obligatoires.
// v4.160 — 2 onglets ajoutés SOUS « FAQ » à la demande utilisateur :
// Badges de confiance (/inspection/badges) + Application mobile
// (/inspection/application, QR PWA).
const HELP_MENU: ShieldMenuItem[] = [
  { href: '/inspection/mode-demploi', label: "Mode d'emploi", icon: BookOpen },
  { href: '/inspection/faq', label: 'FAQ', icon: CircleHelp },
  { href: '/inspection/badges', label: 'Badges de confiance', icon: Award },
  { href: '/inspection/application', label: 'Application mobile', icon: Smartphone },
];

// Logo RoomScan (marque réelle, demande client v5.0 — header).
const LOGO = '/brand/roomscan-icon-white.png';

export function ShieldShell({
  user,
  children,
}: {
  user: ShieldUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href;

  // Rendu d'un onglet — partagé entre le menu principal et la section
  // Aide (desktop sidebar + tiroir mobile : le même élément `nav`).
  const renderItem = ({ href, label, icon: Icon }: ShieldMenuItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={`relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
          active
            ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
            : 'text-[#dceaf5] hover:bg-white/10 hover:text-white'
        }`}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-gradient-to-b from-[#e9c47c] to-[#d9b45b]"
          />
        )}
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        {label}
      </Link>
    );
  };

  const nav = (
    <nav aria-label="RoomScan Inventaire — navigation principale" className="flex-1 space-y-1 overflow-y-auto px-3 py-4 shield-scrollbar">
      {MENU.map(renderItem)}
      {/* v4.158 — section Aide : séparateur + libellé + 4 onglets */}
      <div aria-hidden="true" className="mx-1 my-2 border-t border-white/10" />
      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#c8dfef]">
        Aide
      </p>
      {HELP_MENU.map(renderItem)}
    </nav>
  );

  // v5.0 — marque : VRAI logo RoomScan (tuile blanche) + nom produit
  // renommé « RoomScan Inventaire ».
  const brand = (
    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
      {/* v5.9 — tuile logo agrandie (grand format demandé) */}
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-black/5">
        <Image
          src={LOGO}
          alt="Logo RoomScan"
          width={44}
          height={44}
          className="h-11 w-11 object-contain p-0.5"
          priority
        />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold tracking-tight text-white">RoomScan Inventaire</p>
        <p className="text-[11px] uppercase tracking-wider text-[#c8dfef]">États des lieux V2</p>
      </div>
    </div>
  );

  const userBlock = (
    <div className="border-t border-white/10 px-5 py-4">
      <p className="truncate text-sm font-semibold text-white">{user.name ?? 'Hôte'}</p>
      <p className="truncate text-xs text-[#c8dfef]">{user.email}</p>
      <Link
        href="/airbnb/dashboard"
        className="mt-3 inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-3 text-xs font-medium text-[#dceaf5] transition-colors hover:bg-white/10 hover:text-white"
      >
        ← Espace Hôte
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* ── Sidebar desktop ── */}
      <aside className="shield-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col shadow-xl lg:flex">
        {brand}
        {nav}
        {userBlock}
      </aside>

      {/* ── Topbar mobile ── */}
      <header className="shield-sidebar sticky top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm">
            <Image src={LOGO} alt="Logo RoomScan" width={28} height={28} className="h-7 w-7 object-contain p-0.5" />
          </span>
          <p className="truncate text-sm font-bold text-white">RoomScan Inventaire</p>
        </div>
        <div className="flex items-center gap-0.5">
          <ThemeToggle variant="dark" />
          {/* v4.167 — cloche de notifications (Problème 12) */}
          <ShieldBell variant="dark" />
        </div>
      </header>

      {/* ── Tiroir mobile ── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Fermer le menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="shield-overlay fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="shield-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col shadow-2xl lg:hidden"
              aria-label="Menu Inventaire"
            >
              <div className="flex items-center justify-between border-b border-white/10 pr-3">
                <div className="flex-1">{brand}</div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fermer"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-[#dceaf5] hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {nav}
              {userBlock}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Contenu ── */}
      <div className="lg:ml-64">
        {/* v5.0 — topbar desktop : LOGO + nom produit à gauche,
            bascule thème + cloche de notifications à droite.
            Fond translucide adapté au dégradé de page (clair/sombre). */}
        <div className="sticky top-0 z-30 hidden h-14 items-center justify-between border-b border-slate-200/70 bg-white/70 px-6 backdrop-blur-md dark:border-[#22305a] dark:bg-[#0a1226]/70 lg:flex">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5 dark:ring-white/10">
              <Image src={LOGO} alt="Logo RoomScan" width={32} height={32} className="h-8 w-8 object-contain p-0.5" />
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              RoomScan <span className="text-[#055492] dark:text-[#8fb8dc]">Inventaire</span>
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <ThemeToggle variant="light" />
            <ShieldBell variant="light" />
          </div>
        </div>
        {/* v5.0 — fond de page dégradé « bleuté luxe » (clair & sombre) */}
        <main className="shield-page min-h-[calc(100vh-3.5rem)]">{children}</main>
      </div>
    </div>
  );
}

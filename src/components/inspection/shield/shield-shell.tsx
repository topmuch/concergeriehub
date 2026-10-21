'use client';

// =============================================================
// BOUCLIER V2 — Shell du dashboard (master prompt client §1) :
// Sidebar gauche bleu profond bg-[#1e3a8a], texte blanc, icônes
// Lucide, menu à 8 onglets (Tableau de bord, Ménage à faire,
// Check-ins, Check-outs, Mes biens, Documents, Bouclier,
// Abonnement). Contenu : fond gris très clair bg-slate-50.
// Mobile-first : topbar + tiroir latéral animé (framer-motion).
// =============================================================
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  SprayCan,
  X,
} from 'lucide-react';

export interface ShieldUser {
  name: string | null;
  email: string | null;
}

const MENU: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
  { href: '/inspection/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/inspection/menage', label: 'Ménage à faire', icon: SprayCan },
  { href: '/inspection/check-ins', label: 'Check-ins', icon: LogIn },
  { href: '/inspection/check-outs', label: 'Check-outs', icon: LogOut },
  { href: '/inspection/biens', label: 'Mes biens', icon: Building2 },
  { href: '/inspection/documents', label: 'Documents', icon: FileText },
  { href: '/inspection/bouclier', label: 'Bouclier', icon: ShieldCheck },
  { href: '/inspection/abonnement', label: 'Abonnement', icon: CreditCard },
];

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

  const nav = (
    <nav aria-label="Bouclier — navigation principale" className="flex-1 space-y-1 px-3 py-4">
      {MENU.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
              active ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10 hover:text-white'
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-[#C41E3A]"
              />
            )}
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#C41E3A] text-white shadow-md"
      >
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold tracking-tight text-white">RoomScan Bouclier</p>
        <p className="text-[11px] uppercase tracking-wider text-blue-200">États des lieux V2</p>
      </div>
    </div>
  );

  const userBlock = (
    <div className="border-t border-white/10 px-5 py-4">
      <p className="truncate text-sm font-semibold text-white">{user.name ?? 'Hôte'}</p>
      <p className="truncate text-xs text-blue-200">{user.email}</p>
      <Link
        href="/airbnb/dashboard"
        className="mt-3 inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-3 text-xs font-medium text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
      >
        ← Espace Hôte
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sidebar desktop ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#1e3a8a] shadow-xl lg:flex">
        {brand}
        {nav}
        {userBlock}
      </aside>

      {/* ── Topbar mobile ── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-[#1e3a8a] px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
        <p className="text-sm font-bold text-white">RoomScan Bouclier</p>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#C41E3A] text-white"
        >
          <ShieldCheck className="h-4 w-4" />
        </span>
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
              className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-[#1e3a8a] shadow-2xl lg:hidden"
              aria-label="Menu Bouclier"
            >
              <div className="flex items-center justify-between border-b border-white/10 pr-3">
                <div className="flex-1">{brand}</div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fermer"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-blue-100 hover:bg-white/10 hover:text-white"
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
      <main className="min-h-[calc(100vh-3.5rem)] lg:ml-64">{children}</main>
    </div>
  );
}

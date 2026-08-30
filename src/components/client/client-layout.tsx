'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  QrCode,
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  Home,
  DoorOpen,
  Activity,
  Settings2,
  ArrowLeftRight,
  Search,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export type ClientPage =
  | 'client-home'
  | 'client-hub'
  | 'client-homes'
  | 'client-rooms'
  | 'client-activity'
  | 'client-settings';

interface ClientLayoutProps {
  activePage: ClientPage;
  onPageChange: (page: ClientPage) => void;
  onSwitchToAdmin: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const MAIN_ITEMS: { key: ClientPage; label: string; icon: React.ReactNode }[] = [
  { key: 'client-home', label: 'Mon Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'client-hub', label: 'Mon Hub QR', icon: <QrCode className="h-4 w-4" /> },
];

const GESTION_ITEMS: { key: ClientPage; label: string; icon: React.ReactNode }[] = [
  { key: 'client-homes', label: 'Mes Maisons', icon: <Home className="h-4 w-4" /> },
  { key: 'client-rooms', label: 'Mes Pièces', icon: <DoorOpen className="h-4 w-4" /> },
  { key: 'client-activity', label: "Journal d'activité", icon: <Activity className="h-4 w-4" /> },
];

const OUTILS_ITEMS: { key: ClientPage; label: string; icon: React.ReactNode }[] = [
  { key: 'client-settings', label: 'Paramètres', icon: <Settings2 className="h-4 w-4" /> },
];

const ALL_ITEMS = [...MAIN_ITEMS, ...GESTION_ITEMS, ...OUTILS_ITEMS];

export function ClientLayout({ activePage, onPageChange, onSwitchToAdmin, onLogout, children }: ClientLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const handleLogout = () => { signOut({ redirect: false }); onLogout(); };

  // Listen for programmatic navigation from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail && (detail as string).startsWith('client-')) {
        onPageChange(detail as ClientPage);
      }
    };
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, [onPageChange]);

  // Register service worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const current = ALL_ITEMS.find((n) => n.key === activePage) || ALL_ITEMS[0];

  // Build breadcrumb segments
  const breadcrumb = getBreadcrumb(activePage);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — Clean slate-950 with emerald accent */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-950 border-r border-slate-800/80 transition-transform duration-300 lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-5">
          <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-9 w-auto object-contain rounded-lg" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white tracking-tight">ORDOMOTIK</span>
            <span className="text-[10px] text-slate-500 font-medium">Espace Client</span>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-px bg-slate-800/60" />

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="flex flex-col gap-1">
            {/* Main section */}
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Principal
            </p>
            {MAIN_ITEMS.map((item) => (
              <SidebarItem key={item.key} item={item} activePage={activePage} onClick={() => { onPageChange(item.key); setSidebarOpen(false); }} />
            ))}

            <div className="my-3 h-px bg-slate-800/60" />

            {/* Gestion section */}
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Gestion
            </p>
            {GESTION_ITEMS.map((item) => (
              <SidebarItem key={item.key} item={item} activePage={activePage} onClick={() => { onPageChange(item.key); setSidebarOpen(false); }} />
            ))}

            <div className="my-3 h-px bg-slate-800/60" />

            {/* Outils section */}
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Outils
            </p>
            {OUTILS_ITEMS.map((item) => (
              <SidebarItem key={item.key} item={item} activePage={activePage} onClick={() => { onPageChange(item.key); setSidebarOpen(false); }} />
            ))}
          </nav>
        </ScrollArea>

        <div className="h-px bg-slate-800/60" />

        {/* Footer actions */}
        <div className="p-3 flex flex-col gap-0.5">
          <button
            onClick={onSwitchToAdmin}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-slate-800/60 hover:text-slate-300 transition-all duration-150"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Passer en admin
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header bar with breadcrumb */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-md px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          {/* Breadcrumb-style nav */}
          <nav className="hidden sm:flex items-center gap-1.5 text-sm">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {i === breadcrumb.length - 1 ? (
                  <span className="font-medium text-foreground">{crumb}</span>
                ) : (
                  <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{crumb}</span>
                )}
              </span>
            ))}
          </nav>

          {/* Page title on mobile */}
          <span className="sm:hidden text-sm font-medium text-foreground">{current?.label}</span>

          {/* Search placeholder */}
          <div className="hidden md:flex items-center gap-2 ml-8 flex-1 max-w-md">
            <div className="flex items-center gap-2 w-full rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              <span>Rechercher...</span>
              <kbd className="ml-auto hidden lg:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer">
              <span className="hidden sm:inline text-xs font-medium text-foreground">Utilisateur Démo</span>
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-emerald-500 text-white text-[10px] font-bold">UD</AvatarFallback>
              </Avatar>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </div>
          </div>
        </header>

        {/* Content area — wide */}
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>

        {/* Footer — minimal */}
        <footer className="border-t px-6 py-3 lg:px-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-5 w-auto object-contain rounded opacity-40" />
              <span>ORDOMOTIK</span>
            </div>
            <span>Espace Client</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ── Reusable sidebar nav item ──────────────────────────────── */

function SidebarItem({
  item,
  activePage,
  onClick,
}: {
  item: { key: ClientPage; label: string; icon: React.ReactNode };
  activePage: ClientPage;
  onClick: () => void;
}) {
  const isActive = activePage === item.key;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
        isActive
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
      )}
    >
      {item.icon}
      <span className="flex-1 text-left">{item.label}</span>
      {isActive && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    </button>
  );
}

/* ── Breadcrumb helper ──────────────────────────────────────── */

function getBreadcrumb(page: ClientPage): string[] {
  const map: Record<ClientPage, string[]> = {
    'client-home': ['Mon Dashboard'],
    'client-hub': ['Principal', 'Mon Hub QR'],
    'client-homes': ['Gestion', 'Mes Maisons'],
    'client-rooms': ['Gestion', 'Mes Pièces'],
    'client-activity': ['Gestion', "Journal d'activité"],
    'client-settings': ['Outils', 'Paramètres'],
  };
  return map[page] ?? ['Dashboard'];
}

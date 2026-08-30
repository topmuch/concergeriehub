'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  QrCode,
  Package,
  Users,
  BarChart3,
  Menu,
  X,
  LogOut,
  Shield,
  ArrowLeftRight,
  Moon,
  Sun,
  Store,
  ShoppingBag,
  Briefcase,
  Search,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export type SuperAdminPage =
  | 'overview'
  | 'generate'
  | 'batches'
  | 'users'
  | 'stats'
  | 'admin-artisans'
  | 'admin-marketplace'
  | 'admin-packs';

interface SuperAdminLayoutProps {
  activePage: SuperAdminPage;
  onPageChange: (page: SuperAdminPage) => void;
  onSwitchToClient: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const MAIN_ITEMS: { key: SuperAdminPage; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: "Vue d'ensemble", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'generate', label: 'Générer une plaque', icon: <QrCode className="h-4 w-4" /> },
  { key: 'batches', label: 'Plaques Hub', icon: <Package className="h-4 w-4" /> },
  { key: 'users', label: 'Utilisateurs', icon: <Users className="h-4 w-4" /> },
  { key: 'stats', label: 'Statistiques', icon: <BarChart3 className="h-4 w-4" /> },
];

const MARKETPLACE_ITEMS: { key: SuperAdminPage; label: string; icon: React.ReactNode; badge?: string }[] = [
  { key: 'admin-artisans', label: 'Artisans & Pros', icon: <Briefcase className="h-4 w-4" />, badge: 'V3' },
  { key: 'admin-marketplace', label: 'Marketplace', icon: <ShoppingBag className="h-4 w-4" />, badge: 'V3' },
  { key: 'admin-packs', label: 'Packs & Config', icon: <Store className="h-4 w-4" />, badge: 'B2B' },
];

export function SuperAdminLayout({ activePage, onPageChange, onSwitchToClient, onLogout, children }: SuperAdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const current = [...MAIN_ITEMS, ...MARKETPLACE_ITEMS].find((n) => n.key === activePage);
  const { theme, setTheme } = useTheme();
  const handleLogout = () => { signOut({ redirect: false }); onLogout(); };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — Clean slate-950 with violet accent */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-950 border-r border-slate-800/80 transition-transform duration-300 lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-5">
          <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-9 w-auto object-contain rounded-lg" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white tracking-tight">ORDOMOTIK</span>
            <span className="text-[10px] text-slate-500 font-medium">Super Admin</span>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Separator className="bg-slate-800/60" />

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="flex flex-col gap-1">
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Plateforme
            </p>
            {MAIN_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => { onPageChange(item.key); setSidebarOpen(false); }}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  activePage === item.key
                    ? 'bg-violet-500/15 text-violet-400'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {activePage === item.key && (
                  <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                )}
              </button>
            ))}

            <div className="my-3 h-px bg-slate-800/60" />

            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Marketplace & B2B
            </p>
            {MARKETPLACE_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => { onPageChange(item.key); setSidebarOpen(false); }}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  activePage === item.key
                    ? 'bg-violet-500/15 text-violet-400'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                    activePage === item.key ? 'bg-violet-500/20 text-violet-300' : 'bg-slate-800 text-slate-500',
                  )}>
                    {item.badge}
                  </span>
                )}
                {activePage === item.key && (
                  <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                )}
              </button>
            ))}
          </nav>
        </ScrollArea>

        <Separator className="bg-slate-800/60" />

        {/* Footer actions */}
        <div className="p-3 flex flex-col gap-0.5">
          <button
            onClick={onSwitchToClient}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-slate-800/60 hover:text-slate-300 transition-all duration-150"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Passer au client
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
        {/* Header bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-md px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{current?.label ?? 'Dashboard'}</h2>
          </div>

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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <div className="flex items-center gap-2 rounded-full border border-border px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5">
                <Shield className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-400">Superadmin</span>
              </div>
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-violet-500 text-white text-[10px] font-bold">SA</AvatarFallback>
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
            <span>Super Administration</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
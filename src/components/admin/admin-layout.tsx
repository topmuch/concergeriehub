'use client';

import { useState } from 'react';
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
  Home,
  DoorOpen,
  Activity,
  Settings2,
  Eye,
  Layers,
  Search,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export type AdminPage =
  | 'overview' | 'generate' | 'batches' | 'users' | 'stats'
  | 'client-home' | 'client-homes' | 'client-rooms' | 'client-activity' | 'client-settings'
  | 'modules' | 'module-config' | 'module-preview';

interface AdminLayoutProps {
  activePage: AdminPage;
  onPageChange: (page: AdminPage) => void;
  children: React.ReactNode;
}

const ADMIN_ITEMS: { key: AdminPage; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: "Vue d'ensemble", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'generate', label: 'Générer une plaque', icon: <QrCode className="h-4 w-4" /> },
  { key: 'batches', label: 'Plaques Hub', icon: <Package className="h-4 w-4" /> },
  { key: 'users', label: 'Utilisateurs', icon: <Users className="h-4 w-4" /> },
  { key: 'stats', label: 'Statistiques', icon: <BarChart3 className="h-4 w-4" /> },
];

const MODULE_ITEMS: { key: AdminPage; label: string; icon: React.ReactNode }[] = [
  { key: 'module-config', label: 'Configurer un module', icon: <Settings2 className="h-4 w-4" /> },
  { key: 'module-preview', label: 'Aperçu des modules', icon: <Eye className="h-4 w-4" /> },
  { key: 'modules', label: 'Catalogue Modules', icon: <Layers className="h-4 w-4" /> },
];

const CLIENT_ITEMS: { key: AdminPage; label: string; icon: React.ReactNode }[] = [
  { key: 'client-home', label: 'Mon Dashboard', icon: <Home className="h-4 w-4" /> },
  { key: 'client-homes', label: 'Mes Maisons', icon: <Home className="h-4 w-4" /> },
  { key: 'client-rooms', label: 'Mes Pièces', icon: <DoorOpen className="h-4 w-4" /> },
  { key: 'client-activity', label: 'Activité', icon: <Activity className="h-4 w-4" /> },
];

const ALL_ITEMS = [...ADMIN_ITEMS, ...MODULE_ITEMS, ...CLIENT_ITEMS];

export function AdminLayout({ activePage, onPageChange, children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const current = ALL_ITEMS.find((n) => n.key === activePage);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — Clean slate-950 with blue accent */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-950 border-r border-slate-800/80 transition-transform duration-300 lg:static lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 px-5">
          <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-9 w-auto object-contain rounded-lg" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white tracking-tight">ORDOMOTIK</span>
            <span className="text-[10px] text-slate-500 font-medium">Dashboard</span>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-px bg-slate-800/60" />

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="flex flex-col gap-1">
            {/* Admin section */}
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Administration
            </p>
            {ADMIN_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => { onPageChange(item.key); setSidebarOpen(false); }}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  activePage === item.key
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {activePage === item.key && <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
              </button>
            ))}

            <div className="my-3 h-px bg-slate-800/60" />

            {/* Modules section */}
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Modules V1
            </p>
            {MODULE_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => { onPageChange(item.key); setSidebarOpen(false); }}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  activePage === item.key
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {activePage === item.key && <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
              </button>
            ))}

            <div className="my-3 h-px bg-slate-800/60" />

            {/* Client section */}
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Espace Client
            </p>
            {CLIENT_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => { onPageChange(item.key); setSidebarOpen(false); }}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  activePage === item.key
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {activePage === item.key && <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
              </button>
            ))}
          </nav>
        </ScrollArea>

        <div className="h-px bg-slate-800/60" />

        {/* Footer */}
        <div className="p-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150">
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
            <div className="flex items-center gap-2 rounded-full border border-border px-2 py-1 hover:bg-muted/50 transition-colors cursor-pointer">
              <span className="hidden sm:inline text-xs font-medium text-foreground">Utilisateur Démo</span>
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-blue-500 text-white text-[10px] font-bold">UD</AvatarFallback>
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
            <span>Dashboard</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
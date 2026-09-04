'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { AdminAppSidebar } from '@/components/admin/admin-app-sidebar';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';

// =============================================================
// AdminAppShell — coquille V2 de la Console Superadmin (/admin/*).
// Sidebar shadcn (collapsible, Sheet mobile) + header sticky avec
// trigger + titre de section + badge Superadmin + déconnexion.
// Footer collé en bas (mt-auto) et repoussé naturellement quand le
// contenu déborde. Fond clair cohérent avec l'identité QRTags.
// =============================================================

const SECTION_TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: (p) => p.startsWith('/admin/hosts'), title: 'Hôtes' },
  { match: (p) => p.startsWith('/admin/providers'), title: 'Prestataires' },
  {
    match: (p) => p.startsWith('/admin/dashboard') || p === '/admin',
    title: 'Vue d\u2019ensemble',
  },
];

interface AdminAppShellProps {
  children: ReactNode;
  adminName: string;
  adminEmail: string;
}

export function AdminAppShell({ children, adminName, adminEmail }: AdminAppShellProps) {
  const pathname = usePathname();
  const section = SECTION_TITLES.find((s) => s.match(pathname));

  return (
    <SidebarProvider>
      <AdminAppSidebar adminName={adminName} adminEmail={adminEmail} />
      <SidebarInset className="min-h-screen flex flex-col bg-slate-50">
        {/* ----- Header sticky ----- */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <SidebarTrigger aria-label="Afficher ou masquer le menu" className="-ml-1 text-slate-600 hover:bg-slate-100" />
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-base font-bold text-slate-900 tracking-tight">
            {section?.title ?? 'Console'}
          </h1>
          <span
            className="ml-auto hidden md:inline-flex items-center gap-1.5 bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
            title="Session Superadmin"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Superadmin
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/' })}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            className="ml-auto md:ml-3 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </header>

        {/* ----- Contenu ----- */}
        <main className="flex-1 w-full text-slate-900">{children}</main>

        {/* ----- Footer (collé en bas grâce à mt-auto) ----- */}
        <footer className="mt-auto border-t border-slate-200 bg-white">
          <div className="w-full px-4 py-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              🛡️ <span className="font-semibold text-slate-700">Conciergerie Hub</span> — Console
              Superadmin
            </p>
            <p className="text-xs text-slate-400">Centre de contrôle de la plateforme — accès restreint</p>
          </div>
        </footer>

        <Toaster position="top-center" richColors />
      </SidebarInset>
    </SidebarProvider>
  );
}

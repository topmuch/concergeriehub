'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { AdminAppSidebar } from '@/components/admin/admin-app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';

// =============================================================
// AdminAppShell — coquille « Travl » de la Console Superadmin
// (/admin/*). Sidebar coral pleine hauteur (AdminAppSidebar) +
// header blanc sticky (burger, titre de section, badge Superadmin,
// déconnexion), contenu sur fond gris clair, footer copyright
// centré. Footer collé en bas (mt-auto).
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
      <SidebarInset className="min-h-screen flex flex-col bg-[#F4F5F7]">
        {/* ----- Header blanc sticky ----- */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <SidebarTrigger
            aria-label="Afficher ou masquer le menu"
            className="text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          />
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {section?.title ?? 'Console'}
          </h1>
          <span
            className="ml-auto hidden items-center gap-1.5 bg-[#165949] text-white text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full md:inline-flex"
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#EE4B35] text-xs font-extrabold text-white transition-colors hover:bg-[#D64330] md:h-9 md:w-auto md:rounded-lg md:px-3 md:text-sm md:font-semibold"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">Déconnexion</span>
          </button>
        </header>

        {/* ----- Contenu ----- */}
        <main className="flex-1 w-full text-slate-900">{children}</main>

        {/* ----- Footer copyright (collé en bas : mt-auto) ----- */}
        <footer className="mt-auto border-t border-slate-200 bg-white py-4">
          <p className="text-center text-xs text-slate-500">
            Copyright © <span className="font-semibold text-slate-700">Conciergerie Hub</span> 2025
            — Centre de contrôle de la plateforme, accès restreint
          </p>
        </footer>

        <Toaster position="top-center" richColors />
      </SidebarInset>
    </SidebarProvider>
  );
}

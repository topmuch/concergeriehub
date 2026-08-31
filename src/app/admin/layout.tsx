import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireSuperadmin } from '@/lib/admin';
import { AdminLoginGate } from '@/components/admin/admin-login-gate';
import { AdminShell } from '@/components/admin/admin-shell';

export const metadata: Metadata = {
  title: 'Superadmin — Conciergerie Hub',
  description: 'Centre de contrôle : hôtes, propriétés, prestataires et abonnements.',
  robots: { index: false, follow: false },
};

// ÉTAPE 9 — Layout protégé du Dashboard Superadmin (/admin/*).
// Toute la section exige le rôle 'superadmin' : sinon écran de
// connexion dédié (aucun contenu admin n'est rendu ni préchargé).
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  const admin = await requireSuperadmin();

  if (!session?.user || !admin) {
    return <AdminLoginGate />;
  }

  return <AdminShell adminName={admin.name ?? admin.email}>{children}</AdminShell>;
}

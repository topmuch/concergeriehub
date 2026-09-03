import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireSuperadmin } from '@/lib/admin';
import { AdminLoginGate } from '@/components/admin/admin-login-gate';
import { AdminAppShell } from '@/components/admin/admin-app-shell';

export const metadata: Metadata = {
  title: 'Superadmin — Conciergerie Hub',
  description: 'Centre de contrôle : hôtes, propriétés, prestataires et abonnements.',
  robots: { index: false, follow: false },
};

// ÉTAPE 9 (V2) — Layout protégé du Dashboard Superadmin (/admin/*).
// Toute la section exige le rôle 'superadmin' : sinon écran de
// connexion dédié (aucun contenu admin n'est rendu ni préchargé).
// Coquille V2 : sidebar shadcn + KPIs (AdminAppShell).
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  const admin = await requireSuperadmin();

  if (!session?.user || !admin) {
    return <AdminLoginGate />;
  }

  return (
    <AdminAppShell
      adminName={admin.name ?? admin.email}
      adminEmail={admin.email}
    >
      {children}
    </AdminAppShell>
  );
}

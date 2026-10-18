import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireSuperadmin } from '@/lib/admin';
import { AdminLoginGate } from '@/components/admin/admin-login-gate';
import { AdminAppShell } from '@/components/admin/admin-app-shell';

export const metadata: Metadata = {
  title: 'Superadmin — RoomScan',
  description: 'Centre de contrôle : hôtes, propriétés, prestataires et abonnements.',
  robots: { index: false, follow: false },
};

// ÉTAPE 9 (V2) — Layout protégé du Dashboard Superadmin (/admin/*).
// Toute la section exige le rôle 'superadmin' : sinon écran de
// connexion dédié (aucun contenu admin n'est rendu ni préchargé).
// Coquille V2 : sidebar shadcn + KPIs (AdminAppShell).
// v4.60 — si un cookie de session NextAuth est présent mais invalide
// (expiration après un déploiement / inactivité), le portail affiche
// un bandeau rassurant : « vos données sont intactes, reconnectez-
// vous » — au lieu d'un écran de connexion sans explication.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  const admin = await requireSuperadmin();

  if (!session?.user || !admin) {
    // Détection d'une session EXPIRÉE (cookie présent mais rejeté) vs
    // simple visite déconnectée — pour un message adapté sur le portail.
    const cookieStore = await cookies();
    const hadSession =
      cookieStore.has('next-auth.session-token') ||
      cookieStore.has('__Secure-next-auth.session-token');
    return <AdminLoginGate sessionExpired={hadSession} />;
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

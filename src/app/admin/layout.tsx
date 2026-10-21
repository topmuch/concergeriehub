import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { requireSuperadmin } from '@/lib/admin';
import { AdminAppShell } from '@/components/admin/admin-app-shell';

export const metadata: Metadata = {
  title: 'Superadmin — RoomScan',
  description: 'Centre de contrôle : hôtes, propriétés, prestataires et abonnements.',
  robots: { index: false, follow: false },
};

// ÉTAPE 9 (V2) — Layout protégé du Dashboard Superadmin (/admin/*).
// Toute la section exige le rôle 'superadmin' : sinon redirection vers
// la PORTE DÉDIÉE /login/superadmin (ÉTAPE 1 V4 — pages de connexion
// séparées par espace, bleu nuit + or) — aucun contenu admin n'est
// rendu ni préchargé.
// v4.60 — si un cookie de session NextAuth est présent mais invalide
// (expiration après un déploiement / inactivité), la page de connexion
// affiche un bandeau rassurant : « vos données sont intactes,
// reconnectez-vous » (?expired=1) — au lieu d'un écran sans explication.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  const admin = await requireSuperadmin();

  if (!session?.user || !admin) {
    // Détection d'une session EXPIRÉE (cookie présent mais rejeté) vs
    // simple visite déconnectée — pour un message adapté sur la porte.
    const cookieStore = await cookies();
    const hadSession =
      cookieStore.has('next-auth.session-token') ||
      cookieStore.has('__Secure-next-auth.session-token');
    redirect(`/login/superadmin${hadSession ? '?expired=1' : ''}`);
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

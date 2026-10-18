import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { hasEdlAccess } from '@/lib/edl-billing';
import { InspectionDashboard } from '@/components/inspection/dashboard/inspection-dashboard';

export const metadata: Metadata = {
  title: 'États des Lieux — RoomScan',
  description:
    'Module indépendant « État des Lieux » : créez, partagez et suivez vos états des lieux d’entrée et de sortie — générations illimitées, signature électronique et PDF.',
};

// Page DASHBOARD du module standalone « État des Lieux » (v4.97).
// Protection serveur : session NextAuth obligatoire (redirection vers
// l'accueil sinon) — même garde que les pages de l'espace hôte, mais
// en standalone (hors shell /airbnb) : le module vit à part du Hub.
//
// v4.107 — ENTITLEMENT : le dashboard est réservé
//   • aux abonnés EDL actifs (achat standalone 299 €/an OU
//     abonnement antérieur),
//   • aux comptes Hub (superadmin / propriétaire / équipe — module
//     inclus),
// tout autre compte connecté est renvoyé vers la page d'achat
// /edl/abonnement (offre 299 €/an via PayPal).
export default async function InspectionDashboardPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; role?: string; name?: string | null; email?: string | null }
    | undefined;
  if (!session?.user || !user?.id) redirect('/');

  // Acheteur EDL sans abonnement valide ni compte Hub → page d'achat.
  if (!(await hasEdlAccess(user.id, user.role))) {
    redirect('/edl/abonnement');
  }

  return (
    <InspectionDashboard
      sessionUser={{
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
      }}
    />
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MyAssignmentsContent } from '@/components/airbnb/host/my-assignments-content';

export const metadata: Metadata = {
  title: 'Mes tâches — RoomScan',
  description: 'Vos interventions à venir : ménage et maintenance.',
};

// =============================================================
// AUDIT 4-c — Page « Mes tâches » (/airbnb/my-assignments).
// Destination des membres d'équipe (CLEANER / MAINTENANCE) :
// consomme GET /api/airbnb/my-assignments (séjours à ménager,
// réclamations techniques ouvertes) via le composant client.
// 🔒 Session obligatoire — sinon retour accueil (le layout /airbnb
// garantit déjà la session + le shell, garde maintenue ici).
// =============================================================
export default async function MyAssignmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect('/');
  }

  return <MyAssignmentsContent />;
}

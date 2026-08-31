import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { AutomationsContent } from '@/components/airbnb/automations-content';

export const metadata: Metadata = {
  title: 'Automatisations — Conciergerie Hub',
  description:
    'Automatisez la gestion de vos locations : notifications de réservations, rappels arrivée/départ, ménages et réclamations techniques.',
};

// ÉTAPE 13 — Onglet "Automatisations" : règles trigger → action par bien
export default async function AutomationsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  return <AutomationsContent />;
}

import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { OrdersContent } from '@/components/airbnb/orders-content';

export const metadata: Metadata = {
  title: 'Commandes — Conciergerie Hub',
  description:
    'Commandes invitées sur les prestataires : suivi du cycle de vie, chiffre d’affaires, commission Conciergerie Hub et part hôte.',
};

// ÉTAPE 17.2 V3 — Onglet "Commandes" (moteur de transaction)
export default async function OrdersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  return <OrdersContent />;
}

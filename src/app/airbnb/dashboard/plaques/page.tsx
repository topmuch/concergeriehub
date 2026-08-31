import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { PlaquesContent } from '@/components/airbnb/plaques-content';

export const metadata: Metadata = {
  title: 'Mes plaques QR — Conciergerie Hub',
  description:
    'Générez, imprimez et gérez vos plaques QR : chaque plaque relie le logement à son Hub (Wi-Fi, guide, services, contact hôte).',
};

// ÉTAPE 6 — Onglet "Plaques" : gestion des QR physiques (dashboard ↔ hub)
export default async function PlaquesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  return <PlaquesContent />;
}

import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { DashboardContent } from '@/components/airbnb/dashboard-content';

export const metadata: Metadata = {
  title: 'Dashboard Hôte — Conciergerie Hub',
  description:
    'Tableau de bord B2B : scans de votre plaque QR, satisfaction voyageurs et revenus upselling.',
};

// ÉTAPE 4 — Page principale du Dashboard B2B (Espace Hôte / Propriétaire)
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  return <DashboardContent />;
}

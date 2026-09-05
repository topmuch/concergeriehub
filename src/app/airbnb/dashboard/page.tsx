import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { PortfolioContent } from '@/components/airbnb/portfolio-content';

export const metadata: Metadata = {
  title: 'Dashboard Hôte — Conciergerie Hub',
  description:
    'Portfolio multi-propriétés B2B : occupation, scans, revenus upsell, équipe et modules QR de vos biens.',
};

// ÉTAPE 12 (V2) — Vue "Portfolio" du Dashboard B2B multi-propriétés :
// grille de tous les biens + stats rapides, wizard d'ajout,
// équipe (rôles OWNER/MANAGER/CLEANER/MAINTENANCE) et invitations.
//
// Chantier ONBOARD : `?onboarding=1` (post-inscription landing) ouvre
// directement l'assistant de démarrage 3 minutes.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  const sp = await searchParams;
  const startOnboarding = sp.onboarding === '1';

  return <PortfolioContent startOnboarding={startOnboarding} />;
}

import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { HostOverviewContent } from '@/components/airbnb/host-overview';

export const metadata: Metadata = {
  title: 'Dashboard Hôte — Conciergerie Hub',
  description:
    'Vue d\u2019ensemble de votre activité : occupation, scans de plaques, revenus upsell et planning des séjours.',
};

// Chantier DASH-1 (redesign « Travl ») — la nouvelle vue d'ensemble :
// KPI à tuiles, planning calendrier + prochaines arrivées, stats par
// bien à onglets, cartes vertes à progression, totaux, bannière.
// L'assistant d'onboarding post-inscription est préservé ici.
// (La grille complète des biens a déménagé sur /airbnb/dashboard/portfolio.)
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  await searchParams; // ?onboarding=1 : géré par la logique interne du wizard

  return <HostOverviewContent />;
}

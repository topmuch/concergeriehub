import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { OverviewContent } from '@/components/airbnb/host/overview-content';

export const metadata: Metadata = {
  title: "Vue d'ensemble — Conciergerie Hub",
  description:
    "Tableau de bord de votre activité : scans de plaques, revenus upselling, note moyenne et propriétés actives.",
};

// Chantier HOST-2 — Vue d'Ensemble du Dashboard Client (spec QRTags Pro) :
// 4 KPIs réels (scans, revenus upselling, note moyenne, propriétés actives),
// courbe d'activité recharts 30 jours (scans + commandes), flux d'activité
// unifié, actions rapides. La session et le shell sont garantis par
// /airbnb/layout.tsx (redirect si visiteur).
export default async function DashboardPage() {
  await getServerSession(authOptions); // garantit le rendu dynamique (session)
  return <OverviewContent />;
}

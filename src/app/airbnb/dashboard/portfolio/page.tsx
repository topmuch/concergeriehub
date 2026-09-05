import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { PortfolioContent } from '@/components/airbnb/portfolio-content';

export const metadata: Metadata = {
  title: 'Portfolio — Dashboard Hôte | Conciergerie Hub',
  description:
    'Portfolio multi-propriétés B2B : grille des biens, wizard d\u2019ajout, équipe et invitations.',
};

// Chantier DASH-1 (redesign Travl) — l'ancienne vue d'accueil
// (grille des biens + wizard + équipe + invitations) devient la
// page « Portfolio », accessible depuis la nouvelle sidebar.
export default async function PortfolioPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  return <PortfolioContent />;
}

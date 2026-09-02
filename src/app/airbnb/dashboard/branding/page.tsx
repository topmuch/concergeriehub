import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { BrandingContent } from '@/components/airbnb/branding-content';

export const metadata: Metadata = {
  title: 'Branding & domaine — Conciergerie Hub',
  description:
    'White-label : logo, couleur de marque, message d’accueil et domaine personnalisé pour l’app invitée de chaque bien.',
};

// ÉTAPE 19 V3 — Onglet "Branding" (white-label de l'app invitée)
export default async function BrandingPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  return <BrandingContent />;
}

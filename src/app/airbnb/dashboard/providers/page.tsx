import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { ProvidersContent } from '@/components/airbnb/providers-content';

export const metadata: Metadata = {
  title: 'Prestataires — Conciergerie Hub',
  description:
    'Prestataires géolocalisés autour de votre bien : services propriétaire (ménage, plomberie) et expériences invité (petit-déjeuner, sommelier).',
};

// ÉTAPE 4 — Onglet "Prestataires" (géolocalisé, audience OWNER/GUEST)
export default async function ProvidersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  return <ProvidersContent />;
}

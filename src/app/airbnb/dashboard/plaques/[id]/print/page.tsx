import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LoginGate } from '@/components/airbnb/login-gate';
import { PlaquePrint } from '@/components/airbnb/plaque-print';

export const metadata: Metadata = {
  title: 'Imprimer une plaque — Conciergerie Hub',
  description: 'Fiche plaque QR imprimable (sticker A6) reliant le logement à son Hub.',
};

// ÉTAPE 6 — Fiche imprimable d'une plaque (QR → /hub/[slug])
export default async function PlaquePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginGate />;
  }

  return <PlaquePrint params={params} />;
}

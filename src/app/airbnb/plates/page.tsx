import type { Metadata } from 'next';
import { PlatesContent } from '@/components/airbnb/host/plates-content';

export const metadata: Metadata = {
  title: 'Plaques QR — Conciergerie Hub',
  description:
    'Commandez, imprimez et gérez vos plaques QR physiques : chaque plaque relie le logement à son Hub public (Wi-Fi, guide, services, contact hôte).',
};

// H4 (T4-a) — Page « Plaques QR » du Dashboard Client.
// Session garantie par src/app/airbnb/layout.tsx.
// ?new=1 → la modale « Commander une nouvelle plaque » est ouverte
// dès le montage (lien « Actions rapides » de la Vue d'ensemble).
export default async function PlatesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: isNew } = await searchParams;
  return <PlatesContent openOrderOnInit={isNew === '1'} />;
}

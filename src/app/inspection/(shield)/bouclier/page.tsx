import type { Metadata } from 'next';
import { ShieldLibrary } from '@/components/inspection/shield/shield-library';

// BOUCLIER V2 — Onglet 7 : Bouclier (bibliothèque de référence).
export const metadata: Metadata = {
  title: 'Bouclier — Bibliothèque de référence | RoomScan',
  description: 'Photos de référence verrouillées : zones fantômes et appareils hashés SHA-256.',
};

export default async function ShieldBouclierPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const { property } = await searchParams;
  return <ShieldLibrary initialPropertyId={property} />;
}

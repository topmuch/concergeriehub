import type { Metadata } from 'next';
import { GuestExperienceContent } from '@/components/airbnb/host/guest-experience-content';

export const metadata: Metadata = {
  title: 'Expérience Invité — RoomScan',
  description:
    'Vidéo de bienvenue, guide visuel d’arrivée, late check-out, bouclier d’avis et kit de survie : offrez une expérience 5 étoiles à vos invités.',
};

// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — page « ✨ Expérience Invité »
// de l'Espace Hôte (/airbnb/properties/[id]/guest-experience) : les 4
// sections de configuration qui alimentent les modules premium du Hub
// Invité (Property.premiumFeatures / visualGuide / survivalKitItems).
export default async function GuestExperiencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GuestExperienceContent initialPropertyId={id} />;
}

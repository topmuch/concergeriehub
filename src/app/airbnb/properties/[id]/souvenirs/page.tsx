import type { Metadata } from 'next';
import { SouvenirsContent } from '@/components/airbnb/host/souvenirs-content';

export const metadata: Metadata = {
  title: 'Boutique de souvenirs — RoomScan',
  description:
    'Vendez vos produits locaux (confitures, vins, artisanat) à vos invités — proposés dans leur hub et mis en avant la veille de leur départ.',
};

// v4.74 « BOUTIQUE DE SOUVENIRS » — page d'édition côté hôte
// (/airbnb/properties/[id]/souvenirs) : CRUD des produits
// (SouvenirProduct) qui alimentent la tuile « Boutique de
// souvenirs » du Hub Invité + les notifications « veille de départ ».
export default async function SouvenirsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SouvenirsContent initialPropertyId={id} />;
}

import type { Metadata } from 'next';
import { NotificationsContent } from '@/components/airbnb/host/notifications-content';

export const metadata: Metadata = {
  title: 'Notifications intelligentes — RoomScan',
  description:
    'Cartes élégantes affichées automatiquement dans le hub de vos invités au bon moment — repas, veille de départ — pour booster vos commandes.',
};

// v4.74 « SMART PROMPTS » — page « 🔔 Notifications intelligentes »
// de l'Espace Hôte (/airbnb/properties/[id]/notifications) : les 4
// cartes temporelles (petit-déjeuner, déjeuner, dîner, veille de
// départ) + durée d'affichage, alimentant NotificationSettings via
// GET/POST /api/airbnb/properties/[id]/notification-settings.
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NotificationsContent initialPropertyId={id} />;
}

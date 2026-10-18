import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MessagesContent } from '@/components/airbnb/host/messages-content';

export const metadata: Metadata = {
  title: 'Messages — RoomScan',
  description:
    'Centre de messages de vos invités : messages vocaux du Hub et signalements de problème, avec badges non lus.',
};

// Onglet MESSAGES du Dashboard Client (Espace Hôte) :
// regroupe les messages vocaux (🎙️ « Contacter l'hôte » du Hub) et les
// signalements de problème (🚨), tous deux connectés au bouton Messages
// (badge non lus dans la sidebar et le header). La session et le shell
// sont garantis par /airbnb/layout.tsx (redirect si visiteur).
export default async function MessagesPage() {
  await getServerSession(authOptions); // garantit le rendu dynamique (session)
  return <MessagesContent />;
}

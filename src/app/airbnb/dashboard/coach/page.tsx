import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CoachContent } from '@/components/airbnb/host/coach-content';

export const metadata: Metadata = {
  title: 'Coach Roomscan — RoomScan',
  description:
    "Votre assistant IA : recommandations du jour, historique, impact mesuré et préférences de notification.",
};

// COACH ROOMSCAN — PHASE 4 : page dédiée (v5.5).
// Trois onglets : Recommandations (actives + historique 90 j),
// Analytics (impact mensuel CoachAnalytics) et Préférences
// (canaux de notification + briefing email + types d'insights).
// La session et le shell sont garantis par /airbnb/layout.tsx.
export default async function CoachPage() {
  await getServerSession(authOptions); // garantit le rendu dynamique (session)
  return <CoachContent />;
}

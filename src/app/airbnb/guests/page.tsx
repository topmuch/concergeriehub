import type { Metadata } from 'next';
import { GuestsContent } from '@/components/airbnb/host/guests-content';

export const metadata: Metadata = {
  title: 'Invités — RoomScan',
  description:
    'Mini-CRM des séjours : historique complet par invité (commandes, états des lieux, ménages, livre d\'or) pour tous vos biens.',
};

// v4.69 — PHASE 2 — Onglet « Invités » du Dashboard Client (mini-CRM).
// Session + garde de rôle garantis par /airbnb/layout.tsx :
// le rendu est volontairement minimal (pattern Commandes).
export default function GuestsPage() {
  return <GuestsContent />;
}

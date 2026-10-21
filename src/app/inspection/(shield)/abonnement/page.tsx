import type { Metadata } from 'next';
import { ShieldSubscription } from '@/components/inspection/shield/shield-subscription';

// BOUCLIER V2 — Onglet 8 : Abonnement (plan + formules).
export const metadata: Metadata = {
  title: 'Bouclier — Abonnement | RoomScan',
  description: 'Votre protection Bouclier : plan actuel, jours restants et formules 299 € / 499 €.',
};

export default function ShieldAbonnementPage() {
  return <ShieldSubscription />;
}

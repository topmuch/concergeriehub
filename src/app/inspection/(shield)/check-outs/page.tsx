import type { Metadata } from 'next';
import { ShieldHistory } from '@/components/inspection/shield/shield-history';

// BOUCLIER V2 — Onglet 4 : Check-outs (historique TERMINE).
export const metadata: Metadata = {
  title: 'Bouclier — Check-outs | RoomScan',
  description: 'Historique des sorties validées avec comparaison entrée vs sortie.',
};

export default function ShieldCheckOutsPage() {
  return <ShieldHistory type="CHECK_OUT" />;
}

import type { Metadata } from 'next';
import { ShieldVisits } from '@/components/inspection/shield/shield-visits';

// BOUCLIER V2 — Onglet 2 : Ménage à faire (séjours A_VENIR /
// EN_RETARD + FLUX B « + Nouveau Séjour »).
export const metadata: Metadata = {
  title: 'Bouclier — Ménage à faire | RoomScan',
  description: 'Séjours planifiés et liens magiques cleaner pour vos états des lieux.',
};

export default function ShieldMenagePage() {
  return <ShieldVisits />;
}

import type { Metadata } from 'next';
import { ShieldHistory } from '@/components/inspection/shield/shield-history';

// BOUCLIER V2 — Onglet 3 : Check-ins (historique TERMINE).
export const metadata: Metadata = {
  title: 'Inventaire — Check-ins | RoomScan',
  description: 'Historique des entrées validées avec photos, vidéo hachée et PDF certifié.',
};

export default function ShieldCheckInsPage() {
  return <ShieldHistory type="CHECK_IN" />;
}

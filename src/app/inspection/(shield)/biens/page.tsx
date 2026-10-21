import type { Metadata } from 'next';
import { ShieldProperties } from '@/components/inspection/shield/shield-properties';

// BOUCLIER V2 — Onglet 5 : Mes biens (FLUX A — onboarding).
export const metadata: Metadata = {
  title: 'Bouclier — Mes biens | RoomScan',
  description: 'Logements protégés : bibliothèque de référence, zones fantômes et appareils.',
};

export default function ShieldBiensPage() {
  return <ShieldProperties />;
}

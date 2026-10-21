import type { Metadata } from 'next';
import { ShieldDashboard } from '@/components/inspection/shield/shield-dashboard';

// BOUCLIER V2 — Onglet 1 : Tableau de bord (design « dashboard
// premium » de l'image de référence validée client). La garde
// (session + entitlement EDL) est appliquée par le layout du
// route group (shield).
export const metadata: Metadata = {
  title: 'Bouclier — Tableau de bord | RoomScan',
  description: 'Vue d’ensemble de vos états des lieux certifiés : séjours, biens protégés, activité et prochains événements.',
};

export default function ShieldDashboardPage() {
  return <ShieldDashboard />;
}

import type { Metadata } from 'next';
import { AdminMonitoringContent } from '@/components/admin/admin-monitoring-content';

export const metadata: Metadata = {
  title: 'Tour de Contrôle — Superadmin RoomScan',
  description:
    "Surveillance temps réel de RoomScan : santé technique, détection prédictive, incidents et crons.",
};

// TOUR DE CONTRÔLE (v5.6) — monitoring 100 % maison : santé technique
// & métier, détection prédictive, incidents (résolution manuelle) et
// historique des crons. Le garde d'accès role==='superadmin' est fait
// dans /admin/layout.tsx.
export default function AdminMonitoringPage() {
  return <AdminMonitoringContent />;
}

import type { Metadata } from 'next';
import { AdminDashboardContent } from '@/components/admin/admin-dashboard-content';

export const metadata: Metadata = {
  title: 'Vue d’ensemble — Superadmin RoomScan',
};

// ÉTAPE 9.1 — Vue d'ensemble Superadmin.
// (Le garde d'accès role==='superadmin' est fait dans layout.tsx.)
export default function AdminDashboardPage() {
  return <AdminDashboardContent />;
}

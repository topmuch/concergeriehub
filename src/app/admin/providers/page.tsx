import type { Metadata } from 'next';
import { AdminProvidersContent } from '@/components/admin/admin-providers-content';

export const metadata: Metadata = {
  title: 'Prestataires — Superadmin Conciergerie Hub',
};

// ÉTAPE 9.2 — Gestion des prestataires (réservée au Superadmin).
// (Le garde d'accès role==='superadmin' est fait dans layout.tsx.)
export default function AdminProvidersPage() {
  return <AdminProvidersContent />;
}

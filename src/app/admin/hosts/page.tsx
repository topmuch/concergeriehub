import type { Metadata } from 'next';
import { AdminHostsContent } from '@/components/admin/admin-hosts-content';

export const metadata: Metadata = {
  title: 'Hôtes — Superadmin Conciergerie Hub',
};

// ÉTAPE 9.3 — Gestion des hôtes et propriétés.
// (Le garde d'accès role==='superadmin' est fait dans layout.tsx.)
export default function AdminHostsPage() {
  return <AdminHostsContent />;
}

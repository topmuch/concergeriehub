import type { Metadata } from 'next';
import { AdminUniversalContent } from '@/components/admin/admin-universal-content';

export const metadata: Metadata = {
  title: 'Contenu universel — Superadmin RoomScan',
};

// v4.47 — Module « 📚 Contenu universel » : guidebook + pack d'appareils
// de référence partagés par toutes les maisons (fallback des hubs +
// import 1 clic côté hôte). Éditeur réservé au Superadmin.
export default function AdminUniversalContentPage() {
  return <AdminUniversalContent />;
}

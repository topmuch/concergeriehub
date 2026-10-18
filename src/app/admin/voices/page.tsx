import type { Metadata } from 'next';
import { PlatformVoicesContent } from '@/components/admin/platform-voices-content';

export const metadata: Metadata = {
  title: 'Voix plateforme — Superadmin RoomScan',
};

// WP-BACK v4.61 — Module « 🔊 Voix plateforme » : voix par défaut des
// messages vocaux du Hub (welcome, checkout_eve, checkout_day, guidebook),
// définies par le Superadmin et servies aux biens dont l'hôte n'a pas
// configuré sa propre voix. Éditeur réservé au Superadmin.
export default function AdminVoicesPage() {
  return <PlatformVoicesContent />;
}

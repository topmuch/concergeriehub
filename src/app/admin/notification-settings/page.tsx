import type { Metadata } from 'next';
import { AdminNotificationsContent } from '@/components/admin/admin-notifications-content';

export const metadata: Metadata = {
  title: 'Notifications intelligentes — Superadmin RoomScan',
};

// v4.74 — PHASE 5 « Smart Prompts » : console Superadmin des
// notifications intelligentes — kill switch global (tous hubs,
// tous hôtes), messages par défaut des nouveaux hôtes et
// analytics d'impact sur les commandes souvenir (30 j).
// Page réservée au Superadmin.
export default function AdminNotificationSettingsPage() {
  return <AdminNotificationsContent />;
}

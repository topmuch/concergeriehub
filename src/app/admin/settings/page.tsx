import type { Metadata } from 'next';
import { AdminSettingsContent } from '@/components/admin/admin-settings-content';

export const metadata: Metadata = {
  title: 'Paramètres — Superadmin Conciergerie Hub',
};

// Module 7 — Paramètres : plateforme, white-label, feature flags, sécurité.
export default function AdminSettingsPage() {
  return <AdminSettingsContent />;
}

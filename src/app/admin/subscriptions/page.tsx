import type { Metadata } from 'next';
import { AdminSubscriptionsContent } from '@/components/admin/admin-subscriptions-content';

export const metadata: Metadata = {
  title: 'Abonnements — Superadmin Conciergerie Hub',
};

// Module 4 — Abonnements : MRR, abonnements, factures, coupons, packs.
export default function AdminSubscriptionsPage() {
  return <AdminSubscriptionsContent />;
}

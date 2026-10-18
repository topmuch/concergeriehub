import type { Metadata } from 'next';
import { AdminTransactionsContent } from '@/components/admin/admin-transactions-content';

export const metadata: Metadata = {
  title: 'Transactions — Superadmin RoomScan',
};

// Module 6 — Transactions : commandes de service, marketplace, reversements.
export default function AdminTransactionsPage() {
  return <AdminTransactionsContent />;
}

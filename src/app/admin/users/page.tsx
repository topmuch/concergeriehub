import type { Metadata } from 'next';
import { AdminUsers } from '@/components/admin/admin-users';

export const metadata: Metadata = {
  title: 'Clients & Hôtes — Superadmin Conciergerie Hub',
};

// Module 2 — Gestion Clients : comptes, plans, actions admin.
export default function AdminUsersPage() {
  return <AdminUsers />;
}

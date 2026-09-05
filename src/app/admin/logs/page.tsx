import type { Metadata } from 'next';
import { AdminLogsContent } from '@/components/admin/admin-logs-content';

export const metadata: Metadata = {
  title: 'Logs & Tickets — Superadmin Conciergerie Hub',
};

// Module 8 — Logs : audit, scans, tickets support.
export default function AdminLogsPage() {
  return <AdminLogsContent />;
}

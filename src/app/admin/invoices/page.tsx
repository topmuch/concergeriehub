import type { Metadata } from 'next';
import { AdminInvoicesContent } from '@/components/admin/admin-invoices-content';

export const metadata: Metadata = {
  title: 'Commissions & Facturation — Superadmin RoomScan',
};

// v4.69 — PHASE 5 « Commission, CRM Superadmin & Facturation mensuelle » :
// l'hôte encaisse les paiements via son Hub ; RoomScan prélève une
// commission (10 % / 20 % — configurable par hôte) facturée à la fin
// de chaque mois. Page réservée au Superadmin.
export default function AdminInvoicesPage() {
  return <AdminInvoicesContent />;
}

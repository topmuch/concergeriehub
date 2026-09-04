import type { Metadata } from 'next';
import { AdminEmailsContent } from '@/components/admin/admin-emails-content';

export const metadata: Metadata = {
  title: 'Emails — Superadmin Conciergerie Hub',
};

// ÉTAPE 22 — Console des emails transactionnels (outbox).
// (Le garde d'accès role==='superadmin' est fait dans layout.tsx.)
export default function AdminEmailsPage() {
  return <AdminEmailsContent />;
}

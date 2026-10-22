import type { Metadata } from 'next';
import { ShieldDocuments } from '@/components/inspection/shield/shield-documents';

// BOUCLIER V2 — Onglet 6 : Documents (archive des PDF).
export const metadata: Metadata = {
  title: 'Inventaire — Documents | RoomScan',
  description: 'Archive de tous vos PDF certifiés : onboarding et rapports de séjour.',
};

export default function ShieldDocumentsPage() {
  return <ShieldDocuments />;
}

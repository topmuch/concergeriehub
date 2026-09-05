import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminQrContent } from '@/components/admin/admin-qr-content';

export const metadata: Metadata = {
  title: 'Générateur QR — Superadmin Conciergerie Hub',
};

// Module 3 — Générateur QR : lots, plaques physiques, setup tokens.
// Suspense : le composant lit le paramètre ?tab= (useSearchParams).
export default function AdminQrPage() {
  return (
    <Suspense>
      <AdminQrContent />
    </Suspense>
  );
}

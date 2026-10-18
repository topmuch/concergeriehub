import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EdlCheckout } from '@/components/edl/edl-checkout';

export const metadata: Metadata = {
  title: 'États des Lieux Pro — 299 €/an | RoomScan',
  description:
    'Créez vos états des lieux d’entrée et de sortie avec signature électronique et génération de PDF illimitée. 299 €/an, paiement sécurisé PayPal.',
};

export default function EdlAbonnementPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-2xl px-4 py-16">
          <div className="h-64 animate-pulse rounded-3xl bg-white" aria-hidden="true" />
        </div>
      }
    >
      <EdlCheckout />
    </Suspense>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import PaymentSuccess from '@/components/payment/payment-success';

// FIX-CSP-PROD (v4.151) : rendu dynamique exigé par la CSP à nonce (même
// logique que la landing et /legal). Sans ce marqueur la page est pré-rendue
// au build → ses <script> n'ont AUCUN nonce → la CSP 'strict-dynamic' les
// bloque tous → zéro hydratation → le contenu framer-motion (réassurance +
// CTA wizard) reste figé à opacity:0 après le paiement.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Paiement confirmé — Certificat Anti-Dégâts | RoomScan',
  description:
    'Votre Certificat Anti-Dégâts est activé. Activez votre protection en 5 minutes avec le wizard d’onboarding guidé.',
};

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50">
          <div className="mx-auto w-full max-w-5xl px-4 py-16">
            <div className="h-64 animate-pulse rounded-3xl border border-gray-200 bg-gray-100 shadow-sm" aria-hidden="true" />
          </div>
        </div>
      }
    >
      <PaymentSuccess />
    </Suspense>
  );
}

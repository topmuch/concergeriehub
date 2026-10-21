import type { Metadata } from 'next';
import { Suspense } from 'react';
import OnboardingWizard from '@/components/inspection/shield/onboarding-wizard';

// FIX-CSP-PROD (v4.151) : rendu dynamique exigé par la CSP à nonce (même
// logique que la landing et /legal). Sans ce marqueur la page est pré-rendue
// au build → ses <script> n'ont AUCUN nonce → la CSP 'strict-dynamic' les
// bloque tous → zéro hydratation → le contenu framer-motion reste figé à
// opacity:0 (« YA JUSTE RoomScan — Onboarding / Étape 1/3 »).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Onboarding 5 minutes — Certificat Anti-Dégâts | RoomScan',
  description:
    'Configurez votre logement (pièces + équipements réels) et capturez vos photos de référence. Bibliothèque verrouillée, certificat PDF 100 % personnalisé — aucune case vide.',
};

export default function OnboardingWizardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50">
          <div className="mx-auto w-full max-w-2xl px-4 py-16">
            <div className="h-96 animate-pulse rounded-3xl border border-gray-200 bg-gray-100 shadow-sm" aria-hidden="true" />
          </div>
        </div>
      }
    >
      <OnboardingWizard />
    </Suspense>
  );
}

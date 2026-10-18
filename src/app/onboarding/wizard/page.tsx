import type { Metadata } from 'next';
import { Suspense } from 'react';
import OnboardingWizard from '@/components/inspection/shield/onboarding-wizard';

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

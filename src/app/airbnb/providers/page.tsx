import type { Metadata } from 'next';
import { ProvidersContent } from '@/components/airbnb/host/providers-content';

export const metadata: Metadata = {
  title: 'Prestataires — Conciergerie Hub',
  description:
    'Découvrez les prestataires vérifiés autour de votre bien : services propriétaire (ménage, plomberie…) et expériences invité (chef, sommelier, transferts).',
};

// H4 (T4-c) — Page « Prestataires » du Dashboard Client.
// Session garantie par src/app/airbnb/layout.tsx ; le hook
// useProviders alimente les données via le sélecteur du header.
export default function ProvidersPage() {
  return <ProvidersContent />;
}

import type { Metadata } from 'next';
import { PropertiesContent } from '@/components/airbnb/host/properties-content';

// =============================================================
// /airbnb/properties — « Mes Propriétés » (Dashboard Client)
//
// Composant serveur minimal : metadata + lecture de searchParams
// (?new=1 ouvre le wizard d'ajout directement — lien partagé depuis
// le header et les actions rapides). La session est déjà garantie
// par /app/airbnb/layout.tsx (redirect / si non connecté).
// =============================================================

export const metadata: Metadata = {
  title: 'Mes Propriétés — Conciergerie Hub',
};

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  return <PropertiesContent openWizardOnInit={params.new === '1'} />;
}

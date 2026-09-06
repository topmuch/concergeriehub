import type { Metadata } from 'next';
import { TeamContent } from '@/components/airbnb/host/team-content';

export const metadata: Metadata = {
  title: 'Équipe — Conciergerie Hub',
  description:
    'Gérez l\'équipe de vos biens : invitations, rôles (propriétaire, manager, ménage, maintenance) et permissions.',
};

// H4 (T4-c) — Page « Équipe » du Dashboard Client.
// Session garantie par src/app/airbnb/layout.tsx.
// ?property=<id> → bien présélectionné (liens depuis d'autres pages).
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const { property } = await searchParams;
  return <TeamContent initialPropertyId={property ?? null} />;
}

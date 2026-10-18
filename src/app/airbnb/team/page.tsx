import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { TeamContent } from '@/components/airbnb/host/team-content';
import { RestrictedAccess } from '@/components/airbnb/host/restricted-access';

export const metadata: Metadata = {
  title: 'Équipe — RoomScan',
  description:
    'Gérez l\'équipe de vos biens : invitations, rôles (propriétaire, manager, ménage, maintenance) et permissions.',
};

// H4 (T4-c) — Page « Équipe » du Dashboard Client.
// Session garantie par src/app/airbnb/layout.tsx.
// ?property=<id> → bien présélectionné (liens depuis d'autres pages).
//
// v4.81 (AUDIT QA) — GARDE DE RÔLE SERVEUR : la nav masquait la page
// aux membres CLEANER/MAINTENANCE, mais l'URL directe restait ouverte.
// Même règle que l'API (canManageTeam) : OWNER (propriété possédée) ou
// MANAGER (membre accepté) seulement. Les API restent la vraie barrière.
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const { property } = await searchParams;

  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !userId) redirect('/');
  if (role !== 'user') redirect('/admin/dashboard');

  const [ownedCount, memberships] = await Promise.all([
    db.property.count({ where: { ownerId: userId } }),
    db.propertyMember.findMany({
      where: { userId, acceptedAt: { not: null } },
      select: { role: true },
    }),
  ]);
  // Rôles legacy tolérés ('owner', 'cohost', 'member' → MANAGER).
  const canManage =
    ownedCount > 0 ||
    memberships.some((m) => ['OWNER', 'MANAGER', 'owner', 'cohost', 'member'].includes(m.role));
  if (!canManage) {
    return <RestrictedAccess feature="la gestion d'équipe" />;
  }

  return <TeamContent initialPropertyId={property ?? null} />;
}

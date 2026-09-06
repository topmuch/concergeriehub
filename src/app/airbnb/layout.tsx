import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { normalizeMemberRole } from '@/lib/team';
import { getHostPlanLimits } from '@/lib/b2b-server';
import { HostShell } from '@/components/airbnb/host/host-shell';

// =============================================================
// Layout racine de l'Espace Hôte (/airbnb/*) — Dashboard Client
//
// • Session NextAuth OBLIGATOIRE (sinon retour accueil).
// • Les comptes superadmin sont renvoyés vers leur console.
// • Calcule le niveau d'accès réel en base :
//   'full'  → possède un bien OU manager accepté d'au moins un bien
//   'team'  → uniquement CLEANER / MAINTENANCE (navigation réduite :
//             pas de Facturation, Équipe, Paramètres, Revenus)
// • Plan actif (nom affiché dans le profil sidebar).
// =============================================================

export default async function AirbnbLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string; name?: string | null } | undefined;

  if (!session?.user || !user?.id) {
    redirect('/');
  }
  if (user.role === 'superadmin') {
    // La console Superadmin vit dans /admin — pas de double espace.
    redirect('/admin/dashboard');
  }

  const userId = user.id;

  const [ownedCount, memberships, plan] = await Promise.all([
    db.property.count({ where: { ownerId: userId } }),
    db.propertyMember.findMany({
      where: { userId, acceptedAt: { not: null } },
      select: { role: true },
    }),
    getHostPlanLimits(userId),
  ]);

  const isManagerSomewhere = memberships.some((m) => {
    const role = normalizeMemberRole(m.role);
    return role === 'OWNER' || role === 'MANAGER';
  });

  const accessLevel: 'full' | 'team' = ownedCount > 0 || isManagerSomewhere ? 'full' : 'team';

  return (
    <HostShell
      userName={session.user?.name ?? null}
      userEmail={session.user?.email ?? null}
      planName={plan.planName}
      accessLevel={accessLevel}
    >
      {children}
    </HostShell>
  );
}

import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { SettingsContent } from '@/components/airbnb/host/settings-content';
import { RestrictedAccess } from '@/components/airbnb/host/restricted-access';

export const metadata: Metadata = {
  title: 'Paramètres — RoomScan',
  description:
    'Profil, propriétés, white-label (plan Pro), notifications, sécurité et intégrations de votre compte hôte.',
};

// HOST-5 — Page « Paramètres » du Dashboard Client :
// 6 onglets — Profil (nom/téléphone/adresse réels), Propriétés (lien
// portfolio), White-Label (BrandingContent, plan Pro), Notifications
// (préférences email/push persistées), Sécurité (changement de mot de
// passe réel bcrypt + état 2FA), Intégrations (webhooks, Stripe, iCal).
//
// v4.81 (AUDIT QA) — GARDE DE RÔLE SERVEUR : la page contient des
// réglages sensibles (intégrations Stripe/iCal, white-label). Elle est
// réservée aux OWNER (biens possédés) et MANAGER (membres acceptés) —
// même règle que la nav et l'API. Un CLEANER/MAINTENANCE voit l'écran
// « Accès restreint » (cohérence avec le contrat de rôle).
export default async function SettingsPage() {
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
  const canManage =
    ownedCount > 0 ||
    memberships.some((m) => ['OWNER', 'MANAGER', 'owner', 'cohost', 'member'].includes(m.role));
  if (!canManage) {
    return <RestrictedAccess feature="les Paramètres du compte" />;
  }

  return <SettingsContent />;
}

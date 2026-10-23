import type { ReactNode } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { hasEdlAccess } from '@/lib/edl-billing';
import { ShieldShell } from '@/components/inspection/shield/shield-shell';

// =============================================================
// BOUCLIER V2 — Layout protégé de TOUS les onglets du dashboard
// « États des Lieux » transformé (route group (shield) — les URLs
// restent /inspection/*). Garde identique à l'ancien dashboard :
//   · session NextAuth obligatoire → sinon porte dédiée
//     /login/edl (Étape 1 V4 — pages de connexion séparées) ;
//   · entitlement EDL (abonnement 299 €/an OU compte Hub)
//     → sinon page d'achat /edl/abonnement.
// Les pages PUBLIQUES /inspection/[token] restent HORS de ce
// groupe (aucune sidebar sur les partages invités).
// Design system (master prompt client) : sidebar bleu profond
// #055492 + fond slate-50 — voir shield-shell.tsx.
// =============================================================
export default async function ShieldLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; role?: string; name?: string | null; email?: string | null }
    | undefined;

  if (!session?.user || !user?.id) redirect('/login/edl');

  // Acheteur EDL sans abonnement valide ni compte Hub → page d'achat.
  if (!(await hasEdlAccess(user.id, user.role))) {
    redirect('/edl/abonnement');
  }

  return (
    <ShieldShell user={{ name: user.name ?? null, email: user.email ?? null }}>
      {children}
    </ShieldShell>
  );
}

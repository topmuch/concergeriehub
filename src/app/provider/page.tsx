import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { LoginGate } from '@/components/airbnb/login-gate';
import { ProviderDashboard } from '@/components/provider/provider-dashboard';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

// =============================================================
// ÉTAPE 17.4 (V3) — PORTAIL PRESTATAIRE (/provider)
//   1. Pas de session          → ProviderGate (connexion inline,
//                                 compte prestataire démo pré-rempli)
//   2. Session sans profil     → message "aucun profil prestataire"
//      providerProfile
//   3. providerProfile inactif → message "compte désactivé"
//   4. Sinon                   → ProviderDashboard (commandes du
//                                 prestataire, cycle de vie)
//
// Sécurité : le providerId n'est JAMAIS pris du client — il est
// résolu serveur depuis la session (User.providerProfile).
// Convention sandbox : pas de middleware actif, garde par page.
// =============================================================

const PROVIDER_DEMO = {
  email: 'morningbox@pro.conciergerie-hub.fr',
  password: 'Presta2024!',
};

export default async function ProviderPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!session?.user || !userId) {
    return (
      <ProviderShell>
        <LoginGate
          title="Portail Prestataire"
          subtitle="Connectez-vous pour retrouver vos commandes et gérer vos interventions."
          buttonLabel="Accéder à mes commandes"
          demoEmail={PROVIDER_DEMO.email}
          demoPassword={PROVIDER_DEMO.password}
          demoLabel="Compte prestataire démo"
        />
      </ProviderShell>
    );
  }

  const provider = await db.provider.findUnique({
    where: { userId },
    select: { businessName: true, isActive: true },
  });

  if (!provider) {
    return (
      <ProviderShell>
        <NoProfileCard
          emoji="🧰"
          title="Aucun profil prestataire"
          description="Ce compte n'est pas rattaché à un prestataire. Le portail est réservé aux partenaires de Conciergerie Hub (ménage, plomberie, chef à domicile, transferts…). Si vous êtes un hôte, rendez-vous sur l'Espace Hôte."
        />
      </ProviderShell>
    );
  }

  if (!provider.isActive) {
    return (
      <ProviderShell>
        <NoProfileCard
          emoji="⏸️"
          title="Compte prestataire désactivé"
          description={`Le compte de ${provider.businessName} est actuellement désactivé. Contactez votre conciergerie pour le réactiver.`}
        />
      </ProviderShell>
    );
  }

  return <ProviderDashboard />;
}

/** Coquille commune : centrage + retour site (règle footer sticky). */
function ProviderShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <main className="flex-1 flex flex-col justify-center">{children}</main>
      <footer className="mt-auto bg-white border-t border-slate-200 py-4">
        <div className="max-w-6xl mx-auto w-full px-4 flex items-center justify-between gap-2">
          <BrandLogo size="sm" />
          <p className="text-xs text-slate-400">Conciergerie Hub — Portail Prestataire</p>
        </div>
      </footer>
    </div>
  );
}

function NoProfileCard({ emoji, title, description }: {
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <div className="px-4 py-12 w-full">
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-lg mx-auto">
        <p className="text-4xl" aria-hidden="true">{emoji}</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">{description}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/">
            <Button variant="outline">← Retour au site</Button>
          </Link>
          <Link href="/airbnb/dashboard">
            <Button className="bg-slate-900 hover:bg-slate-800 text-white">Espace Hôte</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

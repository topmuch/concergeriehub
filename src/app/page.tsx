import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { LandingShell } from '@/components/landing/landing-shell';

// Police landing (spec : Inter ou Plus Jakarta Sans) — scopée à la
// page, n'affecte pas le reste de l'application (Geist global).
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Conciergerie Hub — Transformez chaque séjour en expérience 5 étoiles',
  description:
    'Une seule plaque QR élégante : Wi-Fi, guidebook et services en 1 scan pour vos invités. Vous pilotez tout depuis un dashboard professionnel. Sans application.',
};

// LANDING V4 — ÉTAPE 3/3 : page d'accueil complète + espace auth
// intégré (LandingShell : landing ↔ connexion/inscription, puis
// redirection par rôle). L'aperçu É1 et la V1 restent dans page.tsx.bak.
export default function Home() {
  return (
    <div className={`${jakarta.variable} font-[family-name:var(--font-jakarta)]`}>
      <LandingShell />
    </div>
  );
}

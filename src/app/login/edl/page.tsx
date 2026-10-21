import type { Metadata } from 'next';
import { SpaceLogin } from '@/components/auth/space-login';

// =============================================================
// ÉTAPE 1 (V4) — Page de connexion DÉDIÉE au module États des
// Lieux. Séparée des autres espaces (demande client) : sa propre
// URL, son propre habillage (clair pro, rouge signature #C21F26)
// et sa destination propre (/inspection/dashboard). La garde du
// dashboard /inspection renvoie ici tout visiteur non connecté.
// =============================================================

export const metadata: Metadata = {
  title: 'Connexion États des Lieux — RoomScan',
  description: 'Connexion au module États des Lieux RoomScan : EDL signés et partageables.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function LoginPageEdl() {
  return <SpaceLogin space='edl' />;
}

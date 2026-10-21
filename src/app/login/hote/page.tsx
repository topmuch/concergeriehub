import type { Metadata } from 'next';
import { SpaceLogin } from '@/components/auth/space-login';

// =============================================================
// ÉTAPE 1 (V4) — Page de connexion DÉDIÉE à l'Espace Hôte.
// Séparée des autres espaces (demande client) : sa propre URL,
// son propre habillage (luxe sombre rouge/or) et sa destination
// propre (/airbnb/dashboard). La garde du layout /airbnb renvoie
// ici tout visiteur non connecté.
// =============================================================

export const metadata: Metadata = {
  title: 'Connexion Hôte — RoomScan',
  description: 'Connexion à votre Espace Hôte RoomScan : biens, plaques QR et séjours.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function LoginPageHote() {
  return <SpaceLogin space='hote' />;
}

import type { Metadata } from 'next';
import { SpaceLogin } from '@/components/auth/space-login';

// =============================================================
// ÉTAPE 1 (V4) — Page de connexion DÉDIÉE à la Console Superadmin.
// Séparée des autres espaces (demande client) : sa propre URL, son
// propre habillage (bleu nuit + or) et sa destination propre
// (/admin/dashboard). Le layout /admin renvoie ici tout visiteur
// sans rôle superadmin (?expired=1 si la session était présente
// mais expirée — bandeau rassurant conservé).
// =============================================================

export const metadata: Metadata = {
  title: 'Connexion Superadmin — RoomScan',
  description: 'Accès restreint : connexion à la console Superadmin RoomScan.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function LoginPageSuperadmin() {
  return <SpaceLogin space='superadmin' />;
}

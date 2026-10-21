import type { Metadata } from 'next';
import { ModeDEmploiContent } from '@/components/airbnb/host/mode-demploi-content';

// FIX-CSP-PROD — page dynamique : jamais prerendue, la session et
// l'entitlement EDL sont garantis par src/app/inspection/(shield)/layout.tsx
// (aucune garde dupliquee ici).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Mode d'emploi — Bouclier | RoomScan",
  description:
    'Guide pas à pas du Bouclier RoomScan : les 6 étapes des états des lieux certifiés et les notifications envoyées automatiquement à chaque étape du séjour.',
};

// v4.158 — onglet « Mode d'emploi » du dashboard Bouclier
// (/inspection/dashboard). Réutilise le composant Task 42-c du groupe
// Aide hôte : contenu 100 % statique, charte Bouclier identique
// (#1e3a8a / #C41E3A / fond #f8fafc). Le conteneur paddé p-4 sm:p-6
// reproduit le padding du shell hôte que les marges négatives du
// composant (-m-4 sm:-m-6) neutralisent — rendu flush identique.
export default function ModeDEmploiShieldPage() {
  return (
    <div className="p-4 sm:p-6">
      <ModeDEmploiContent />
    </div>
  );
}

import type { Metadata } from 'next';
import { FileDown } from 'lucide-react';
import { ModeDEmploiContent } from '@/components/airbnb/host/mode-demploi-content';

// FIX-CSP-PROD — page dynamique : jamais prerendue, la session et
// l'entitlement EDL sont garantis par src/app/inspection/(shield)/layout.tsx
// (aucune garde dupliquee ici).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Mode d'emploi — Inventaire | RoomScan",
  description:
    'Guide pas à pas de l’Inventaire RoomScan : les 6 étapes des états des lieux certifiés et les notifications envoyées automatiquement à chaque étape du séjour.',
};

// v4.158 — onglet « Mode d'emploi » du dashboard Inventaire
// (/inspection/dashboard). Réutilise le composant Task 42-c du groupe
// Aide hôte : contenu 100 % statique. Le conteneur paddé p-4 sm:p-6
// reproduit le padding du shell hôte que les marges négatives du
// composant (-m-4 sm:-m-6) neutralisent — rendu flush identique.
// v5.0 — demande client : BOUTON « Télécharger le PDF » (GET
// /api/shield/mode-demploi/pdf, Content-Disposition attachment) en
// haut à droite de la page.
export default function ModeDEmploiShieldPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="relative z-10 mx-auto mb-6 flex w-full max-w-3xl justify-end sm:mb-8">
        <a
          href="/api/shield/mode-demploi/pdf"
          download
          className="luxe-btn-primary"
          aria-label="Télécharger le mode d'emploi en PDF"
        >
          <FileDown className="h-4 w-4" aria-hidden="true" />
          Télécharger le PDF
        </a>
      </div>
      <ModeDEmploiContent />
    </div>
  );
}

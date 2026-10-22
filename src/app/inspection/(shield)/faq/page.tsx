import type { Metadata } from 'next';
import { FaqContent } from '@/components/airbnb/host/faq-content';

// FIX-CSP-PROD — page dynamique : jamais prerendue, la session et
// l'entitlement EDL sont garantis par src/app/inspection/(shield)/layout.tsx
// (aucune garde dupliquee ici).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FAQ — Inventaire | RoomScan',
  description:
    'Questions fréquentes sur l’Inventaire RoomScan : photos sécurisées, connexion, ménage vérifié, certificat anti-dégâts et support.',
};

// v4.158 — onglet « FAQ » du dashboard Bouclier
// (/inspection/dashboard). Réutilise le composant Task 42-c du groupe
// Aide hôte : contenu 100 % statique, Accordion shadcn/ui, aucune
// dépendance au contexte hôte. Conteneur paddé p-4 sm:p-6 pour
// neutraliser les marges négatives du composant (voir mode-demploi).
export default function FaqShieldPage() {
  return (
    <div className="p-4 sm:p-6">
      <FaqContent />
    </div>
  );
}

import type { Metadata } from 'next';
import { ModeDEmploiContent } from '@/components/airbnb/host/mode-demploi-content';

// FIX-CSP-PROD — page dynamique : jamais prerendue, la session est
// garantie par src/app/airbnb/layout.tsx (aucune garde dupliquee ici).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Mode d'emploi — RoomScan",
  description:
    'Guide pas à pas du Bouclier RoomScan : les 6 étapes des états des lieux certifiés et les notifications envoyées automatiquement à chaque étape du séjour.',
};

// Task 42-c — page « Mode d'emploi » du groupe Aide (dashboard hôte).
export default function ModeDEmploiPage() {
  return <ModeDEmploiContent />;
}

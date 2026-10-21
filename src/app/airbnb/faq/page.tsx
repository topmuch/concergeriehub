import type { Metadata } from 'next';
import { FaqContent } from '@/components/airbnb/host/faq-content';

// FIX-CSP-PROD — page dynamique : jamais prerendue, la session est
// garantie par src/app/airbnb/layout.tsx (aucune garde dupliquee ici).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FAQ — RoomScan',
  description:
    'Questions fréquentes sur le Bouclier RoomScan : photos sécurisées, connexion, ménage vérifié, certificat anti-dégâts et support.',
};

// Task 42-c — page « FAQ » du groupe Aide (dashboard hôte).
export default function FaqPage() {
  return <FaqContent />;
}

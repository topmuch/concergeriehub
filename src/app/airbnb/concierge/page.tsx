import type { Metadata } from 'next';
import { ConciergeContent } from '@/components/airbnb/host/concierge-content';

export const metadata: Metadata = {
  title: 'Conciergerie digitale — RoomScan',
  description:
    'Codes d’accès, appareils, bonnes adresses et SOS : remplissez l’app digitale de vos invités en quelques minutes.',
};

// DIGITAL CONCIERGE (V4.1) — ÉDITEURS CÔTÉ HÔTE :
// page « 🗝️ Conciergerie » de l'Espace Hôte — 4 onglets (Coffre-fort,
// Appareils, Bonnes adresses, SOS) qui alimentent directement les
// modules enrichis du Hub Invité (Property.accessCodes/appliances/
// localSpots/emergencyInfo).
export default function ConciergePage() {
  return <ConciergeContent />;
}

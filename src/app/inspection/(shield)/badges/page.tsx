import type { Metadata } from 'next';
import { ShieldBadgesContent } from '@/components/inspection/shield/shield-badges';

// FIX-CSP-PROD — page dynamique : jamais prerendue, la session et
// l'entitlement EDL sont garantis par src/app/inspection/(shield)/layout.tsx
// (aucune garde dupliquee ici).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Badges de confiance — Bouclier | RoomScan',
  description:
    'Téléchargez vos 3 badges de confiance RoomScan (Sécurité, Propreté, Technologie) en PNG HD ou en code HTML, avec QR de vérification publique.',
};

// v4.160 — onglet « Badges de confiance » du dashboard Bouclier
// (/inspection/badges, positionné SOUS « FAQ » dans la sidebar).
// Sélecteur de logement + modal MarketingBadgesModal (QR /verify,
// compatible IDs ShieldProperty depuis v4.159).
export default function BadgesShieldPage() {
  return (
    <div className="p-4 sm:p-6">
      <ShieldBadgesContent />
    </div>
  );
}

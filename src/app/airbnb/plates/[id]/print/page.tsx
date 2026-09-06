import type { Metadata } from 'next';
import { PlaquePrint } from '@/components/airbnb/plaque-print';

export const metadata: Metadata = {
  title: 'Imprimer une plaque — Conciergerie Hub',
  description: 'Fiche plaque QR imprimable (sticker A6) reliant le logement à son Hub.',
};

// H4 (T4-a) — Migration de la fiche imprimable vers /airbnb/plates/[id]/print.
// • La session est GARANTIE par src/app/airbnb/layout.tsx (redirect '/' sans
//   session) — pas besoin de LoginGate ici.
// • La garde d'accès aux données reste identique à l'existante : la fiche
//   charge /api/airbnb/plaques/[id] qui vérifie la propriété de la plaque
//   (claimedByUserId ou bien accessible) et renvoie 404 sinon.
// • L'ancienne URL /airbnb/dashboard/plaques/[id]/print reste fonctionnelle
//   (les redirects 301 arrivent en H5 avec l'orchestrateur).
export default async function PlatePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PlaquePrint params={params} backHref="/airbnb/plates" />;
}

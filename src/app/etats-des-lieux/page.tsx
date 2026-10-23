import type { Metadata } from 'next';
import { SiteChrome, PageHero } from '@/components/landing/site-chrome';
import { EdlExplainer } from '@/components/landing/edl-explainer-section';

// FIX-CSP-PROD : la CSP à nonce (middleware FIX-8b) exige le rendu
// dynamique (scripts noncés par requête).
export const dynamic = 'force-dynamic';

const TITLE = 'États des Lieux — RoomScan';
const DESCRIPTION =
  'État des lieux d’entrée et de sortie guidé à la voix : photos comparées zone par zone, vidéo horodatée, signature de l’invité, PDF certifié reconnu par les assurances. Dès 299 €/an pour 3 biens.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/etats-des-lieux' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/etats-des-lieux',
    title: TITLE,
    description: DESCRIPTION,
  },
};

// v5.18 SITE MULTIPAGES — page dédiée « États des Lieux » (à quoi ça
// sert, procédure en 5 étapes guidées, avantages — v5.17).
export default function EtatsDesLieuxPage() {
  return (
    <SiteChrome>
      <PageHero
        eyebrow="Module États des Lieux"
        title="Votre preuve,"
        highlight="de l’entrée à la sortie."
        description="L’état des lieux protège votre activité : RoomScan le transforme en parcours guidé sur téléphone — photo, vidéo, signature, PDF certifié."
      />
      <EdlExplainer />
    </SiteChrome>
  );
}

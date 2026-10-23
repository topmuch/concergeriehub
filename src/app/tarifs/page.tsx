import type { Metadata } from 'next';
import { SiteChrome, PageHero } from '@/components/landing/site-chrome';
import { PricingSection } from '@/components/landing/pricing-section';
import { MarketsSection } from '@/components/landing/markets-section';
import { CtaFinal } from '@/components/landing/cta-final';

// FIX-CSP-PROD : la CSP à nonce (middleware FIX-8b) exige le rendu
// dynamique (scripts noncés par requête).
export const dynamic = 'force-dynamic';

const TITLE = 'Tarifs — RoomScan';
const DESCRIPTION =
  'Solo 29 €/mois, Pro 99 €/mois (conciergeries et multi-hôtes), États des Lieux 299 €/an pour 3 biens, États des Lieux Pro 499 €/an jusqu’à 15 biens. Paiement sécurisé PayPal, sans engagement.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/tarifs' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/tarifs',
    title: TITLE,
    description: DESCRIPTION,
  },
};

// v5.18 SITE MULTIPAGES — page dédiée « Tarifs » : les 4 offres
// (PayPal), marchés couverts + FAQ (source unique JSON-LD), CTA final.
export default function TarifsPage() {
  return (
    <SiteChrome>
      <PageHero
        eyebrow="Tarifs"
        title="Une offre pour"
        highlight="chaque activité."
        description="Hôte d’un seul bien ou conciergerie multi-propriétés : payez PayPal, sans engagement, et démarrez aujourd’hui."
      />
      <PricingSection />
      <MarketsSection />
      <CtaFinal />
    </SiteChrome>
  );
}

import type { Metadata } from 'next';
import { SiteChrome, PageHero } from '@/components/landing/site-chrome';
import { DemoSection } from '@/components/landing/demo-section';
import { HowItWorks } from '@/components/landing/how-it-works';
import { CtaFinal } from '@/components/landing/cta-final';

// FIX-CSP-PROD : la CSP à nonce (middleware FIX-8b) exige le rendu
// dynamique (scripts noncés par requête).
export const dynamic = 'force-dynamic';

const TITLE = 'Comment ça marche — RoomScan';
const DESCRIPTION =
  'Recevez votre plaque QR, scannez, configurez : vos invités accèdent au Wi-Fi, au guidebook et à vos services en un scan. Installé en 3 minutes, sans application.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/comment-ca-marche' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/comment-ca-marche',
    title: TITLE,
    description: DESCRIPTION,
  },
};

// v5.18 SITE MULTIPAGES — page dédiée « Comment ça marche » (démo
// interactive + les 3 étapes de mise en route).
export default function CommentCaMarchePage() {
  return (
    <SiteChrome>
      <PageHero
        eyebrow="Comment ça marche"
        title="Opérationnel en"
        highlight="3 minutes"
        description="Pas d’application à installer, pas de matériel complexe : la plaque arrive prête, vos invités scannent, vous pilotez tout."
      />
      <DemoSection />
      <HowItWorks />
      <CtaFinal />
    </SiteChrome>
  );
}

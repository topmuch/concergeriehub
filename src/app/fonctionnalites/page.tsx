import type { Metadata } from 'next';
import { SiteChrome, PageHero } from '@/components/landing/site-chrome';
import { BeforeAfter } from '@/components/landing/before-after';
import { BentoGrid } from '@/components/landing/modules-showcase';
import { CtaFinal } from '@/components/landing/cta-final';

// FIX-CSP-PROD : la CSP à nonce (middleware FIX-8b) exige le rendu
// dynamique (scripts noncés par requête).
export const dynamic = 'force-dynamic';

const TITLE = 'Fonctionnalités — RoomScan';
const DESCRIPTION =
  'Dashboard multi-biens, upselling automatisé, bouclier d’avis, white-label, équipes et analytics : toutes les fonctionnalités de la conciergerie RoomScan.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/fonctionnalites' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/fonctionnalites',
    title: TITLE,
    description: DESCRIPTION,
  },
};

// v5.18 SITE MULTIPAGES — page dédiée « Fonctionnalités » (avant/après
// + bento des modules), extraite de l'ancien one-page.
export default function FonctionnalitesPage() {
  return (
    <SiteChrome>
      <PageHero
        eyebrow="Fonctionnalités"
        title="Tout votre séjour,"
        highlight="piloté d’une main."
        description="Une plaque QR pour vos invités, un dashboard professionnel pour vous : découvrez chaque module qui automatise votre conciergerie."
      />
      <BeforeAfter />
      <BentoGrid />
      <CtaFinal />
    </SiteChrome>
  );
}

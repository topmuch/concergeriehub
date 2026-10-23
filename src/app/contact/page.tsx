import type { Metadata } from 'next';
import { SiteChrome, PageHero } from '@/components/landing/site-chrome';
import { ContactSection } from '@/components/landing/contact-section';

// FIX-CSP-PROD : la CSP à nonce (middleware FIX-8b) exige le rendu
// dynamique (scripts noncés par requête).
export const dynamic = 'force-dynamic';

const TITLE = 'Contact — RoomScan';
const DESCRIPTION =
  'Une question, une démonstration, un devis sur mesure ? Écrivez-nous via le formulaire ou contact@roomscan.pro — réponse sous 24 h, 7 j/7.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/contact' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/contact',
    title: TITLE,
    description: DESCRIPTION,
  },
};

// v5.18 SITE MULTIPAGES — page dédiée « Contact » avec formulaire
// (POST /api/public/contact → ContactMessage + email outbox) et carte
// OpenStreetMap (demande client).
export default function ContactPage() {
  return (
    <SiteChrome>
      <PageHero
        eyebrow="Contact"
        title="Parlons de"
        highlight="votre conciergerie."
        description="Démonstration, tarifs, module États des Lieux ou support : notre équipe vous répond sous 24 h, 7 j/7."
      />
      <ContactSection />
    </SiteChrome>
  );
}

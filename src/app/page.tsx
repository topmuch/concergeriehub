import type { Metadata } from 'next';
import { LandingShell } from '@/components/landing/landing-shell';
import { siteName, siteUrl } from '@/lib/site';
import { SEO_FAQ } from '@/lib/seo-faq';

// FIX-CSP-PROD : la CSP à nonce (middleware FIX-8b) exige le rendu dynamique.
// En statique (pré-rendu au build), les scripts n'ont pas le nonce de la requête
// et 'strict-dynamic' les bloque tous → page blanche en production.
export const dynamic = 'force-dynamic';

// TYPOGRAPHIE SITE — Tahoma (choix utilisateur) : définie GLOBALEMENT
// dans globals.css (@theme --font-sans / --font-serif, Tahoma en tête
// de stack). L'ancienne police landing (Plus Jakarta Sans) est retirée :
// la page hérite de la police du site comme tout le reste.

// SEO v4.77 — title/description OG enrichis avec les mots-clés cœur
// (hub invité Airbnb, conciergerie QR code, guide numérique) sans bourrage.
const LANDING_TITLE = 'RoomScan — Transformez chaque séjour en expérience 5 étoiles';
const LANDING_DESCRIPTION =
  'Votre hub invité Airbnb en une plaque QR : Wi-Fi, guide numérique et services en 1 scan. La conciergerie QR code qui pilote tout le séjour. Sans application.';

export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    // Remplace TOTALEMENT l'openGraph du layout (règle Next.js) →
    // il faut re-déclarer les langues alternatives ici.
    alternateLocale: ['en_US', 'es_ES'],
    url: '/',
    siteName,
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    // og:image injecté automatiquement par app/opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
  },
};

// ── JSON-LD (rich results Google) ─────────────────────────────
// @graph : Organization (identité) + WebSite + SoftwareApplication
// (catégorie TravelApplication, offres réelles affichées sur la
// landing : Solo 9,90 €/mois, Pro 199 €/an) + FAQPage dont les
// Q/R sont rendues VISIBLEMENT dans markets-section.tsx (exigence
// Google — source unique : lib/seo-faq.ts).
// Pas d'aggregateRating : jamais de fausses notes.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: siteName,
      url: siteUrl,
      logo: `${siteUrl}/icon-512.png`,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'contact@roomscan.pro',
        availableLanguage: ['fr', 'en', 'es'],
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: siteName,
      url: siteUrl,
      inLanguage: 'fr-FR',
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#app`,
      name: `${siteName} — Concierge Hub`,
      url: siteUrl,
      applicationCategory: 'TravelApplication',
      operatingSystem: 'Web',
      description: LANDING_DESCRIPTION,
      inLanguage: 'fr-FR',
      publisher: { '@id': `${siteUrl}/#organization` },
      areaServed: [
        { '@type': 'AdministrativeArea', name: 'Afrique de l’Ouest' },
        { '@type': 'AdministrativeArea', name: 'Europe' },
        { '@type': 'Country', name: 'Canada' },
      ],
      offers: [
        {
          '@type': 'Offer',
          name: 'Solo',
          price: '9.90',
          priceCurrency: 'EUR',
          description: 'Formule Solo — facturation mensuelle',
        },
        {
          '@type': 'Offer',
          name: 'Pro',
          price: '199.00',
          priceCurrency: 'EUR',
          description: 'Formule Pro — facturation annuelle',
        },
      ],
      featureList: [
        'Hub invité Airbnb ouvert par une plaque QR',
        'Conciergerie QR code : Wi-Fi en 1 clic',
        'Guide numérique de location saisonnière (house manual digital)',
        'Welcome book digital & digital guestbook',
        'Minibar numérique, départ tardif et boutique de souvenirs',
        'Bouclier d’avis et messagerie vocale hôte-invité',
        'Dashboard hôte : calendrier, ménage, notifications, sync iCal',
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}/#faq`,
      inLanguage: 'fr-FR',
      mainEntity: SEO_FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ],
};

// LANDING V4 — ÉTAPE 3/3 : page d'accueil complète + espace auth
// intégré (LandingShell : landing ↔ connexion/inscription, puis
// redirection par rôle). L'aperçu É1 et la V1 restent dans page.tsx.bak.
export default function Home() {
  return (
    <div className="font-sans">
      <script
        type="application/ld+json"
        // Données structurées statiques (aucune entrée utilisateur) —
        // safe pour dangerouslySetInnerHTML.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingShell />
    </div>
  );
}

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { LandingShell } from '@/components/landing/landing-shell';
import { siteName, siteUrl } from '@/lib/site';

// Police landing (spec : Inter ou Plus Jakarta Sans) — scopée à la
// page, n'affecte pas le reste de l'application (Geist global).
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const LANDING_TITLE = 'Conciergerie Hub — Transformez chaque séjour en expérience 5 étoiles';
const LANDING_DESCRIPTION =
  'Une seule plaque QR élégante : Wi-Fi, guidebook et services en 1 scan pour vos invités. Vous pilotez tout depuis un dashboard professionnel. Sans application.';

export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
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
// avec les deux offres affichées sur la landing (Solo 9,90 €/mois,
// Pro 199 €/an). Pas d'aggregateRating : jamais de fausses notes.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: siteName,
      url: siteUrl,
      logo: `${siteUrl}/icon-512.png`,
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
      name: siteName,
      url: siteUrl,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: LANDING_DESCRIPTION,
      inLanguage: 'fr-FR',
      publisher: { '@id': `${siteUrl}/#organization` },
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
        'Plaque QR intelligente pour vos invités',
        'Wi-Fi, guidebook et services en 1 scan',
        'Dashboard multi-propriétés pour les hôtes',
        'Sans application pour les invités',
      ],
    },
  ],
};

// LANDING V4 — ÉTAPE 3/3 : page d'accueil complète + espace auth
// intégré (LandingShell : landing ↔ connexion/inscription, puis
// redirection par rôle). L'aperçu É1 et la V1 restent dans page.tsx.bak.
export default function Home() {
  return (
    <div className={`${jakarta.variable} font-[family-name:var(--font-jakarta)]`}>
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

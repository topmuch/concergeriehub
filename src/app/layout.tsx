import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Playfair_Display } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { GlobalErrorReporter } from "@/components/monitoring/global-error-reporter";
import { siteName, siteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// DESIGN PREMIUM « LUXE TECH » — typographie signature :
//   • Playfair Display (serif) → titres display, touche luxe/hôtelier
//   • Inter (sans) → corps de texte, lisibilité maximale (SF Pro-like)
// Les deux sont exposés en variables CSS puis mappés dans globals.css
// (@theme : --font-serif / --font-sans) → classes font-serif & font-sans.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// =============================================================
// SEO v4.77 — metadata racine enrichie (3 marchés : Afrique de
// l'Ouest, Europe, Canada). Mots-clés cœur FR + EN : « airbnb hub »,
// « conciergerie QR code », « guide numérique location saisonnière »,
// « house manual digital », « welcome book », « digital guestbook »,
// « guest experience app ». Pas de bourrage : une occurrence par
// variante, description ~153 chars.
// =============================================================
const ROOT_TITLE = `${siteName} — Concierge Hub | Conciergerie QR code Airbnb`;
const ROOT_DESCRIPTION =
  'Conciergerie QR code pour locations saisonnières : hub invité Airbnb (Wi-Fi, guide numérique, welcome book, avis) pour hôtes en Afrique, Europe & Canada.';

const ROOT_KEYWORDS = [
  // FR — cœur produit
  'airbnb hub',
  'conciergerie QR code',
  'QR code conciergerie',
  'guide numérique location saisonnière',
  'guidebook numérique',
  'hub invité Airbnb',
  'conciergerie numérique',
  'welcome book',
  'plaque QR Airbnb',
  'location courte durée',
  'livre d’accueil digital',
  'bouclier d’avis',
  // EN — requêtes internationales
  'house manual digital',
  'digital guestbook',
  'guest experience app',
  'digital guidebook',
  'QR code host app',
  'vacation rental welcome book',
  'short term rental guest app',
  'Airbnb digital guidebook',
];

export const metadata: Metadata = {
  // metadataBase : résout les URLs relatives (og:image, canonical…)
  // sur TOUTES les routes — propage aux segments enfants.
  metadataBase: new URL(siteUrl),
  title: {
    default: ROOT_TITLE,
    template: `%s | ${siteName} — Concierge Hub`,
  },
  description: ROOT_DESCRIPTION,
  applicationName: siteName,
  keywords: ROOT_KEYWORDS,
  openGraph: {
    type: 'website',
    siteName,
    locale: 'fr_FR',
    alternateLocale: ['en_US', 'es_ES'],
    title: ROOT_TITLE,
    description: ROOT_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: ROOT_TITLE,
    description: ROOT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteName,
  },
  icons: {
    icon: "/icon-512.png",
    apple: "/icon-512.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${inter.variable}`}>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {/* FIX-14 — monitoring d'erreurs client (invisible, 1 seul rendu racine) */}
          <GlobalErrorReporter />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
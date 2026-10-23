'use client';

// =============================================================
// LandingPage V7 — ACCUEIL CONDENSÉ DU SITE MULTIPAGES (v5.18).
//
// Demande client : « je ne veux pas que le site soit onepage mais
// un site multipages — créer des pages dédiées Fonctionnalités /
// Comment ça marche / États des Lieux / Tarifs / Contact ».
//
// Désormais :
//   • Chaque onglet du menu mène à une ROUTE dédiée
//     (/fonctionnalites, /comment-ca-marche, /etats-des-lieux,
//     /tarifs, /contact — coquille commune : site-chrome.tsx).
//   • L'accueil reste la vitrine de conversion : Hero + logos
//     plateformes + démo interactive + cartes vers les pages
//     dédiées (ExploreSection) + témoignages + CTA final.
//   • BentoGrid → /fonctionnalites · HowItWorks+BeforeAfter →
//     /comment-ca-marche · EdlExplainer → /etats-des-lieux ·
//     PricingSection+MarketsSection(FAQ) → /tarifs ·
//     formulaire+carte → /contact.
//
// Contrat PRÉSERVÉ (landing-shell) :
//   • export AuthViewMode + LandingPageProps + LandingPage
//   • ancres internes #demo / #temoignages intactes
//   • footer en bas (mt-auto via flex-1)
// =============================================================

import { SmoothScroll } from '@/components/premium/smooth-scroll';
import { AnimatedMeshGradient } from '@/components/premium/animated-mesh-gradient';
import PartnerLogosSlider from '@/components/PartnerLogosSlider';
import { Footer, Navbar, useLandingGoToAuth, type AuthViewMode, type GoToAuth } from './site-chrome';
import { HeroSection } from './hero-section';
import { DemoSection } from './demo-section';
import { ExploreSection } from './explore-section';
import { Testimonials } from './testimonials';
import { CtaFinal } from './cta-final';

export type { AuthViewMode };

export interface LandingPageProps {
  /** Ouvre l'espace auth (connexion ou inscription). Si absent, fallback route /?auth=…. */
  onGoToAuth?: GoToAuth;
}

// ==========================================
// MAIN PAGE — accueil
// ==========================================
export function LandingPage({ onGoToAuth }: LandingPageProps) {
  const routerGoToAuth = useLandingGoToAuth();
  const goToAuth: GoToAuth = onGoToAuth ?? routerGoToAuth;

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#F7F7F8] font-sans text-slate-900 antialiased [color-scheme:light] selection:bg-[#dceaf5]">
      {/* Scroll ultra-doux (Lenis) — une seule instance par page */}
      <SmoothScroll />
      {/* Mesh gradient signature — FIXED, une seule instance pour
          toute la page ; visible derrière les sections transparentes. */}
      <AnimatedMeshGradient />

      <Navbar />
      <main className="flex-1">
        <HeroSection onGoToAuth={goToAuth} />
        {/* v4.112 « BANDEAU DE CONFIANCE » — plateformes synchronisées :
            logos en défilement infini juste sous le hero (section
            PartnerLogosSlider, grayscale→couleur au survol). */}
        <section className="relative z-10">
          <p className="mb-6 text-center text-sm font-medium uppercase tracking-widest text-slate-500">
            Synchronisation native avec les plus grandes plateformes
          </p>
          <PartnerLogosSlider />
        </section>
        <DemoSection />
        {/* v5.18 SITE MULTIPAGES — cartes vers les 4 pages dédiées
            (fin du one-page : chaque onglet du menu a sa route). */}
        <ExploreSection />
        <Testimonials onGoToAuth={goToAuth} />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  );
}

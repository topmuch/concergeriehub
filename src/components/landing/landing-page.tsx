'use client';

// =============================================================
// LandingPage V6.1 — PREMIUM « AIRBNB PRO CLAIR » (direction
// client : Apple × Airbnb × Linear, conversion en 30 s).
//
// v4.61 — VERSION CLAIRE alignée sur le dashboard « AIRBNB PRO » :
//   • Accent unique bleu logo (#0066EF / gradient CTA
//     #0052C4→#0066EF→#0047B3) — le vert émeraude reste réservé à
//     la sémantique succès (temps réel, « Connecté », coches).
//   • Sections jadis sombres (tarifs, témoignages, footer) passées
//     en clair : surfaces #F7F7F8 / blanc, cartes .air-shadow.
//   • Page verrouillée claire (html.dark du ThemeProvider ignoré :
//     plus aucune variante dark:, color-scheme light sur la racine).
//   • Tous les textes, ancres et contrats (AuthViewMode,
//     LandingPageProps, onGoToAuth) inchangés.
//
// Orchestration des sections (chacune dans son fichier) :
//   Navbar → Hero (mesh + particules + téléphone 3D) → Démo
//   interactive (#demo) → Avant/Après → Bento grid (#features)
//   → Comment ça marche (#how-it-works) → Tarifs (#pricing)
//   → Témoignages → CTA final → Marchés + FAQ SEO (#zones)
//   → Footer (#contact).
//
// Fond signature : <AnimatedMeshGradient> est FIXE (une seule
// instance au niveau page) — il transparaît derrière les sections
// transparentes (hero, démo, bento, CTA final) et est masqué par
// les sections opaques (pricing, témoignages, footer).
//
// Contrat PRÉSERVÉ (landing-shell) :
//   • export AuthViewMode + LandingPageProps + LandingPage
//   • onGoToAuth('login' | 'register') sur tous les points
//     d'entrée connexion/inscription (navbar + tarifs + CTA final)
//   • ancres #demo / #features / #how-it-works / #pricing /
//     #contact intactes, footer en bas (mt-auto via flex-1)
// =============================================================

import { useEffect, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ClipboardCheck,
  Home,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { SmoothScroll } from '@/components/premium/smooth-scroll';
import { AnimatedMeshGradient } from '@/components/premium/animated-mesh-gradient';
import { Reveal } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';
import { InteractiveDemo } from './interactive-demo';
import { HeroSection } from './hero-section';
import PartnerLogosSlider from '@/components/PartnerLogosSlider';
import { BeforeAfter } from './before-after';
import { BentoGrid } from './modules-showcase';
import { HowItWorks } from './how-it-works';
import { PricingSection } from './pricing-section';
import { Testimonials } from './testimonials';
import { CtaFinal } from './cta-final';
import { MarketsSection } from './markets-section';
import { LanguageSwitcher } from './language-switcher';

export type AuthViewMode = 'login' | 'register';

export interface LandingPageProps {
  /** Ouvre l'espace auth (connexion ou inscription). Si absent, les CTA ne font rien. */
  onGoToAuth?: (mode: AuthViewMode) => void;
}

/** Défilement doux vers une ancre de la page. */
function smoothScrollTo(selector: string) {
  if (typeof document === 'undefined') return;
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// NAVBAR
// ==========================================
function Navbar({ onGoToAuth }: LandingPageProps) {
  const { t } = useLandingLang();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll(); // état correct si la page est déjà scrollée au montage
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: t('Fonctionnalités'), href: '#features' },
    { name: t('Comment ça marche'), href: '#how-it-works' },
    { name: t('Tarifs'), href: '#pricing' },
    { name: t('Contact'), href: '#contact' },
  ];

  const handleAnchor = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    smoothScrollTo(href);
  };

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'border-b border-slate-200/70 bg-white/85 shadow-sm backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a
            href="#hero"
            onClick={handleAnchor('#hero')}
            className="flex items-center gap-2.5"
            aria-label={t('RoomScan — retour en haut')}
          >
            {/* Logo officiel RoomScan (proportions d'origine, jamais déformé)
                v4.73 — agrandi à la demande du client */}
            <Image
              src="/brand/roomscan-logo.png"
              alt={t('RoomScan — retour en haut')}
              width={212}
              height={163}
              className="w-auto"
              style={{ height: 52 }}
              priority
            />
          </a>

          {/* Menu Desktop */}
          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={handleAnchor(link.href)}
                className="font-medium text-slate-600 transition-colors hover:text-[#0052C4]"
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Boutons Desktop (+ sélecteur de langue) */}
          <div className="hidden items-center gap-4 md:flex">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => onGoToAuth?.('login')}
              className="font-medium text-slate-700 transition-colors hover:text-[#0052C4]"
            >
              {t('Connexion')}
            </button>
            <button
              type="button"
              onClick={() => onGoToAuth?.('register')}
              className="air-gradient rounded-full px-5 py-2.5 font-semibold text-white shadow-[0_8px_24px_rgba(0,82,196,0.25)] transition-all hover:scale-[1.03] hover:shadow-[0_10px_28px_rgba(0,82,196,0.35)]"
            >
              {t('Essai gratuit')}
            </button>
          </div>

          {/* Menu Mobile */}
          <button
            type="button"
            className="p-1 text-slate-900 md:hidden"
            aria-label={
              isMobileMenuOpen ? t('Fermer le menu') : t('Ouvrir le menu')
            }
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Menu Mobile Dropdown (carte adaptée au thème) */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden md:hidden"
            >
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="py-2 font-medium text-slate-700 hover:text-[#0052C4]"
                    onClick={handleAnchor(link.href)}
                  >
                    {link.name}
                  </a>
                ))}
                <div className="border-t border-slate-200 pt-4">
                  {/* Sélecteur de langue (mobile) */}
                  <LanguageSwitcher mobile />
                </div>
                <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onGoToAuth?.('login');
                    }}
                    className="w-full rounded-xl border border-slate-200 py-3 font-medium text-slate-700"
                  >
                    {t('Connexion')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onGoToAuth?.('register');
                    }}
                    className="air-gradient w-full rounded-xl py-3 font-semibold text-white shadow-[0_8px_24px_rgba(0,82,196,0.25)]"
                  >
                    {t('Essai gratuit')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

// ==========================================
// DÉMO INTERACTIVE (ancre #demo — composant V5 préservé)
// ==========================================
function DemoSection() {
  const { t } = useLandingLang();
  return (
    <section id="demo" className="scroll-mt-24 px-4 py-24 sm:px-6">
      <Reveal>
        <div className="air-shadow-lg mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-6 md:p-10">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#0052C4]">
              {t('La magie en 1 scan')}
            </p>
            <h2 className="display-title font-serif! mb-3 text-3xl font-bold text-slate-900 md:text-4xl">
              {t('Voyez le Hub')}{' '}
              <span className="air-gradient-text font-serif italic">
                {t('en action')}
              </span>
            </h2>
            <p className="text-slate-600">
              {t(
                "Observez comment l'expérience bascule fluidement entre le mode Invité (commande de services) et le mode Hôte (dashboard de gestion), le tout sans installer d'application.",
              )}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500"
              />
              {t('Démo en cours de lecture…')}
            </div>
          </div>
          <InteractiveDemo />
        </div>
      </Reveal>
    </section>
  );
}

// ==========================================
// FOOTER (ancre #contact — contenu V5 préservé)
// ==========================================
function Footer() {
  const { t } = useLandingLang();
  return (
    <footer
      id="contact"
      className="mt-auto scroll-mt-24 border-t border-slate-200 bg-white px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-16 text-slate-600 sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Logo & Description */}
          <div className="md:col-span-1">
            <div className="mb-4 flex items-center gap-2.5">
              {/* v4.73 — logo footer agrandi */}
              <Image
                src="/brand/roomscan-logo.png"
                alt="RoomScan"
                width={212}
                height={163}
                className="w-auto"
                style={{ height: 56 }}
              />
            </div>
            <p className="text-sm leading-relaxed text-slate-500">
              {t(
                'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.',
              )}
            </p>
          </div>

          {/* Produit */}
          <nav aria-label={t('Produit')}>
            <h4 className="mb-4 font-bold text-slate-900">{t('Produit')}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="#features"
                  onClick={(e) => {
                    e.preventDefault();
                    smoothScrollTo('#features');
                  }}
                  className="transition-colors hover:text-[#0052C4]"
                >
                  {t('Fonctionnalités')}
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  onClick={(e) => {
                    e.preventDefault();
                    smoothScrollTo('#pricing');
                  }}
                  className="transition-colors hover:text-[#0052C4]"
                >
                  {t('Tarifs')}
                </a>
              </li>
              <li>
                <a href="#demo" className="transition-colors hover:text-[#0052C4]">
                  {t('Démo interactive')}
                </a>
              </li>
              <li>
                <a
                  href="#temoignages"
                  onClick={(e) => {
                    e.preventDefault();
                    smoothScrollTo('#temoignages');
                  }}
                  className="transition-colors hover:text-[#0052C4]"
                >
                  {t('Avantages fondateurs')}
                </a>
              </li>
            </ul>
          </nav>

          {/* Légal (pages réelles /legal) */}
          <nav aria-label={t('Légal')}>
            <h4 className="mb-4 font-bold text-slate-900">{t('Légal')}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/legal#mentions" className="transition-colors hover:text-[#0052C4]">
                  {t('Mentions légales')}
                </a>
              </li>
              <li>
                <a href="/legal#cgu" className="transition-colors hover:text-[#0052C4]">
                  {t('CGU')}
                </a>
              </li>
              <li>
                <a href="/legal#confidentialite" className="transition-colors hover:text-[#0052C4]">
                  {t('Confidentialité')}
                </a>
              </li>
              <li>
                <span className="text-slate-500">Paris, France</span>
              </li>
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h4 className="mb-4 font-bold text-slate-900">{t('Contact')}</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:contact@roomscan.pro"
                  className="transition-colors hover:text-[#0052C4]"
                >
                  contact@roomscan.pro
                </a>
              </li>
              <li>
                <span className="text-slate-500">{t('Réponse sous 24 h, 7j/7')}</span>
              </li>
            </ul>
          </div>

          {/* Vos espaces (Task 30) — les 3 dashboards, chacun aux
              couleurs de SA porte de connexion (Étape 1 V4) : un
              visiteur déconnecté est reçu par la garde du dashboard
              et redirigé vers la page de connexion de son espace. */}
          <nav aria-label={t('Vos espaces')}>
            <h4 className="mb-4 font-bold text-slate-900">{t('Vos espaces')}</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="/airbnb/dashboard"
                  className="flex items-center gap-2.5 transition-colors hover:text-[#c81e42]"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#c81e42] to-[#8f1230] text-white shadow-[0_6px_16px_-6px_rgba(200,30,66,0.7)]"
                  >
                    <Home className="h-3.5 w-3.5" />
                  </span>
                  {t('Espace Hôte')}
                </a>
              </li>
              <li>
                <a
                  href="/inspection/dashboard"
                  className="flex items-center gap-2.5 transition-colors hover:text-[#C21F26]"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#C21F26] text-white shadow-[0_6px_16px_-6px_rgba(194,31,38,0.6)]"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                  </span>
                  {t('États des Lieux')}
                </a>
              </li>
              <li>
                <a
                  href="/admin/dashboard"
                  className="flex items-center gap-2.5 transition-colors hover:text-[#8a6d1f]"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e9c47c] text-[#1a1206] shadow-[0_6px_16px_-6px_rgba(233,196,124,0.6)]"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </span>
                  {t('Console Superadmin')}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 md:flex-row">
          <p className="text-sm text-slate-500">
            {t('© {year} RoomScan. Tous droits réservés.', {
              year: new Date().getFullYear(),
            })}
          </p>
          <div className="flex gap-6 text-sm">
            <a href="/legal#mentions" className="transition-colors hover:text-[#0052C4]">
              {t('Mentions légales')}
            </a>
            <a href="/legal#cgu" className="transition-colors hover:text-[#0052C4]">
              {t('CGU')}
            </a>
            <a href="/legal#confidentialite" className="transition-colors hover:text-[#0052C4]">
              {t('Confidentialité')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ==========================================
// MAIN PAGE
// ==========================================
export function LandingPage({ onGoToAuth }: LandingPageProps) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#F7F7F8] font-sans text-slate-900 antialiased [color-scheme:light] selection:bg-blue-100">
      {/* Scroll ultra-doux (Lenis) — une seule instance par page */}
      <SmoothScroll />
      {/* Mesh gradient signature — FIXED, une seule instance pour
          toute la page ; visible derrière les sections transparentes. */}
      <AnimatedMeshGradient />

      <Navbar onGoToAuth={onGoToAuth} />
      <main className="flex-1">
        <HeroSection onGoToAuth={onGoToAuth} />
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
        <BeforeAfter />
        <BentoGrid />
        <HowItWorks />
        <PricingSection onGoToAuth={onGoToAuth} />
        <Testimonials onGoToAuth={onGoToAuth} />
        <CtaFinal onGoToAuth={onGoToAuth} />
        {/* SEO v4.77 — 3 marchés (Afrique/Europe/Canada) + FAQ visible
            (même source que le JSON-LD FAQPage de app/page.tsx). */}
        <MarketsSection />
      </main>
      <Footer />
    </div>
  );
}

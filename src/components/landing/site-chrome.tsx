'use client';

// =============================================================
// SITE CHROME (v5.18 — SITE MULTIPAGES) — socle commun à toutes
// les pages marketing désormais ROUTES DÉDIÉES (fin du one-page) :
//
//   / · /fonctionnalites · /comment-ca-marche · /etats-des-lieux
//   · /tarifs · /contact
//
//   • SiteChrome : coquille complète (provider i18n 8 langues +
//     SmoothScroll + mesh gradient signature + Navbar + main +
//     Footer) — chaque page l'englobe.
//   • Navbar : liens vers les ROUTES (Next <Link>, fini les
//     ancres), lien actif surligné (usePathname), boutons
//     Connexion/Commencer → /?auth=login|register (la page
//     d'accueil ouvre l'espace auth via le paramètre d'URL).
//   • Footer : mêmes colonnes, liens mis à jour vers les pages.
//   • PageHero : en-tête commun des sous-pages (h1 SEO + eyebrow).
//
// L'ancien comportement SPA (ancre + scroll doux) disparaît :
// chaque onglet du menu mène à sa propre page (demande client).
// =============================================================

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  ClipboardCheck,
  Home,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { SmoothScroll } from '@/components/premium/smooth-scroll';
import { AnimatedMeshGradient } from '@/components/premium/animated-mesh-gradient';
import { LandingLangProvider, dirFor, useLandingLang } from '@/lib/landing-i18n';
import { LanguageSwitcher } from './language-switcher';

export type AuthViewMode = 'login' | 'register';
export type GoToAuth = (mode: AuthViewMode) => void;

/** Navigation unifiée vers l'espace auth : ?auth=login|register sur
 *  la page d'accueil (LandingShell ouvre la vue auth d'après
 *  l'URL). Fonctionne depuis n'importe quelle page du site. */
export function useLandingGoToAuth(): GoToAuth {
  const router = useRouter();
  return useCallback(
    (mode: AuthViewMode) => {
      router.push(`/?auth=${mode}`);
    },
    [router],
  );
}

/** Onglets du menu — ROUTES réelles (site multipages v5.18). */
export const LANDING_NAV_LINKS = [
  { name: 'Fonctionnalités', href: '/fonctionnalites' },
  { name: 'Comment ça marche', href: '/comment-ca-marche' },
  { name: 'États des Lieux', href: '/etats-des-lieux' },
  { name: 'Tarifs', href: '/tarifs' },
  { name: 'Contact', href: '/contact' },
] as const;

// ==========================================
// NAVBAR (commune à toutes les pages)
// ==========================================
export function Navbar() {
  const { t } = useLandingLang();
  const pathname = usePathname();
  const goToAuth = useLandingGoToAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll(); // état correct si la page est déjà scrollée au montage
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // v5.18 : plus d'effet « fermer au changement de route » — le menu
  // se ferme dans le onClick de chaque lien (set-state-in-effect).

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
          {/* Logo → accueil */}
          <Link
            href="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-2.5"
            aria-label={t('RoomScan — retour en haut')}
          >
            <BrandLogo height={54} />
          </Link>

          {/* Menu Desktop — liens vers les pages dédiées */}
          <div className="hidden items-center gap-7 md:flex">
            {LANDING_NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`transition-colors ${
                    active
                      ? 'font-semibold text-[#04467a]'
                      : 'font-medium text-slate-600 hover:text-[#04467a]'
                  }`}
                >
                  {t(link.name)}
                </Link>
              );
            })}
          </div>

          {/* Boutons Desktop (+ sélecteur de langue) */}
          <div className="hidden items-center gap-4 md:flex">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => goToAuth('login')}
              className="font-medium text-slate-700 transition-colors hover:text-[#04467a]"
            >
              {t('Connexion')}
            </button>
            <button
              type="button"
              onClick={() => goToAuth('register')}
              className="air-gradient rounded-full px-5 py-2.5 font-semibold text-white shadow-[0_8px_24px_rgba(4, 70, 122,0.25)] transition-all hover:scale-[1.03] hover:shadow-[0_10px_28px_rgba(4, 70, 122,0.35)]"
            >
              {t('Commencer')}
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

        {/* Menu Mobile Dropdown */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden md:hidden"
            >
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                {LANDING_NAV_LINKS.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`py-2 ${
                        active
                          ? 'font-semibold text-[#04467a]'
                          : 'font-medium text-slate-700 hover:text-[#04467a]'
                      }`}
                    >
                      {t(link.name)}
                    </Link>
                  );
                })}
                <div className="border-t border-slate-200 pt-4">
                  <LanguageSwitcher mobile />
                </div>
                <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      goToAuth('login');
                    }}
                    className="w-full rounded-xl border border-slate-200 py-3 font-medium text-slate-700"
                  >
                    {t('Connexion')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      goToAuth('register');
                    }}
                    className="air-gradient w-full rounded-xl py-3 font-semibold text-white shadow-[0_8px_24px_rgba(4, 70, 122,0.25)]"
                  >
                    {t('Commencer')}
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
// PAGE HERO — en-tête commun des sous-pages
// ==========================================
export function PageHero({
  eyebrow,
  title,
  highlight,
  description,
}: {
  /** Petit libellé uppercase au-dessus du titre. */
  eyebrow: string;
  /** Titre principal (h1 SEO de la page). */
  title: string;
  /** Fin du titre en italique dégradé (optionnel). */
  highlight?: string;
  /** Paragraphe d'introduction. */
  description?: string;
}) {
  const { t } = useLandingLang();
  return (
    <section className="relative overflow-hidden pb-8 pt-36 sm:pt-40">
      <div
        aria-hidden="true"
        className="absolute -top-24 left-1/2 h-[360px] w-[680px] max-w-none -translate-x-1/2 rounded-full bg-[#055492]/[0.08] blur-[120px]"
      />
      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#04467a]">
          {t(eyebrow)}
        </p>
        <h1 className="display-title font-serif! mb-5 text-4xl font-bold text-slate-900 sm:text-5xl">
          {t(title)}
          {highlight ? (
            <>
              {' '}
              <span className="air-gradient-text font-serif italic">
                {t(highlight)}
              </span>
            </>
          ) : null}
        </h1>
        {description ? (
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600">
            {t(description)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ==========================================
// FOOTER (commun — liens mis à jour vers les pages)
// ==========================================
export function Footer() {
  const { t } = useLandingLang();
  return (
    <footer
      id="footer"
      className="mt-auto scroll-mt-24 border-t border-slate-200 bg-white px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-16 text-slate-600 sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Logo & Description */}
          <div className="md:col-span-1">
            <div className="mb-4 flex items-center gap-2.5">
              <BrandLogo height={68} />
            </div>
            <p className="text-sm leading-relaxed text-slate-500">
              {t(
                'La plateforme tout-en-un pour les hôtes Airbnb et conciergeries professionnelles.',
              )}
            </p>
          </div>

          {/* Produit — pages dédiées */}
          <nav aria-label={t('Produit')}>
            <h4 className="mb-4 font-bold text-slate-900">{t('Produit')}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/fonctionnalites"
                  className="transition-colors hover:text-[#04467a]"
                >
                  {t('Fonctionnalités')}
                </Link>
              </li>
              <li>
                <Link
                  href="/comment-ca-marche"
                  className="transition-colors hover:text-[#04467a]"
                >
                  {t('Comment ça marche')}
                </Link>
              </li>
              <li>
                <Link
                  href="/etats-des-lieux"
                  className="transition-colors hover:text-[#04467a]"
                >
                  {t('États des Lieux')}
                </Link>
              </li>
              <li>
                <Link href="/tarifs" className="transition-colors hover:text-[#04467a]">
                  {t('Tarifs')}
                </Link>
              </li>
              <li>
                <Link href="/#demo" className="transition-colors hover:text-[#04467a]">
                  {t('Démo interactive')}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Légal (page réelle /legal) */}
          <nav aria-label={t('Légal')}>
            <h4 className="mb-4 font-bold text-slate-900">{t('Légal')}</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/legal#mentions" className="transition-colors hover:text-[#04467a]">
                  {t('Mentions légales')}
                </Link>
              </li>
              <li>
                <Link href="/legal#cgu" className="transition-colors hover:text-[#04467a]">
                  {t('CGU')}
                </Link>
              </li>
              <li>
                <Link
                  href="/legal#confidentialite"
                  className="transition-colors hover:text-[#04467a]"
                >
                  {t('Confidentialité')}
                </Link>
              </li>
              <li>
                <span className="text-slate-500">Paris, France</span>
              </li>
            </ul>
          </nav>

          {/* Contact — page dédiée avec formulaire + carte */}
          <div>
            <h4 className="mb-4 font-bold text-slate-900">{t('Contact')}</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/contact" className="transition-colors hover:text-[#04467a]">
                  {t('Formulaire de contact')}
                </Link>
              </li>
              <li>
                <a
                  href="mailto:contact@roomscan.pro"
                  className="transition-colors hover:text-[#04467a]"
                >
                  contact@roomscan.pro
                </a>
              </li>
              <li>
                <span className="text-slate-500">{t('Réponse sous 24 h, 7j/7')}</span>
              </li>
            </ul>
          </div>

          {/* Vos espaces — les 3 dashboards */}
          <nav aria-label={t('Vos espaces')}>
            <h4 className="mb-4 font-bold text-slate-900">{t('Vos espaces')}</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
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
                </Link>
              </li>
              <li>
                <Link
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
                </Link>
              </li>
              <li>
                <Link
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
                </Link>
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
            <Link href="/legal#mentions" className="transition-colors hover:text-[#04467a]">
              {t('Mentions légales')}
            </Link>
            <Link href="/legal#cgu" className="transition-colors hover:text-[#04467a]">
              {t('CGU')}
            </Link>
            <Link
              href="/legal#confidentialite"
              className="transition-colors hover:text-[#04467a]"
            >
              {t('Confidentialité')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ==========================================
// SITE CHROME — coquille commune des pages marketing
// ==========================================
function SiteChromeInner({ children }: { children: ReactNode }) {
  const { lang } = useLandingLang();
  return (
    // Mêmes classes racine que LandingPage (cohérence visuelle).
    <div
      dir={dirFor(lang)}
      lang={lang}
      className="flex min-h-screen flex-col overflow-x-clip bg-[#F7F7F8] font-sans text-slate-900 antialiased [color-scheme:light] selection:bg-[#dceaf5]"
    >
      <SmoothScroll />
      {/* Mesh gradient signature — FIXED, une seule instance par page. */}
      <AnimatedMeshGradient />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <LandingLangProvider>
      <SiteChromeInner>{children}</SiteChromeInner>
    </LandingLangProvider>
  );
}

'use client';

// =============================================================
// LandingPage V5 — design « immersif » (navbar + hero sombre)
//
// Navbar fixe (état scrollé + menu mobile) → Hero sombre (gradient
// bleu→émeraude, particules flottantes, stats) → Démo interactive
// (ÉTAPE 1) → Features (6 cartes gradient) → Comment ça marche
// (timeline 01→03) → Tarifs (section sombre, Solo / Pro) → Footer
// complet (bloc contact = ancre #contact).
//
// Adaptations techniques par rapport au code source fourni :
//  - particules DÉTERMINISTES (Math.random en rendu = mismatch SSR)
//  - emojis vides comblés (👥 équipe, 📊 analytics, 📦 plaque)
//  - CTAs branchés : auth (onGoToAuth) + défilement doux des ancres
//  - menu mobile : carte blanche (lisibilité sur le hero sombre)
//  - a11y : aria-label burger + réseaux sociaux, scroll-mt des ancres
//  - imports inutilisés retirés (Star, Shield, BarChart3, Globe)
// =============================================================

import { useEffect, useState, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  X,
  CheckCircle2,
  ArrowRight,
  Zap,
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Instagram,
  ChevronRight,
  Play,
} from 'lucide-react';
import { InteractiveDemo } from './interactive-demo';

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

// Particules DÉTERMINISTES : Math.random() pendant le rendu produirait
// un mismatch d'hydratation (valeurs serveur ≠ client). Trame fixe
// arithmétique — visuellement équivalente, sans flash au montage.
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  left: (i * 37 + 13) % 100,
  top: (i * 53 + 7) % 100,
  duration: 5 + ((i * 7) % 6),
  delay: (i * 11) % 5,
}));

// ==========================================
// NAVBAR
// ==========================================
function Navbar({ onGoToAuth }: LandingPageProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll(); // état correct si la page est déjà scrollée au montage
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Fonctionnalités', href: '#features' },
    { name: 'Comment ça marche', href: '#how-it-works' },
    { name: 'Tarifs', href: '#pricing' },
    { name: 'Contact', href: '#contact' },
  ];

  const handleAnchor = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    smoothScrollTo(href);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/95 shadow-lg backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-emerald-600 shadow-lg">
              <span className="text-lg font-bold text-white">CH</span>
            </div>
            <span
              className={`text-xl font-bold ${
                isScrolled ? 'text-slate-900' : 'text-white'
              }`}
            >
              Conciergerie Hub
            </span>
          </div>

          {/* Menu Desktop */}
          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={handleAnchor(link.href)}
                className={`font-medium transition-colors hover:text-blue-600 ${
                  isScrolled ? 'text-slate-700' : 'text-white'
                }`}
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Boutons Desktop */}
          <div className="hidden items-center gap-4 md:flex">
            <button
              type="button"
              onClick={() => onGoToAuth?.('login')}
              className={`font-medium transition-colors ${
                isScrolled
                  ? 'text-slate-700 hover:text-blue-600'
                  : 'text-white hover:text-blue-200'
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => onGoToAuth?.('register')}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-6 py-2.5 font-semibold text-white transition-all hover:scale-105 hover:shadow-lg"
            >
              Essai gratuit
            </button>
          </div>

          {/* Menu Mobile */}
          <button
            type="button"
            className="md:hidden"
            aria-label={
              isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'
            }
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className={isScrolled ? 'text-slate-900' : 'text-white'} />
            ) : (
              <Menu className={isScrolled ? 'text-slate-900' : 'text-white'} />
            )}
          </button>
        </div>

        {/* Menu Mobile Dropdown (carte blanche : lisible sur le hero sombre) */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden md:hidden"
            >
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="py-2 font-medium text-slate-700"
                    onClick={handleAnchor(link.href)}
                  >
                    {link.name}
                  </a>
                ))}
                <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onGoToAuth?.('login');
                    }}
                    className="w-full rounded-xl border border-slate-200 py-3 font-medium text-slate-700"
                  >
                    Connexion
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onGoToAuth?.('register');
                    }}
                    className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 py-3 font-semibold text-white"
                  >
                    Essai gratuit
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
// HERO SECTION
// ==========================================
function HeroSection({ onGoToAuth }: LandingPageProps) {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-emerald-900">
      {/* Particules animées en arrière-plan */}
      <div className="absolute inset-0 overflow-hidden">
        {PARTICLES.map((p, i) => (
          <motion.div
            key={i}
            className="absolute h-2 w-2 rounded-full bg-white/20"
            style={{ left: `${p.left}%`, top: `${p.top}%` }}
            animate={{
              y: [0, -100, 0],
              opacity: [0, 0.5, 0],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              delay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Gradient orbs */}
      <div className="absolute top-20 left-10 h-96 w-96 rounded-full bg-blue-500/30 blur-[120px]" />
      <div className="absolute bottom-20 right-10 h-96 w-96 rounded-full bg-emerald-500/30 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
            <Zap className="h-4 w-4 text-yellow-400" />
            Nouveau : Mode White-Label disponible
          </div>

          <h1 className="mb-6 text-5xl font-extrabold leading-tight text-white md:text-7xl">
            Transformez chaque séjour en
            <span className="block bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              expérience 5 étoiles
            </span>
          </h1>

          <p className="mx-auto mb-12 max-w-3xl text-xl leading-relaxed text-slate-300 md:text-2xl">
            Une seule plaque QR élégante. Vos invités accèdent au Wi-Fi et aux
            services en 1 scan. Vous pilotez tout depuis un dashboard
            professionnel.
          </p>

          <div className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={() => onGoToAuth?.('register')}
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-8 py-4 font-bold text-white transition-all hover:scale-105 hover:shadow-2xl"
            >
              Commencer l&apos;essai gratuit
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              onClick={() => smoothScrollTo('#demo')}
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-bold text-white backdrop-blur-md transition-all hover:bg-white/20"
            >
              <Play className="h-5 w-5" />
              Voir la démo
            </button>
          </div>

          {/* Stats */}
          <div className="mx-auto grid max-w-2xl grid-cols-3 gap-8">
            {[
              { value: '500+', label: 'Hôtes actifs' },
              { value: '98%', label: 'Satisfaction' },
              { value: '2min', label: 'Setup moyen' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="text-center"
              >
                <div className="mb-1 text-3xl font-bold text-white md:text-4xl">
                  {stat.value}
                </div>
                <div className="text-sm text-slate-400">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <ChevronRight className="h-6 w-6 rotate-90 text-white/50" />
      </motion.div>
    </section>
  );
}

// ==========================================
// DÉMO INTERACTIVE (ÉTAPE 1 — préservée)
// ==========================================
function DemoSection() {
  return (
    <section id="demo" className="scroll-mt-24 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl md:p-10">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h3 className="text-2xl font-bold text-slate-900">
            📱 La magie en 1 scan
          </h3>
          <p className="mt-2 text-slate-600">
            Observez comment l&apos;expérience bascule fluidement entre le mode
            Invité (commande de services) et le mode Hôte (dashboard de
            gestion), le tout sans installer d&apos;application.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500"
            />
            Démo en cours de lecture…
          </div>
        </div>
        <InteractiveDemo />
      </div>
    </section>
  );
}

// ==========================================
// FEATURES SECTION
// ==========================================
function FeaturesSection() {
  const features = [
    {
      icon: '📱',
      title: 'Hub QR Intelligent',
      description:
        'Une plaque élégante qui donne accès à tout : Wi-Fi, guidebook, services, réclamations.',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: '💰',
      title: 'Upselling Automatisé',
      description:
        'Vendez des petits-déjeuners, transferts, late check-out. Revenus passifs garantis.',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      icon: '🛡️',
      title: 'Anti-Mauvais Avis',
      description:
        "Formulaire de réclamation privé. Résolvez les problèmes avant l'avis public.",
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: '👥',
      title: "Gestion d'Équipe",
      description:
        'Invitez votre équipe (ménage, maintenance) avec des rôles et permissions.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: '📊',
      title: 'Analytics Avancés',
      description:
        "Suivez l'occupation, les revenus, l'engagement des guests en temps réel.",
      color: 'from-indigo-500 to-blue-500',
    },
    {
      icon: '🌍',
      title: 'White-Label',
      description:
        'Votre logo, vos couleurs, votre domaine. Vos guests ne voient que votre marque.',
      color: 'from-rose-500 to-red-500',
    },
  ];

  return (
    <section id="features" className="scroll-mt-24 bg-slate-50 px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-4xl font-bold text-slate-900 md:text-5xl">
            Tout ce dont vous avez besoin
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-slate-600">
            Une plateforme complète pour gérer vos locations courte durée
            comme un pro.
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className="group rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-xl"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -8 }}
            >
              <div
                className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-3xl shadow-lg transition-transform group-hover:scale-110 ${feature.color}`}
              >
                {feature.icon}
              </div>
              <h3 className="mb-3 text-2xl font-bold text-slate-900">
                {feature.title}
              </h3>
              <p className="leading-relaxed text-slate-600">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// HOW IT WORKS
// ==========================================
function HowItWorksSection() {
  const steps = [
    {
      number: '01',
      icon: '📦',
      title: 'Recevez votre Plaque',
      description: 'Design premium, prête à poser. Livraison en 48h.',
    },
    {
      number: '02',
      icon: '📱',
      title: 'Scannez pour configurer',
      description: 'Wizard simple : Wi-Fi, règles, PIN. 2 minutes chrono.',
    },
    {
      number: '03',
      icon: '🚀',
      title: 'Vos guests sont autonomes',
      description:
        "Ils scannent, commandent, s'informent. Vous pilotez à distance.",
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-24 bg-white px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-4xl font-bold text-slate-900 md:text-5xl">
            Opérationnel en 3 minutes
          </h2>
          <p className="text-xl text-slate-600">
            De la réception à l&apos;utilisation, c&apos;est simple comme
            bonjour.
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
            >
              <div className="h-full rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-8">
                <div className="mb-4 text-6xl font-bold text-slate-200">
                  {step.number}
                </div>
                <div className="mb-6 text-5xl">{step.icon}</div>
                <h3 className="mb-3 text-2xl font-bold text-slate-900">
                  {step.title}
                </h3>
                <p className="leading-relaxed text-slate-600">
                  {step.description}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div className="absolute top-1/2 -right-4 hidden -translate-y-1/2 md:block">
                  <ArrowRight className="h-8 w-8 text-slate-300" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// PRICING SECTION
// ==========================================
function PricingSection({ onGoToAuth }: LandingPageProps) {
  const plans = [
    {
      name: 'Solo',
      price: '9,90',
      period: '/mois',
      description: 'Pour les hôtes avec 1 seul logement',
      features: [
        '1 Plaque QR Hub',
        'Guidebook & Wi-Fi illimités',
        'Module Upselling de base',
        'Support par email',
        'Analytics basiques',
      ],
      cta: "Commencer l'essai",
      popular: false,
    },
    {
      name: 'Pro',
      price: '199',
      period: '/an',
      description: 'Pour les conciergeries et multi-hôtes',
      features: [
        "Jusqu'à 3 logements inclus",
        'Équipe multi-rôles (Ménage, etc.)',
        'White-Label complet',
        'Analytics avancés',
        'Support prioritaire 24/7',
        'API & Webhooks',
      ],
      cta: 'Passer à Pro',
      popular: true,
    },
  ];

  return (
    <section
      id="pricing"
      className="relative scroll-mt-24 overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-emerald-900 px-6 py-24"
    >
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <motion.div
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="mb-4 text-4xl font-bold text-white md:text-5xl">
            Des tarifs simples, sans surprise
          </h2>
          <p className="text-xl text-slate-300">
            Choisissez l&apos;offre adaptée à votre activité.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
          {plans.map((plan, i) => (
            <motion.div
              key={i}
              className={`rounded-2xl p-8 ${
                plan.popular
                  ? 'bg-white shadow-2xl'
                  : 'border border-white/20 bg-white/10 backdrop-blur-md'
              }`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              whileHover={{ y: -8 }}
              // Équivalent du scale-105 d'origine : framer-motion écrit
              // transform inline et écraserait la classe Tailwind.
              style={plan.popular ? { scale: 1.03 } : undefined}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-emerald-600 px-6 py-2 text-sm font-bold text-white shadow-lg">
                  LE PLUS POPULAIRE
                </div>
              )}
              <div className="mb-4 text-4xl">{plan.popular ? '🏢' : '🏠'}</div>
              <h3
                className={`mb-2 text-2xl font-bold ${
                  plan.popular ? 'text-slate-900' : 'text-white'
                }`}
              >
                {plan.name}
              </h3>
              <p
                className={`mb-6 text-sm ${
                  plan.popular ? 'text-slate-600' : 'text-slate-300'
                }`}
              >
                {plan.description}
              </p>
              <div className="mb-8">
                <span
                  className={`text-5xl font-extrabold ${
                    plan.popular ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {plan.price} €
                </span>
                <span
                  className={`text-lg ${
                    plan.popular ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  {plan.period}
                </span>
              </div>
              <ul className="mb-8 space-y-3">
                {plan.features.map((feature, j) => (
                  <li
                    key={j}
                    className={`flex items-center gap-3 ${
                      plan.popular ? 'text-slate-700' : 'text-slate-200'
                    }`}
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onGoToAuth?.('register')}
                className={`w-full rounded-xl py-4 font-bold transition-all ${
                  plan.popular
                    ? 'bg-gradient-to-r from-blue-600 to-emerald-600 text-white hover:shadow-xl'
                    : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>

        <p className="mt-12 text-center text-slate-400">
          Au-delà de 3 logements,{' '}
          <a
            href="#contact"
            className="font-medium text-white underline"
            onClick={(e) => {
              e.preventDefault();
              smoothScrollTo('#contact');
            }}
          >
            contactez-nous
          </a>{' '}
          pour un devis sur mesure.
        </p>
      </div>
    </section>
  );
}

// ==========================================
// FOOTER
// ==========================================
function Footer() {
  return (
    <footer
      id="contact"
      className="scroll-mt-24 bg-slate-900 px-6 pt-16 pb-[max(4rem,env(safe-area-inset-bottom))] text-slate-300"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-12 md:grid-cols-4">
          {/* Logo & Description */}
          <div className="md:col-span-1">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-emerald-600">
                <span className="text-lg font-bold text-white">CH</span>
              </div>
              <span className="text-xl font-bold text-white">
                Conciergerie Hub
              </span>
            </div>
            <p className="text-sm leading-relaxed">
              La plateforme tout-en-un pour les hôtes Airbnb et conciergeries
              professionnelles.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="mb-4 font-bold text-white">Produit</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#features" className="transition-colors hover:text-white">
                  Fonctionnalités
                </a>
              </li>
              <li>
                <a href="#pricing" className="transition-colors hover:text-white">
                  Tarifs
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-white">
                  Intégrations
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-white">
                  Changelog
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-bold text-white">Entreprise</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="transition-colors hover:text-white">
                  À propos
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-white">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-white">
                  Carrières
                </a>
              </li>
              <li>
                <a
                  href="#contact"
                  onClick={(e) => {
                    e.preventDefault();
                    smoothScrollTo('#contact');
                  }}
                  className="transition-colors hover:text-white"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="mb-4 font-bold text-white">Contact</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                contact@conciergeriehub.com
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                +33 1 23 45 67 89
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Paris, France
              </li>
            </ul>
            <div className="mt-6 flex gap-4">
              <a
                href="#"
                aria-label="Facebook"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 transition-colors hover:bg-slate-700"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 transition-colors hover:bg-slate-700"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 transition-colors hover:bg-slate-700"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 md:flex-row">
          <p className="text-sm">© 2025 Conciergerie Hub. Tous droits réservés.</p>
          <div className="flex gap-6 text-sm">
            <a href="#" className="transition-colors hover:text-white">
              Mentions légales
            </a>
            <a href="#" className="transition-colors hover:text-white">
              CGU
            </a>
            <a href="#" className="transition-colors hover:text-white">
              Confidentialité
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
    <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50 font-sans text-slate-900 selection:bg-emerald-100">
      <Navbar onGoToAuth={onGoToAuth} />
      <main className="flex-1">
        <HeroSection onGoToAuth={onGoToAuth} />
        <DemoSection />
        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection onGoToAuth={onGoToAuth} />
      </main>
      <Footer />
    </div>
  );
}

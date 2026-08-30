'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  QrCode, Menu, X, ArrowRight, Sparkles, Shield, Zap, Smartphone,
} from 'lucide-react';
import { InteractiveDemo } from './interactive-demo';
import { HowItWorks } from './how-it-works';
import { PricingSection } from './pricing-section';
import { ModulesShowcase } from './modules-showcase';

interface LandingPageProps { onGoToDashboard: () => void; onGoToSetup?: () => void; onGoToHub?: () => void }

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Navbar({ onGoToDashboard, onGoToSetup, onGoToHub }: { onGoToDashboard: () => void; onGoToSetup?: () => void; onGoToHub?: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Accueil', href: '#hero' },
    { label: 'Fonctionnalités', href: '#avantages' },
    { label: 'Tarifs', href: '#pricing' },
    { label: 'Contact', href: '#cta-final' },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileOpen(false);
    const target = document.querySelector(href);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
      scrolled
        ? 'bg-slate-950/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-lg shadow-black/20'
        : 'bg-transparent'
    }`}>
      <div className="max-w-[1600px] mx-auto px-4 md:px-8 flex items-center justify-between h-16">
        <a href="#hero" onClick={(e) => handleNavClick(e, '#hero')} className="flex items-center gap-2.5 group">
          <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-10 w-auto object-contain rounded-lg" />
        </a>
        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={(e) => handleNavClick(e, link.href)} className="text-sm text-white/60 hover:text-white transition-colors">
              {link.label}
            </a>
          ))}
          <button
            onClick={onGoToDashboard}
            className="ml-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-600/20 hover:shadow-violet-600/40 hover:scale-[1.02] cursor-pointer"
          >
            Se connecter
          </button>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-white/70 hover:text-white transition-colors" aria-label="Menu">
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      <div className={`md:hidden overflow-hidden transition-all duration-300 ${mobileOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 pb-4 space-y-1 bg-slate-950/95 backdrop-blur-2xl border-t border-white/[0.06]">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={(e) => handleNavClick(e, link.href)} className="block py-3 px-3 text-white/60 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
              {link.label}
            </a>
          ))}
          <button onClick={() => { setMobileOpen(false); onGoToDashboard(); }} className="w-full mt-2 px-5 py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-all">
            Se connecter
          </button>
        </div>
      </div>
    </nav>
  );
}

function HeroSection({ onGoToDashboard, onGoToSetup, onGoToHub }: { onGoToDashboard: () => void; onGoToSetup?: () => void; onGoToHub?: () => void }) {
  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, { once: true });

  return (
    <section
      id="hero"
      ref={heroRef}
      className="relative min-h-screen flex items-center overflow-hidden scroll-mt-16"
      style={{
        background: 'linear-gradient(135deg, #020617 0%, #1e1042 40%, #0f172a 70%, #020617 100%)',
      }}
    >
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] bg-violet-600/[0.07] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-[400px] h-[400px] bg-emerald-500/[0.05] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-purple-500/[0.04] rounded-full blur-[150px] pointer-events-none" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 w-full pt-24 pb-16 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

          {/* Left: Text content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={heroInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="max-w-xl"
          >
            {/* Badge */}
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-300 rounded-full px-4 py-1.5 text-sm font-medium mb-8"
            >
              <Sparkles className="w-4 h-4" />
              Nouveau : Configuration en 1 scan
            </motion.span>

            {/* H1 */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-4xl sm:text-5xl md:text-[3.4rem] font-extrabold leading-[1.1] mb-6 text-white"
            >
              Transformez n&apos;importe quelle maison en{' '}
              <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
                maison connectée
              </span>
              {' '}
              <span className="text-white/40 text-3xl sm:text-4xl md:text-5xl font-medium">Sans application.</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-lg md:text-xl text-white/50 mb-8 leading-relaxed"
            >
              Une seule plaque élégante. Un scan pour les invités, un code PIN pour la famille.
              <span className="text-white/80 font-medium"> À partir de 49 €/an.</span>
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 mb-10"
            >
              <button
                onClick={onGoToDashboard}
                className="group relative flex items-center justify-center gap-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold px-8 py-4 rounded-xl transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_50px_rgba(139,92,246,0.5)] hover:scale-[1.02] cursor-pointer"
              >
                Choisir mon offre
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 opacity-0 group-hover:opacity-100 blur-xl transition-opacity -z-10" />
              </button>
              <a
                href="#pricing"
                onClick={(e) => { e.preventDefault(); document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' }); }}
                className="flex items-center justify-center gap-2 bg-white/[0.05] border border-white/[0.1] text-white/80 hover:text-white font-medium px-8 py-4 rounded-xl transition-all hover:bg-white/[0.1] hover:border-white/[0.2] hover:scale-[1.02]"
              >
                Voir les tarifs
              </a>
            </motion.div>

            {/* Demo preview buttons */}
            {(onGoToSetup || onGoToHub) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={heroInView ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.6, delay: 0.65 }}
                className="flex flex-wrap gap-3 mb-10"
              >
                {onGoToSetup && (
                  <button
                    onClick={onGoToSetup}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-sm font-medium hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    Voir l&apos;onboarding
                    <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded-full ml-1">LIVE</span>
                  </button>
                )}
                {onGoToHub && (
                  <button
                    onClick={onGoToHub}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/25 text-fuchsia-300 text-sm font-medium hover:bg-fuchsia-500/20 hover:border-fuchsia-500/40 transition-all cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                    Voir le hub QR
                    <span className="text-[10px] bg-fuchsia-500/20 px-1.5 py-0.5 rounded-full ml-1">LIVE</span>
                  </button>
                )}
              </motion.div>
            )}

            {/* Trust signals */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={heroInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="flex flex-wrap items-center gap-6 text-white/30 text-sm"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500/60" />
                <span>RGPD conforme</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500/60" />
                <span>Zéro app requise</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500/60 font-bold">2 500+</span>
                <span>foyers</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Right: Interactive Demo */}
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={heroInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 60 }}
            transition={{ duration: 0.9, delay: 0.3, ease: 'easeOut' }}
            className="flex justify-center lg:justify-end"
          >
            <InteractiveDemo />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function CtaFinal({ onGoToDashboard, onGoToSetup, onGoToHub }: { onGoToDashboard: () => void; onGoToSetup?: () => void; onGoToHub?: () => void }) {
  return (
    <section id="cta-final" className="relative py-24 md:py-32 px-4 md:px-8 scroll-mt-16 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1e1042 0%, #2e1065 50%, #1e1042 100%)' }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[120px] pointer-events-none" />
      <FadeIn>
        <div className="max-w-[1000px] mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 text-white">
            Prêt à transformer votre maison ?
          </h2>
          <p className="text-white/50 text-lg mb-10">
            Rejoignez les 2 500+ foyers qui ont déjà fait le choix de la simplicité.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onGoToDashboard}
              className="group relative px-8 py-4 rounded-xl bg-white text-violet-700 font-semibold hover:bg-violet-50 transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] cursor-pointer"
            >
              Commencer gratuitement
              <div className="absolute inset-0 rounded-xl bg-white opacity-0 group-hover:opacity-100 blur-xl -z-10 transition-opacity" />
            </button>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-white/[0.06] py-12 md:py-16 px-4 md:px-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-9 w-auto object-contain rounded-lg" />
            </div>
            <p className="text-sm text-white/30 leading-relaxed">
              Transformez votre maison grâce à la puissance des QR codes.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-white/80">Produit</h4>
            <ul className="space-y-2.5">
              {['Fonctionnalités', 'Hub Central', 'Modules', 'Tarifs'].map((l) => (
                <li key={l}><a href="#" className="text-sm text-white/30 hover:text-white transition-colors">{l}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-white/80">Support</h4>
            <ul className="space-y-2.5">
              {['Documentation', 'Contact', 'FAQ'].map((l) => (
                <li key={l}><a href="#" className="text-sm text-white/30 hover:text-white transition-colors">{l}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4 text-white/80">Légal</h4>
            <ul className="space-y-2.5">
              {['CGU', 'Confidentialité', 'Mentions légales'].map((l) => (
                <li key={l}><a href="#" className="text-sm text-white/30 hover:text-white transition-colors">{l}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-white/[0.06] pt-8 text-center">
          <p className="text-sm text-white/20">2025 ORDOMOTIK. Smart Home Solutions.</p>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage({ onGoToDashboard, onGoToSetup, onGoToHub }: LandingPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <Navbar onGoToDashboard={onGoToDashboard} />
      <HeroSection onGoToDashboard={onGoToDashboard} onGoToSetup={onGoToSetup} onGoToHub={onGoToHub} />
      <HowItWorks />
      <PricingSection />
      <ModulesShowcase />
      <CtaFinal onGoToDashboard={onGoToDashboard} onGoToSetup={onGoToSetup} onGoToHub={onGoToHub} />
      <Footer />
    </div>
  );
}

'use client';

// =============================================================
// HERO PREMIUM V7 — direction « Apple × Airbnb × Linear »
//
//   • Badge « Nouveau » : pill gradient bleu logo animé
//     (.animate-gradient) + reflet shimmer + ✨ en rotation lente
//   • v5.10 — logo hero retiré (2ᵉ logo au-dessus du badge) : le logo
//     officiel reste uniquement dans la navbar (une seule occurrence
//     visible à l'écran, demande client)
//   • H1 serif via <StaggerWords> — « 5 étoiles » en air-gradient-text
//   • v4.73 — VISUEL PHOTO RÉELLE à droite (demande client : « changer
//     l'image à droite par une image plus engageante ») : photo hôtel
//     de luxe (plaque QR + smartphone + cloche conciergerie) posée
//     dans une carte arrondie premium, parallaxe douce au scroll,
//     chips flottantes conservées (note + commande + Wi-Fi).
//   • CTA principal <MagneticButton> (confettis) + CTA secondaire
//     blanc bordure slate — ancres #pricing / #demo
//   • Fond : voiles bleu logo locaux (fond clair) + halo derrière
//     la photo + <FloatingParticles> recalibrés pour le clair
//   • v4.61 : page verrouillée claire « AIRBNB PRO », accent bleu vif
//     unique (#055492 ; émeraude de l'écran app réservé au succès)
// =============================================================

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import {
  ArrowRight,
  ChevronRight,
  Play,
  Wifi,
} from 'lucide-react';
import { FloatingParticles } from '@/components/premium/floating-particles';
import { MagneticButton } from '@/components/premium/magnetic-button';
import { CountUp } from '@/components/premium/count-up';
import { Reveal, StaggerWords } from '@/components/premium/reveal';
import { useLandingLang } from '@/lib/landing-i18n';

type GoToAuth = (mode: 'login' | 'register') => void;

/** Défilement doux vers une ancre de la page. */
function smoothScrollTo(selector: string) {
  if (typeof document === 'undefined') return;
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// VISUEL HÉRO PHOTO (v4.73 — remplace le mockup CSS)
// Photo réelle hôtel de luxe : plaque QR + smartphone + cloche.
// Parallaxe douce au scroll (rotation légère qui se redresse).
// ==========================================
function HeroVisual({ targetRef }: { targetRef: React.RefObject<HTMLElement | null> }) {
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ['start start', 'end start'],
  });

  // Repos : rotateY(-10°) rotateX(4°) → redressement complet à ~55 % du scroll.
  const rotateY = useSpring(useTransform(scrollYProgress, [0, 0.55], [-10, 0]), {
    stiffness: 80,
    damping: 20,
  });
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.55], [4, 0]), {
    stiffness: 80,
    damping: 20,
  });
  const y = useSpring(useTransform(scrollYProgress, [0, 0.55], [0, -28]), {
    stiffness: 80,
    damping: 20,
  });
  const shadowOpacity = useTransform(scrollYProgress, [0, 0.55], [0.18, 0.30]);
  const shadowScale = useTransform(scrollYProgress, [0, 0.55], [0.9, 1]);

  return (
    <div dir="ltr" className="relative flex justify-center [perspective:1400px]">
      {/* Ombre au sol dynamique */}
      <motion.div
        aria-hidden="true"
        style={{ opacity: shadowOpacity, scaleX: shadowScale }}
        className="absolute -bottom-8 h-10 w-3/4 rounded-[100%] bg-slate-900 blur-2xl"
      />

      <motion.div
        style={{ rotateY, rotateX, y, transformStyle: 'preserve-3d' }}
        className="relative w-full max-w-[560px]"
      >
        {/* Halo de couleur derrière la photo (voiles bleu logo) */}
        <div
          aria-hidden="true"
          className="absolute -inset-8 rounded-[3.5rem] bg-gradient-to-br from-[#055492]/25 via-[#04467a]/10 to-[#F59E0B]/15 blur-3xl"
        />

        {/* Carte photo premium */}
        <div className="relative overflow-hidden rounded-[2.5rem] shadow-2xl ring-1 ring-slate-900/10">
          <Image
            src="/brand/hero-concierge.jpg"
            alt="Plaque QR RoomScan, smartphone et cloche de conciergerie sur un marbre d'hôtel de luxe"
            width={1152}
            height={864}
            priority
            className="h-auto w-full select-none object-cover"
          />
          {/* Reflet diagonal */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.14)_48%,transparent_62%)]"
          />
          {/* Voile bas pour la lisibilité de la pill */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent"
          />
          {/* Pill signature en bas de la photo */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/35 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md">
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              1 scan → tout le séjour
            </span>
            <span className="hidden items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-bold text-slate-900 shadow-sm backdrop-blur-md sm:inline-flex">
              ★ 4,9 · Airbnb
            </span>
          </div>
        </div>
      </motion.div>

      {/* Chips flottantes (hors du plan 3D, positionnées sur le conteneur) */}
      <div className="absolute -right-2 top-12 hidden animate-float items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/90 px-3.5 py-2.5 shadow-xl backdrop-blur-xl backdrop-saturate-[1.4] transition-shadow hover:shadow-2xl sm:flex lg:-right-8">
        <span className="text-base text-amber-500" aria-hidden="true">
          ★
        </span>
        <span>
          <span className="block text-xs font-bold text-slate-900">
            4,9/5
          </span>
          <span className="block text-[10px] text-slate-500">
            214 avis
          </span>
        </span>
      </div>
      <div
        className="absolute -left-2 bottom-16 hidden animate-float items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/90 px-3.5 py-2.5 shadow-xl backdrop-blur-xl backdrop-saturate-[1.4] transition-shadow hover:shadow-2xl sm:flex lg:-left-10"
        style={{ animationDelay: '-3s' }}
      >
        <span aria-hidden="true">🔔</span>
        <span>
          <span className="block text-xs font-bold text-slate-900">
            Nouvelle commande
          </span>
          <span className="block text-[10px] text-slate-500">
            Petit-déjeuner · il y a 2 min
          </span>
        </span>
      </div>
    </div>
  );
}

// ==========================================
// HERO SECTION
// ==========================================
export function HeroSection({ onGoToAuth }: { onGoToAuth?: GoToAuth }) {
  const { t } = useLandingLang();
  const heroRef = useRef<HTMLElement>(null);

  const stats = [
    { end: 500, suffix: '+', label: t('Hôtes actifs') },
    { end: 98, suffix: ' %', label: t('Satisfaction') },
    { end: 2, suffix: ' min', label: t('Setup moyen') },
  ];

  return (
    <section
      id="hero"
      ref={heroRef}
      className="relative scroll-mt-16 overflow-hidden pb-20 pt-28 sm:pt-32 lg:pb-28"
    >
      {/* Voiles d'ambiance bleu logo (fond clair) + particules */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-36 right-[-12%] h-[440px] w-[640px] rounded-full bg-[#055492]/[0.07] blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-14%] left-[-10%] h-[380px] w-[540px] rounded-full bg-[#1173c7]/[0.06] blur-[130px]"
      />
      <FloatingParticles className="z-0" />

      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        {/* ── Colonne texte ── */}
        <div className="text-center lg:text-left">
          {/* v5.10 — DEMANDE CLIENT : le 2ᵉ logo (grand format au-dessus du
              badge) est SUPPRIMÉ — le logo officiel reste dans la barre de
              navigation (54 px) qui est déjà visible au même écran. */}

          {/* Badge « Nouveau » — pill gradient animé + shimmer + ✨ */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-7 flex justify-center lg:justify-start"
          >
            <span className="shimmer-line animate-gradient inline-flex items-center gap-2 rounded-full border border-white/25 bg-[linear-gradient(93deg,#04467a,#055492,#033a66)] bg-[length:200%_auto] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_8px_24px_rgba(4, 70, 122,0.30)]">
              <span aria-hidden="true" className="animate-spin-slow">
                ✨
              </span>
              {t('Nouveau — Mode White-Label')}
            </span>
          </motion.div>

          {/* H1 — serif display, mots staggerés, « 5 étoiles » en lux */}
          <h1 className="display-title font-serif! mb-6 text-5xl font-bold text-slate-900 sm:text-6xl md:text-7xl lg:text-8xl">
            <StaggerWords
              text={t('Transformez chaque séjour en expérience 5 étoiles.')}
              highlightFrom={5}
              delay={0.15}
              highlightClassName="font-serif italic air-gradient-text"
            />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55 }}
            className="mx-auto mb-9 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl lg:mx-0"
          >
            {t(
              'Une seule plaque QR élégante : vos invités accèdent au Wi-Fi, au guidebook et à vos services en 1 scan. Vous pilotez tout depuis un dashboard professionnel.',
            )}
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
            className="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start"
          >
            <MagneticButton
              onClick={() => smoothScrollTo('#pricing')}
              className="px-8 py-4 text-base"
            >
              {t("Commencer l'essai gratuit")}
              <ArrowRight className="h-5 w-5" />
            </MagneticButton>
            <button
              type="button"
              onClick={() => smoothScrollTo('#demo')}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-8 py-4 font-semibold text-slate-900 shadow-sm transition-all hover:scale-[1.03] hover:border-slate-300 hover:shadow-md"
            >
              <Play className="h-5 w-5" />
              {t('Voir la démo')}
            </button>
          </motion.div>

          {/* Stats */}
          <Reveal delay={0.85} y={20} className="mx-auto max-w-md lg:mx-0">
            <dl className="grid grid-cols-3 gap-6">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center lg:text-left">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="mb-1 font-serif text-3xl font-bold text-slate-900 sm:text-4xl">
                    <CountUp end={stat.end} suffix={stat.suffix} />
                  </dd>
                  <dd className="text-xs text-slate-500 sm:text-sm">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        {/* ── Colonne visuel photo (v4.73) ── */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <HeroVisual targetRef={heroRef} />
        </motion.div>
      </div>

      {/* Indicateur de scroll */}
      <motion.div
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 lg:block"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        aria-hidden="true"
      >
        <ChevronRight className="h-6 w-6 rotate-90 text-slate-400" />
      </motion.div>
    </section>
  );
}

'use client';

import { motion } from 'framer-motion';
import {
  Wifi, BookOpen, MessageSquare, ShoppingBag, ShieldCheck,
  ClipboardList, Timer, UtensilsCrossed, Pill, StickyNote,
  ExternalLink, Home, Mic, Tag, Megaphone, Ticket, Bell,
} from 'lucide-react';

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

interface ModuleItem {
  icon: React.ReactNode;
  name: string;
  description: string;
  gradient: string;
  category: 'essential' | 'communication' | 'organisation' | 'business';
}

const MODULES: ModuleItem[] = [
  {
    icon: <Wifi className="w-5 h-5" />,
    name: 'Wi-Fi',
    description: 'Partagez votre mot de passe en un scan.',
    gradient: 'from-emerald-500 to-teal-600',
    category: 'essential',
  },
  {
    icon: <BookOpen className="w-5 h-5" />,
    name: 'Guide du logement',
    description: 'Instructions complètes pour vos invités.',
    gradient: 'from-blue-500 to-cyan-600',
    category: 'essential',
  },
  {
    icon: <Home className="w-5 h-5" />,
    name: 'Règles de la maison',
    description: 'Règles claires, zéro conflit.',
    gradient: 'from-amber-500 to-orange-600',
    category: 'essential',
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    name: 'Urgence & Contacts',
    description: 'Numéros utiles et contacts en un tap.',
    gradient: 'from-rose-500 to-red-600',
    category: 'essential',
  },
  {
    icon: <Mic className="w-5 h-5" />,
    name: 'Messages vocaux',
    description: 'Laissez des notes vocales à la famille.',
    gradient: 'from-violet-500 to-purple-600',
    category: 'communication',
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    name: 'Livre d\'or',
    description: 'Collectez les avis de vos invités.',
    gradient: 'from-pink-500 to-fuchsia-600',
    category: 'communication',
  },
  {
    icon: <StickyNote className="w-5 h-5" />,
    name: 'Note rapide',
    description: 'Un pense-bête accessible instantanément.',
    gradient: 'from-yellow-500 to-amber-600',
    category: 'communication',
  },
  {
    icon: <ShoppingBag className="w-5 h-5" />,
    name: 'Liste de courses',
    description: 'Ajoutez en un tap, tout le monde voit.',
    gradient: 'from-lime-500 to-green-600',
    category: 'organisation',
  },
  {
    icon: <ClipboardList className="w-5 h-5" />,
    name: 'Tâches ménagères',
    description: 'Attribuez et suivez les tâches du foyer.',
    gradient: 'from-sky-500 to-blue-600',
    category: 'organisation',
  },
  {
    icon: <Timer className="w-5 h-5" />,
    name: 'Minuteur',
    description: 'Four, machine, cuisson : ne perdez rien.',
    gradient: 'from-orange-500 to-red-500',
    category: 'organisation',
  },
  {
    icon: <UtensilsCrossed className="w-5 h-5" />,
    name: 'Recettes',
    description: 'Partagez vos recettes préférées.',
    gradient: 'from-red-500 to-rose-600',
    category: 'organisation',
  },
  {
    icon: <Pill className="w-5 h-5" />,
    name: 'Médicaments',
    description: 'Rappels et posologie accessibles.',
    gradient: 'from-teal-500 to-emerald-600',
    category: 'organisation',
  },
  {
    icon: <ExternalLink className="w-5 h-5" />,
    name: 'Lien externe',
    description: 'Redirigez vers n\'importe quel site.',
    gradient: 'from-indigo-500 to-violet-600',
    category: 'business',
  },
  {
    icon: <Tag className="w-5 h-5" />,
    name: 'Flash Sale',
    description: 'Promotions éphémères en un scan.',
    gradient: 'from-fuchsia-500 to-pink-600',
    category: 'business',
  },
  {
    icon: <Ticket className="w-5 h-5" />,
    name: 'Coupon',
    description: 'Distribuez des bons de réduction.',
    gradient: 'from-amber-500 to-yellow-600',
    category: 'business',
  },
  {
    icon: <Megaphone className="w-5 h-5" />,
    name: 'Marchand local',
    description: 'Mettez en avant vos partenaires.',
    gradient: 'from-emerald-500 to-cyan-600',
    category: 'business',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'Tous' },
  { id: 'essential', label: 'Essentiels' },
  { id: 'communication', label: 'Communication' },
  { id: 'organisation', label: 'Organisation' },
  { id: 'business', label: 'Business' },
] as const;

export function ModulesShowcase() {
  return (
    <section
      id="modules"
      className="py-24 md:py-32 px-4 md:px-8 scroll-mt-16 relative"
      style={{ background: 'linear-gradient(180deg, #020617 0%, #0f172a 50%, #020617 100%)' }}
    >
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-500/[0.03] rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Section header */}
        <div className="text-center mb-16 md:mb-20">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
              Modules V3
            </h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-white/50 text-lg md:text-xl max-w-2xl mx-auto">
              Des interfaces immersives pour chaque usage. Chaque QR code devient une expérience.
            </p>
          </FadeIn>
        </div>

        {/* Category pills */}
        <FadeIn delay={0.15}>
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {CATEGORIES.map((cat) => (
              <span
                key={cat.id}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-default ${
                  cat.id === 'all'
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.07] hover:text-white/60'
                }`}
              >
                {cat.label}
              </span>
            ))}
          </div>
        </FadeIn>

        {/* Modules grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((mod, i) => (
            <FadeIn key={mod.name} delay={0.05 + i * 0.04}>
              <div className="group relative bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-5 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-400">
                {/* Icon */}
                <div
                  className={`w-11 h-11 rounded-xl bg-gradient-to-br ${mod.gradient} flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                >
                  {mod.icon}
                </div>

                {/* Name */}
                <h3 className="text-sm font-bold text-white mb-1.5">{mod.name}</h3>

                {/* Description */}
                <p className="text-white/35 text-xs leading-relaxed">{mod.description}</p>

                {/* Category badge */}
                <div className="mt-3">
                  <span className="text-[10px] font-medium text-white/15 uppercase tracking-wider">
                    {mod.category}
                  </span>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Bottom stats */}
        <FadeIn delay={0.4}>
          <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto">
            <div className="text-center">
              <div className="text-2xl font-extrabold text-white">20+</div>
              <div className="text-xs text-white/30 mt-1">Modules</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold text-white">V3</div>
              <div className="text-xs text-white/30 mt-1">Interface</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold text-white">100%</div>
              <div className="text-xs text-white/30 mt-1">Personnalisable</div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

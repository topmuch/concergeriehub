'use client';

import { motion } from 'framer-motion';
import { Check, Sparkles, Star, Zap, ArrowRight } from 'lucide-react';

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

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PricingPlan {
  name: string;
  badge?: string;
  badgeColor?: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  highlight?: boolean;
  gradient: string;
  icon: React.ReactNode;
}

const PLANS: PricingPlan[] = [
  {
    name: 'Famille',
    price: '49\u20ac',
    period: '/ an',
    description: 'Le quotidien de votre foyer, simplifie.',
    icon: <Sparkles className="w-5 h-5" />,
    gradient: 'from-violet-500 to-purple-600',
    features: [
      { text: '1 maison avec pièces illimitées', included: true },
      { text: 'Wi-Fi, listes de courses, tâches', included: true },
      { text: 'Messages vocaux familiaux', included: true },
      { text: 'Mode invité (QR public)', included: true },
      { text: 'Plaque QR en aluminium gravée', included: true },
      { text: 'Multi-propriétaires', included: false },
      { text: 'Statistiques avancées', included: false },
    ],
    cta: 'Choisir Famille',
  },
  {
    name: 'Airbnb',
    badge: 'Le plus populaire',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    price: '9,90\u20ac',
    period: '/ mois',
    description: "Sublimez l'expérience de vos invités.",
    icon: <Star className="w-5 h-5" />,
    gradient: 'from-amber-500 to-orange-600',
    highlight: true,
    features: [
      { text: '1 maison avec pièces illimitées', included: true },
      { text: 'Wi-Fi, guide du logement, règles', included: true },
      { text: 'Bouclier d\'avis automatique', included: true },
      { text: 'Upsell & services locaux', included: true },
      { text: 'Plaque QR en aluminium gravée', included: true },
      { text: 'Statistiques de scans', included: true },
      { text: 'Mode multi-propriétaires', included: false },
    ],
    cta: 'Choisir Airbnb',
  },
  {
    name: 'Airbnb Pro',
    badge: 'Multi-biens',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    price: '199\u20ac',
    period: '/ an',
    description: 'Pour les gestionnaires de plusieurs logements.',
    icon: <Zap className="w-5 h-5" />,
    gradient: 'from-emerald-500 to-teal-600',
    features: [
      { text: 'Jusqu\'à 3 logements', included: true },
      { text: 'Pièces et modules illimités', included: true },
      { text: 'Tous les modules Airbnb inclus', included: true },
      { text: 'Statistiques avancées multi-biens', included: true },
      { text: 'Plaques QR gravées (x3)', included: true },
      { text: 'Support prioritaire dédié', included: true },
      { text: 'Dashboard multi-biens', included: true },
    ],
    cta: 'Choisir Pro',
  },
];

export function PricingSection() {
  return (
    <section
      id="pricing"
      className="py-24 md:py-32 px-4 md:px-8 scroll-mt-16 relative"
      style={{ background: 'linear-gradient(180deg, #020617 0%, #0f172a 50%, #020617 100%)' }}
    >
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/[0.03] rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Section header */}
        <div className="text-center mb-16 md:mb-20">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
              Simple et transparent
            </h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-white/50 text-lg md:text-xl max-w-2xl mx-auto">
              Choisissez l'offre qui vous correspond. Pas de frais cachés.
            </p>
          </FadeIn>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
          {PLANS.map((plan, i) => (
            <FadeIn key={plan.name} delay={0.15 + i * 0.12}>
              <div
                className={`relative rounded-2xl p-[1px] transition-all duration-500 ${
                  plan.highlight
                    ? 'bg-gradient-to-b from-amber-500/40 via-amber-500/20 to-transparent'
                    : 'bg-white/[0.06]'
                }`}
              >
                <div
                  className={`relative rounded-2xl p-6 md:p-8 ${
                    plan.highlight
                      ? 'bg-slate-900/95 backdrop-blur-xl'
                      : 'bg-white/[0.02] backdrop-blur-sm'
                  }`}
                >
                  {/* Highlight glow */}
                  {plan.highlight && (
                    <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                  )}

                  {/* Header */}
                  <div className="relative mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center text-white shadow-lg`}
                        >
                          {plan.icon}
                        </div>
                        <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                      </div>
                      {plan.badge && (
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${plan.badgeColor}`}>
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-white/40 text-sm mb-4">{plan.description}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                      {plan.period && <span className="text-white/40 text-sm">{plan.period}</span>}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-white/[0.06] mb-6" />

                  {/* Features */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature) => (
                      <li key={feature.text} className="flex items-start gap-3">
                        {feature.included ? (
                          <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-emerald-400" />
                          </div>
                        ) : (
                          <div className="mt-0.5 w-5 h-5 rounded-full bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                          </div>
                        )}
                        <span
                          className={`text-sm ${
                            feature.included ? 'text-white/70' : 'text-white/25'
                          }`}
                        >
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer ${
                      plan.highlight
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02]'
                        : 'bg-white/[0.06] border border-white/[0.1] text-white/80 hover:bg-white/[0.1] hover:text-white hover:border-white/[0.2]'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Bottom note */}
        <FadeIn delay={0.6}>
          <p className="text-center text-white/20 text-sm mt-12">
            Toutes les offres incluent la plaque QR en aluminium, l'hébergement cloud et les mises à jour. Annulation à tout moment.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

'use client';

import { motion } from 'framer-motion';
import {
  Package, Settings, Smartphone, ArrowRight,
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

const STEPS = [
  {
    number: '01',
    icon: <Package className="w-6 h-6" />,
    title: 'Recevez votre plaque',
    description:
      'Une plaque QR élégante en aluminium gravé est livrée chez vous. Fixez-la à l\'entrée de votre maison, de chaque pièce, ou de votre location Airbnb.',
    color: 'from-violet-500 to-purple-600',
    glowColor: 'violet',
  },
  {
    number: '02',
    icon: <Settings className="w-6 h-6" />,
    title: 'Configurez en ligne',
    description:
      'En 5 minutes, associez chaque QR code à un module : Wi-Fi, guide du logement, liste de courses, messages vocaux, et bien plus encore.',
    color: 'from-emerald-500 to-teal-600',
    glowColor: 'emerald',
  },
  {
    number: '03',
    icon: <Smartphone className="w-6 h-6" />,
    title: 'Scannez et profitez',
    description:
      'Vos invités scannent simplement le QR avec leur téléphone. Aucune application à installer. Tout s\'ouvre directement dans le navigateur.',
    color: 'from-amber-500 to-orange-600',
    glowColor: 'amber',
  },
];

export function HowItWorks() {
  return (
    <section
      id="avantages"
      className="py-24 md:py-32 px-4 md:px-8 scroll-mt-16 relative"
      style={{ background: 'linear-gradient(180deg, #020617 0%, #0f172a 50%, #020617 100%)' }}
    >
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-violet-500/[0.03] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Section header */}
        <div className="text-center mb-16 md:mb-20">
          <FadeIn>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
              Comment ça marche ?
            </h2>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-white/50 text-lg md:text-xl max-w-2xl mx-auto">
              3 étapes simples pour une maison intelligente et connectée
            </p>
          </FadeIn>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line (desktop) */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {STEPS.map((step, i) => (
              <FadeIn key={step.number} delay={0.15 + i * 0.15}>
                <div className="relative group">
                  {/* Step card */}
                  <div className="relative bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-6 md:p-8 text-center hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-500">
                    {/* Glow effect on hover */}
                    <div
                      className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${step.color} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500`}
                    />

                    {/* Number badge */}
                    <div className="relative flex justify-center mb-6">
                      <div
                        className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-white shadow-lg`}
                        style={{
                          boxShadow: `0 8px 30px -4px ${step.glowColor === 'violet' ? 'rgba(139,92,246,0.35)' : step.glowColor === 'emerald' ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
                        }}
                      >
                        {step.icon}
                      </div>
                    </div>

                    {/* Step number */}
                    <span className="inline-block text-xs font-bold tracking-widest text-white/20 uppercase mb-3">
                      Étape {step.number}
                    </span>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>

                    {/* Description */}
                    <p className="text-white/40 text-sm leading-relaxed">{step.description}</p>
                  </div>

                  {/* Arrow between steps (desktop) */}
                  {i < STEPS.length - 1 && (
                    <div className="hidden lg:flex absolute -right-6 top-1/2 -translate-y-1/2 z-10">
                      <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                        <ArrowRight className="w-5 h-5 text-white/30" />
                      </div>
                    </div>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>

        {/* Bottom highlight */}
        <FadeIn delay={0.6}>
          <div className="mt-16 md:mt-20 text-center">
            <div className="inline-flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-6 py-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-sm font-medium">
                Zéro application à installer — tout fonctionne dans le navigateur
              </span>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

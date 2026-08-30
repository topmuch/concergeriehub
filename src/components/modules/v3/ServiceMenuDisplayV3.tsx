'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Clock,
  Coffee,
  Car,
  Sparkles,
  Gift,
  Star,
  Home,
  MessageCircle,
  UtensilsCrossed,
  Wine,
  Dumbbell,
  Plane,
  Baby,
  type LucideIcon,
} from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

const ICON_MAP: Record<string, LucideIcon> = {
  clock: Clock,
  coffee: Coffee,
  car: Car,
  sparkles: Sparkles,
  gift: Gift,
  star: Star,
  home: Home,
  utensils: UtensilsCrossed,
  wine: Wine,
  dumbbell: Dumbbell,
  plane: Plane,
  baby: Baby,
};

function getIcon(iconString?: string): LucideIcon {
  if (!iconString) return Sparkles;
  return ICON_MAP[iconString.toLowerCase()] ?? Sparkles;
}

interface ServiceMenuDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export default function ServiceMenuDisplayV3({ content, qrCodeId, qrName }: ServiceMenuDisplayV3Props) {
  const rawTitle: string = content?.title || 'Services disponibles';
  const rawSubtitle: string = content?.subtitle || 'Ajoutez des options à votre séjour';
  const contactMessage: string = content?.contactMessage || '';

  const items: Array<{ name: string; description?: string; price?: string; icon?: string }> =
    useMemo(() => (Array.isArray(content?.items) ? content.items : []), [content]);

  return (
    <GradientBackground moduleType="service_menu">
      <FloatingParticles color="rgba(255,255,255,0.15)" count={15} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(124,58,237,0.3)">
          <div className="w-20 h-20 rounded-full bg-violet-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <TrendingUp className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            {rawSubtitle}
          </p>
        </AnimatedTitle>

        {/* Service Cards List */}
        <div className="w-full max-w-lg mt-6 space-y-3">
          {items.length > 0 ? (
            items.map((item, index) => {
              const ItemIcon = getIcon(item.icon);
              return (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + index * 0.1, duration: 0.5, ease: 'easeOut' }}
                  className="w-full"
                >
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        <ItemIcon className="w-6 h-6 text-white" strokeWidth={1.5} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-white leading-tight">
                          {item.name}
                        </h3>
                        {item.description && (
                          <p className="text-sm text-white/70 mt-1 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                        {item.price && (
                          <p className="text-xl font-bold text-amber-300 mt-2">
                            {item.price}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Reserve button */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      className="mt-3 w-full bg-white/10 hover:bg-white/20 text-white rounded-xl py-2 px-6 text-sm font-medium transition-colors"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      Réserver
                    </motion.button>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="py-12 flex flex-col items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, y: [0, -8, 0] }}
                transition={{
                  scale: { type: 'spring', stiffness: 200, delay: 0.1 },
                  y: { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
                }}
                className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4"
              >
                <TrendingUp className="w-10 h-10 text-white/30" strokeWidth={1.5} />
              </motion.div>
              <p className="text-white/50 text-base">
                Aucun service disponible pour le moment
              </p>
            </motion.div>
          )}
        </div>

        {/* Contact message */}
        {contactMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 + items.length * 0.1 + 0.2, duration: 0.5 }}
            className="w-full max-w-lg mt-5"
          >
            <div className="flex items-start gap-3 px-1">
              <MessageCircle className="w-4 h-4 text-white/40 shrink-0 mt-0.5" />
              <p className="text-white/50 text-xs leading-relaxed">{contactMessage}</p>
            </div>
          </motion.div>
        )}
      </div>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

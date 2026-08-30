'use client';

import { motion } from 'framer-motion';
import { BookOpen, FileText } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface InfoDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
  moduleType?: string;
}

const VALID_MODULE_TYPES = [
  'home_manual', 'house_rules', 'visitor_info', 'appliance_manual',
  'wifi_reset', 'first_aid', 'emergency_contacts', 'home_network',
  'recycling_info', 'utility_shutoff', 'garage_instructions', 'laundry_guide',
  'energy_monitor', 'key_location', 'cleaning_schedule',
];

export default function InfoDisplayV3({ content, qrCodeId, qrName, moduleType }: InfoDisplayV3Props) {
  const resolvedModuleType = (moduleType && VALID_MODULE_TYPES.includes(moduleType))
    ? moduleType
    : 'home_manual';

  const rawTitle: string = content?.title || 'Informations';
  const rawBody: string = content?.body || '';

  return (
    <GradientBackground moduleType={resolvedModuleType}>
      <FloatingParticles color="rgba(255,255,255,0.2)" count={18} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(124,58,237,0.3)">
          <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BookOpen className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Informations utiles
          </p>
        </AnimatedTitle>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-6"
        >
          <GlassCard>
            <div className="p-5 sm:p-6">
              {rawBody ? (
                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55, duration: 0.5 }}
                    className="max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar"
                  >
                    <p className="text-white/90 text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
                      {rawBody}
                    </p>
                  </motion.div>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.55 }}
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
                    <FileText className="w-10 h-10 text-white/30" strokeWidth={1.5} />
                  </motion.div>
                  <p className="text-white/50 text-center text-base">
                    Aucune information disponible
                  </p>
                </motion.div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

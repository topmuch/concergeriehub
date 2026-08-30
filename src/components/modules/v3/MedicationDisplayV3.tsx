'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pill, Heart, Copy, Check } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
  useConfetti,
} from '@/components/magic';

interface MedicationDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export default function MedicationDisplayV3({ content, qrCodeId, qrName }: MedicationDisplayV3Props) {
  const rawTitle: string = content?.title || 'Médicament';
  const rawBody: string = content?.body || '';

  const [copied, setCopied] = useState(false);
  const { fire } = useConfetti();

  const copyDosage = useCallback(async () => {
    if (!rawBody) return;
    try {
      await navigator.clipboard.writeText(rawBody);
      setCopied(true);
      fire(['#f472b6', '#fb7185', '#ffffff', '#fda4af']);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }, [rawBody, fire]);

  return (
    <GradientBackground moduleType="medication">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={18} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(244,114,182,0.3)">
          <div className="w-20 h-20 rounded-full bg-pink-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-pink-500/20">
            <Pill className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Instructions de prise
          </p>
        </AnimatedTitle>

        {/* Heart decoration */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 200 }}
          className="mt-3"
        >
          <Heart className="w-5 h-5 text-pink-200/60 fill-pink-200/40" strokeWidth={0} />
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-6"
        >
          <GlassCard>
            <div className="p-5 sm:p-6">
              {/* Medication name big */}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55, duration: 0.4 }}
                className="mb-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Pill className="w-5 h-5 text-white" strokeWidth={1.5} />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">
                    {rawTitle}
                  </h2>
                </div>
              </motion.div>

              {/* Divider */}
              <div className="h-px bg-white/10 mb-4" />

              {/* Dosage / Instructions */}
              {rawBody ? (
                <>
                  <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.65, duration: 0.5 }}
                      className="max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar"
                    >
                      <p className="text-white/90 text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
                        {rawBody}
                      </p>
                    </motion.div>
                  </div>
                  {/* Copy dosage button */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.4 }}
                    className="mt-4"
                  >
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={copyDosage}
                      className="w-full bg-white/5 rounded-2xl p-4 flex items-center justify-center gap-3 active:bg-white/10 transition-colors"
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <AnimatePresence mode="wait">
                        {copied ? (
                          <motion.span
                            key="copied"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="text-white text-base font-medium flex items-center gap-2"
                          >
                            <Check className="w-5 h-5" strokeWidth={2.5} />
                            Copié !
                          </motion.span>
                        ) : (
                          <motion.span
                            key="copy"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-white/70 text-base font-medium flex items-center gap-2"
                          >
                            <Copy className="w-5 h-5" strokeWidth={1.8} />
                            Copier les instructions
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </motion.div>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.65 }}
                  className="py-8 flex flex-col items-center justify-center"
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
                    <Pill className="w-10 h-10 text-white/30" strokeWidth={1.5} />
                  </motion.div>
                  <p className="text-white/50 text-base">
                    Aucune instruction disponible
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

'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Copy, Check } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
  PageTransition,
  PulseButton,
  useConfetti,
} from '@/components/magic';

interface NoteDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export default function NoteDisplayV3({ content }: NoteDisplayV3Props) {
  const title: string = content?.title || 'Note';
  const body: string = content?.body || '';
  const isEmpty = !body.trim();

  const [copied, setCopied] = useState(false);
  const { fire } = useConfetti();

  const copyNote = useCallback(async () => {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      fire(['#facc15', '#fde047', '#ffffff', '#fef08a']);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }, [body, fire]);

  return (
    <PageTransition>
      <GradientBackground moduleType="note">
        <FloatingParticles color="rgba(255,255,255,0.2)" count={12} />

        <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
          {/* Icon */}
          <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(234,179,8,0.3)">
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <FileText className="w-10 h-10 text-white" strokeWidth={1.8} />
            </div>
          </AnimatedIcon>

          {/* Title */}
          <AnimatedTitle delay={0.15}>
            <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
              {title}
            </h1>
            <p className="text-white/60 text-center text-sm sm:text-base mt-1">
              Votre message
            </p>
          </AnimatedTitle>

          {/* Note Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
            className="w-full max-w-lg mt-8"
          >
            <GlassCard>
              <div className="p-5 sm:p-6">
                {isEmpty ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1, y: [0, -8, 0] }}
                      transition={{
                        scale: { type: 'spring', stiffness: 200, delay: 0.1 },
                        y: { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
                      }}
                      className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-4"
                    >
                      <FileText className="w-10 h-10 text-white/30" strokeWidth={1.5} />
                    </motion.div>
                    <p className="text-white/50 text-center text-base sm:text-lg">
                      Aucune note
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                      <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                        <p className="text-white text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
                          {body}
                        </p>
                      </div>
                    </div>
                    {/* Copy button */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="mt-4"
                    >
                      <PulseButton variant="white" onClick={copyNote}>
                        <AnimatePresence mode="wait">
                          {copied ? (
                            <motion.span
                              key="copied"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="flex items-center gap-2"
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
                              className="flex items-center gap-2"
                            >
                              <Copy className="w-5 h-5" strokeWidth={1.8} />
                              Copier le texte
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </PulseButton>
                    </motion.div>
                  </>
                )}
              </div>
            </GlassCard>
          </motion.div>

          {/* Subtle decorative corner accents */}
          {!isEmpty && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="mt-6 flex items-center gap-2"
            >
              <div className="w-8 h-px bg-white/20" />
              <FileText className="w-3.5 h-3.5 text-white/20" strokeWidth={1.5} />
              <div className="w-8 h-px bg-white/20" />
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <BrandedFooter delay={0.8} />
      </GradientBackground>
    </PageTransition>
  );
}

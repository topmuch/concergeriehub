'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Copy, Check, Globe, Clock } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  PulseButton,
  useConfetti,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface LinkDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

const REDIRECT_COUNTDOWN = 5;

export default function LinkDisplayV3({ content, qrCodeId, qrName }: LinkDisplayV3Props) {
  const rawTitle: string = content?.title || 'Lien';
  const rawUrl: string = content?.url || '';

  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(REDIRECT_COUNTDOWN);
  const [redirected, setRedirected] = useState(false);
  const { fire } = useConfetti();
  const hasAutoRedirected = useRef(false);

  const openUrl = useCallback(() => {
    if (rawUrl) {
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
    }
  }, [rawUrl]);

  const copyUrl = useCallback(async () => {
    if (!rawUrl) return;
    try {
      await navigator.clipboard.writeText(rawUrl);
      setCopied(true);
      fire(['#5eead4', '#14b8a6', '#ffffff', '#fbbf24']);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }, [rawUrl, fire]);

  // Auto-redirect countdown
  useEffect(() => {
    if (!rawUrl || hasAutoRedirected.current) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          hasAutoRedirected.current = true;
          setRedirected(true);
          window.open(rawUrl, '_blank', 'noopener,noreferrer');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rawUrl]);

  return (
    <GradientBackground moduleType="external_link">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={18} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(20,184,166,0.3)">
          <div className="w-20 h-20 rounded-full bg-teal-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Globe className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Redirection automatique
          </p>
        </AnimatedTitle>

        {/* URL preview */}
        <AnimatePresence>
          {rawUrl && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="text-white/60 text-center text-sm sm:text-base mt-3 max-w-md truncate"
            >
              {rawUrl}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-8"
        >
          <GlassCard>
            <div className="p-5 sm:p-6 space-y-5">
              {rawUrl ? (
                <>
                  {/* Countdown notice */}
                  {!redirected && countdown > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="flex items-center justify-center gap-2 text-white/50 text-sm"
                    >
                      <Clock className="w-4 h-4" strokeWidth={1.5} />
                      <span>Redirection automatique dans {countdown}s</span>
                    </motion.div>
                  )}

                  {/* Redirected notice */}
                  {redirected && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-white/40 text-sm"
                    >
                      Page de redirection ouverte
                    </motion.div>
                  )}

                  {/* Open link button */}
                  <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                    <AnimatedIcon delay={0.55}>
                      <PulseButton variant="white" onClick={openUrl}>
                        <ExternalLink className="w-5 h-5" strokeWidth={2} />
                        <span>Ouvrir le lien</span>
                      </PulseButton>
                    </AnimatedIcon>
                  </div>

                  {/* Copy URL button */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7, duration: 0.4 }}
                  >
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={copyUrl}
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
                            Copier l'URL
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </motion.div>
                </>
              ) : (
                /* Empty state */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
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
                    <ExternalLink className="w-10 h-10 text-white/30" strokeWidth={1.5} />
                  </motion.div>
                  <p className="text-white/50 text-center text-base">
                    Aucun lien défini
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

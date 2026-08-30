'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Star, Heart, Check } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface CheckoutFeedbackDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

export default function CheckoutFeedbackDisplayV3({ content, qrCodeId, qrName }: CheckoutFeedbackDisplayV3Props) {
  const rawTitle: string = content?.title || 'Votre avis compte !';
  const rawSubtitle: string = content?.subtitle || 'Aidez-nous à améliorer votre séjour';
  const customMessage: string = content?.customMessage || '';

  const [selectedRating, setSelectedRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const displayRating = hoverRating || selectedRating;

  const handleSubmit = useCallback(async () => {
    if (selectedRating === 0 || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/public/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCodeId,
          rating: selectedRating,
          comment,
        }),
      });
      setSubmitted(true);
    } catch {
      // silent — form still shows success visually
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [selectedRating, comment, qrCodeId, submitting]);

  return (
    <GradientBackground moduleType="checkout_feedback">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={12} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(217,119,6,0.3)">
          <div className="w-20 h-20 rounded-full bg-amber-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <ShieldCheck className="w-10 h-10 text-white" strokeWidth={1.8} />
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

        {/* Custom message */}
        {customMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="w-full max-w-lg mt-5"
          >
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 flex items-start gap-3">
              <Heart className="w-5 h-5 text-amber-200/80 shrink-0 mt-0.5" fill="rgba(253,230,138,0.4)" />
              <p className="text-white/80 text-sm leading-relaxed">{customMessage}</p>
            </div>
          </motion.div>
        )}

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-5"
        >
          <GlassCard>
            <div className="p-5 sm:p-6">
              <AnimatePresence mode="wait">
                {submitted ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
                    className="py-8 flex flex-col items-center justify-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                      className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-5"
                    >
                      <Check className="w-10 h-10 text-white" strokeWidth={2.5} />
                    </motion.div>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.4 }}
                      className="text-2xl font-bold text-white text-center"
                    >
                      Merci pour votre retour !
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="text-white/60 text-sm text-center mt-2"
                    >
                      Votre avis nous aide à nous améliorer
                    </motion.p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {/* Star Rating */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55, duration: 0.4 }}
                      className="flex flex-col items-center mb-6"
                    >
                      <p className="text-white/70 text-sm mb-3">Votre note</p>
                      <motion.div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <motion.button
                            key={star}
                            type="button"
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setSelectedRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                            className="focus:outline-none"
                          >
                            <Star
                              className={`w-10 h-10 transition-colors duration-200 ${
                                star <= displayRating
                                  ? 'text-amber-300 fill-amber-300'
                                  : 'text-white/30'
                              }`}
                              strokeWidth={1.5}
                            />
                          </motion.button>
                        ))}
                      </motion.div>
                      {selectedRating > 0 && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-amber-200 text-xs mt-2"
                        >
                          {selectedRating === 1 && 'Très déçu(e)'}
                          {selectedRating === 2 && 'Déçu(e)'}
                          {selectedRating === 3 && 'Correct'}
                          {selectedRating === 4 && 'Très satisfait(e)'}
                          {selectedRating === 5 && 'Excellent !'}
                        </motion.p>
                      )}
                    </motion.div>

                    {/* Divider */}
                    <div className="h-px bg-white/10 mb-5" />

                    {/* Comment textarea */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.65, duration: 0.4 }}
                      className="mb-5"
                    >
                      <p className="text-white/70 text-sm mb-2">Votre commentaire (optionnel)</p>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Partagez votre expérience..."
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/30 text-sm leading-relaxed resize-none focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-colors"
                      />
                    </motion.div>

                    {/* Submit button */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.75, duration: 0.4 }}
                    >
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSubmit}
                        disabled={selectedRating === 0 || submitting}
                        className="w-full bg-white text-amber-700 font-semibold rounded-2xl py-4 text-base shadow-lg shadow-black/10 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        {submitting ? (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center justify-center gap-2"
                          >
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              className="inline-block w-5 h-5 border-2 border-amber-700/30 border-t-amber-700 rounded-full"
                            />
                            Envoi en cours...
                          </motion.span>
                        ) : (
                          'Envoyer mon avis'
                        )}
                      </motion.button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

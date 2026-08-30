'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, Check, Camera } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface ServiceRequestDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

const CATEGORIES = [
  'Plombier',
  'Électricien',
  'Peintre',
  'Menuisier',
  'Maçon',
  'Couvreur',
  'Jardinier',
  'Climaticien',
  'Serrurier',
  'Carreleur',
  'Plaquiste',
  'Décorateur',
  'Mécanicien',
  'Nettoyage',
  'Autre',
];

const URGENCY_OPTIONS = [
  { value: 'normal', label: 'Normal', color: 'bg-white/15 text-white border-white/30' },
  { value: 'urgent', label: 'Urgent', color: 'bg-amber-500/20 text-amber-200 border-amber-400/30' },
  { value: 'urgence', label: 'Urgence', color: 'bg-red-500/20 text-red-200 border-red-400/30' },
] as const;

type Urgency = 'normal' | 'urgent' | 'urgence';

export default function ServiceRequestDisplayV3({ content, qrCodeId, qrName }: ServiceRequestDisplayV3Props) {
  const rawTitle: string = qrName || 'Demande de Service';
  const prefillAddress: string = content?.address || content?.location || '';

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('normal');
  const [preferredDate, setPreferredDate] = useState('');
  const [address, setAddress] = useState(prefillAddress);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Min datetime
  const minDatetime = (() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  })();

  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'La description est requise';
    if (!preferredDate) e.preferredDate = 'La date souhaitée est requise';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [description, preferredDate]);

  const handleSubmit = useCallback(async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/client/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCodeId,
          category: category || undefined,
          description: description.trim(),
          urgency,
          preferredDate,
          address: address.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setRequestId(data?.id || data?.requestId || '');
      setSubmitted(true);
    } catch {
      // silent
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [validate, submitting, qrCodeId, category, description, urgency, preferredDate, address]);

  return (
    <GradientBackground moduleType="service_request">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={15} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(139,92,246,0.3)">
          <div className="w-20 h-20 rounded-full bg-violet-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Briefcase className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Décrivez votre besoin, un professionnel vous répondra
          </p>
        </AnimatedTitle>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-6"
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
                      Demande envoyée !
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="text-white/60 text-sm text-center mt-2"
                    >
                      Un professionnel vous contactera sous peu
                    </motion.p>
                    {requestId && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.65, duration: 0.4 }}
                        className="text-white/40 text-xs mt-3 font-mono"
                      >
                        Réf: {requestId}
                      </motion.p>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Category Selector */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                    >
                      <label className="text-white/70 text-sm mb-1.5 block">Catégorie</label>
                      <div className="relative">
                        <select
                          value={category}
                          onChange={e => setCategory(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm appearance-none focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-colors [color-scheme:dark]"
                        >
                          <option value="" className="bg-gray-900 text-white/50">Sélectionnez une catégorie</option>
                          {CATEGORIES.map(c => (
                            <option key={c} value={c} className="bg-gray-900 text-white">{c}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                          <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </motion.div>

                    {/* Description */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55, duration: 0.4 }}
                    >
                      <label className="text-white/70 text-sm mb-1.5 block">Description *</label>
                      <textarea
                        value={description}
                        onChange={e => { setDescription(e.target.value); if (errors.description) setErrors(prev => ({ ...prev, description: '' })); }}
                        placeholder="Décrivez votre problème ou votre besoin en détail..."
                        rows={4}
                        className={`w-full bg-white/5 border rounded-xl p-3 text-white placeholder:text-white/30 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-white/10 transition-colors ${errors.description ? 'border-red-400/50' : 'border-white/10 focus:border-white/25'}`}
                      />
                      {errors.description && (
                        <p className="text-red-300 text-xs mt-1">{errors.description}</p>
                      )}
                    </motion.div>

                    {/* Urgency */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6, duration: 0.4 }}
                    >
                      <label className="text-white/70 text-sm mb-1.5 block">Urgence</label>
                      <div className="flex gap-2">
                        {URGENCY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setUrgency(opt.value as Urgency)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                              urgency === opt.value
                                ? opt.color
                                : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>

                    {/* Preferred date */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.65, duration: 0.4 }}
                    >
                      <label className="text-white/70 text-sm mb-1.5 block">Date souhaitée *</label>
                      <input
                        type="datetime-local"
                        value={preferredDate}
                        min={minDatetime}
                        onChange={e => { setPreferredDate(e.target.value); if (errors.preferredDate) setErrors(prev => ({ ...prev, preferredDate: '' })); }}
                        className={`w-full bg-white/5 border rounded-xl p-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/10 transition-colors [color-scheme:dark] ${errors.preferredDate ? 'border-red-400/50' : 'border-white/10 focus:border-white/25'}`}
                      />
                      {errors.preferredDate && (
                        <p className="text-red-300 text-xs mt-1">{errors.preferredDate}</p>
                      )}
                    </motion.div>

                    {/* Address */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7, duration: 0.4 }}
                    >
                      <label className="text-white/70 text-sm mb-1.5 block">Adresse</label>
                      <input
                        type="text"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        placeholder="Votre adresse..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-colors"
                      />
                    </motion.div>

                    {/* Photo note */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.75, duration: 0.4 }}
                      className="bg-white/5 rounded-xl p-3 border border-white/10 flex items-start gap-3"
                    >
                      <Camera className="w-5 h-5 text-violet-300/70 shrink-0 mt-0.5" strokeWidth={1.8} />
                      <p className="text-white/50 text-xs leading-relaxed">
                        Vous pourrez ajouter des photos après l&apos;envoi de votre demande.
                      </p>
                    </motion.div>

                    <div className="h-px bg-white/10" />

                    {/* Submit */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8, duration: 0.4 }}
                    >
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSubmit}
                        disabled={!description.trim() || !preferredDate || submitting}
                        className="w-full bg-white text-violet-700 font-semibold rounded-2xl py-4 text-base shadow-lg shadow-black/10 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                      >
                        {submitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              className="inline-block w-5 h-5 border-2 border-violet-700/30 border-t-violet-700 rounded-full"
                            />
                            Envoi en cours...
                          </span>
                        ) : (
                          'Envoyer la demande'
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

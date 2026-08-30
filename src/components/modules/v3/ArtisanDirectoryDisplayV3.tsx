'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, MapPin, Star, ShieldCheck, Users, BadgeCheck, MessageSquare, X } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface ArtisanDirectoryDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

interface Professional {
  id: string;
  name: string;
  category: string;
  rating?: number;
  location?: string;
  isVerified?: boolean;
  [key: string]: any;
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
  'Electricien',
  'Mecanicien',
  'Nettoyage',
];

export default function ArtisanDirectoryDisplayV3({ content, qrCodeId, qrName }: ArtisanDirectoryDisplayV3Props) {
  const homeId = content?.homeId || content?.id || '';
  const rawTitle: string = qrName || 'Annuaire Artisans';

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPro, setSelectedPro] = useState<Professional | null>(null);
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formUrgency, setFormUrgency] = useState<'normal' | 'urgent' | 'urgence'>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Fetch professionals
  useEffect(() => {
    if (!homeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/client/professionals?homeId=${encodeURIComponent(homeId)}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) {
          setProfessionals(Array.isArray(data) ? data : data?.professionals ?? []);
        }
      } catch {
        if (!cancelled) setProfessionals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [homeId]);

  // Computed stats
  const totalArtisans = professionals.length;
  const verifiedCount = professionals.filter(p => p.isVerified).length;
  const categories = useMemo(
    () => [...new Set(professionals.map(p => p.category).filter(Boolean))],
    [professionals]
  );
  const categoryCount = categories.length;

  // Filter by category
  const filtered = useMemo(() => {
    if (!activeCategory) return professionals;
    return professionals.filter(p => p.category === activeCategory);
  }, [professionals, activeCategory]);

  // Open contact dialog
  const openContact = useCallback((pro: Professional) => {
    setSelectedPro(pro);
    setFormDescription('');
    setFormDate('');
    setFormUrgency('normal');
    setRequestSuccess(false);
    setDialogOpen(true);
  }, []);

  // Submit service request
  const handleSubmitRequest = useCallback(async () => {
    if (!selectedPro || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/client/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalId: selectedPro.id,
          professionalName: selectedPro.name,
          description: formDescription,
          preferredDate: formDate || null,
          urgency: formUrgency,
          homeId,
          qrCodeId,
        }),
      });
      setRequestSuccess(true);
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }, [selectedPro, submitting, formDescription, formDate, formUrgency, homeId, qrCodeId]);

  // Render star rating
  const renderStars = (rating?: number) => {
    const r = rating ?? 0;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(s => (
          <Star
            key={s}
            className={`w-3.5 h-3.5 ${s <= Math.round(r) ? 'text-amber-300 fill-amber-300' : 'text-white/20'}`}
            strokeWidth={1.5}
          />
        ))}
        {r > 0 && <span className="text-white/50 text-xs ml-1">{r.toFixed(1)}</span>}
      </div>
    );
  };

  // Get min datetime for date input
  const minDatetime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }, []);

  return (
    <GradientBackground moduleType="artisan_directory">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={15} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(20,184,166,0.3)">
          <div className="w-20 h-20 rounded-full bg-teal-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Store className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Trouvez les meilleurs professionnels près de chez vous
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
              {/* 3 Stat Badges */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="flex items-stretch gap-3 mb-5"
              >
                <div className="flex-1 bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 border border-white/10">
                  <Users className="w-5 h-5 text-white/80" strokeWidth={1.8} />
                  <span className="text-2xl font-bold text-white">{totalArtisans}</span>
                  <span className="text-[10px] sm:text-xs text-white/60 font-medium leading-tight text-center">Artisans</span>
                </div>
                <div className="flex-1 bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 border border-white/10">
                  <BadgeCheck className="w-5 h-5 text-teal-200" strokeWidth={1.8} />
                  <span className="text-2xl font-bold text-teal-100">{verifiedCount}</span>
                  <span className="text-[10px] sm:text-xs text-white/60 font-medium leading-tight text-center">Vérifiés</span>
                </div>
                <div className="flex-1 bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 border border-white/10">
                  <Store className="w-5 h-5 text-teal-200" strokeWidth={1.8} />
                  <span className="text-2xl font-bold text-teal-100">{categoryCount}</span>
                  <span className="text-[10px] sm:text-xs text-white/60 font-medium leading-tight text-center">Catégories</span>
                </div>
              </motion.div>

              <div className="h-px bg-white/10 mb-4" />

              {/* Category filter chips */}
              {categories.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="mb-4"
                >
                  <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar -mx-1 px-1">
                    <button
                      type="button"
                      onClick={() => setActiveCategory(null)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        activeCategory === null
                          ? 'bg-white/20 text-white border-white/30'
                          : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      Tous
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          activeCategory === cat
                            ? 'bg-white/20 text-white border-white/30'
                            : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Professional List or Loading / Empty */}
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full mb-3"
                  />
                  <p className="text-white/50 text-sm">Chargement des artisans…</p>
                </div>
              ) : filtered.length > 0 ? (
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar space-y-3">
                    {filtered.map((pro, i) => (
                      <motion.div
                        key={pro.id ?? i}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 * i, duration: 0.4, ease: 'easeOut' }}
                        className="bg-white/5 rounded-xl p-4 border border-white/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-white font-semibold text-base truncate">
                                {pro.name || 'Sans nom'}
                              </h3>
                              {pro.isVerified && (
                                <ShieldCheck className="w-4 h-4 text-teal-300 shrink-0" strokeWidth={2} fill="rgba(94,234,212,0.2)" />
                              )}
                            </div>
                            {pro.category && (
                              <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-200 text-[10px] font-medium border border-teal-400/20">
                                {pro.category}
                              </span>
                            )}
                            <div className="mt-2 space-y-1">
                              {renderStars(pro.rating)}
                              {pro.location && (
                                <div className="flex items-center gap-1 text-white/50 text-xs">
                                  <MapPin className="w-3 h-3" strokeWidth={1.8} />
                                  <span>{pro.location}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => openContact(pro)}
                            className="w-full bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
                          >
                            <MessageSquare className="w-4 h-4" strokeWidth={1.8} />
                            Contacter
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
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
                    <Store className="w-10 h-10 text-white/30" strokeWidth={1.5} />
                  </motion.div>
                  <p className="text-white/50 text-base">Aucun artisan enregistré</p>
                </motion.div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Service Request Dialog */}
      <AnimatePresence>
        {dialogOpen && selectedPro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDialogOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative z-10 w-full max-w-md bg-gray-900/95 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            >
              {/* Dialog header */}
              <div className="flex items-center justify-between p-5 pb-0">
                <div>
                  <h3 className="text-white font-bold text-lg">Demander un service</h3>
                  <p className="text-white/60 text-sm mt-0.5">à {selectedPro.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5">
                <AnimatePresence mode="wait">
                  {requestSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="py-6 flex flex-col items-center"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200 }}
                        className="w-16 h-16 rounded-full bg-teal-500/20 flex items-center justify-center mb-4"
                      >
                        <ShieldCheck className="w-8 h-8 text-teal-300" strokeWidth={2} />
                      </motion.div>
                      <p className="text-white font-bold text-lg">Demande envoyée !</p>
                      <p className="text-white/60 text-sm mt-1">Le professionnel vous contactera bientôt</p>
                      <button
                        type="button"
                        onClick={() => setDialogOpen(false)}
                        className="mt-5 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
                      >
                        Fermer
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      {/* Description */}
                      <div>
                        <label className="text-white/70 text-sm mb-1.5 block">Description du besoin *</label>
                        <textarea
                          value={formDescription}
                          onChange={e => setFormDescription(e.target.value)}
                          placeholder="Décrivez votre problème ou besoin..."
                          rows={3}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder:text-white/30 text-sm resize-none focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-colors"
                        />
                      </div>

                      {/* Preferred date */}
                      <div>
                        <label className="text-white/70 text-sm mb-1.5 block">Date souhaitée</label>
                        <input
                          type="datetime-local"
                          value={formDate}
                          min={minDatetime}
                          onChange={e => setFormDate(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-colors [color-scheme:dark]"
                        />
                      </div>

                      {/* Urgency */}
                      <div>
                        <label className="text-white/70 text-sm mb-1.5 block">Urgence</label>
                        <div className="flex gap-2">
                          {([['normal', 'Normal'], ['urgent', 'Urgent'], ['urgence', 'Urgence']] as const).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setFormUrgency(val)}
                              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                                formUrgency === val
                                  ? val === 'urgence'
                                    ? 'bg-red-500/20 text-red-200 border-red-400/30'
                                    : val === 'urgent'
                                      ? 'bg-amber-500/20 text-amber-200 border-amber-400/30'
                                      : 'bg-white/15 text-white border-white/30'
                                  : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Submit */}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSubmitRequest}
                        disabled={!formDescription.trim() || submitting}
                        className="w-full bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-xl py-3.5 text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {submitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                              className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                            />
                            Envoi…
                          </span>
                        ) : (
                          'Envoyer la demande'
                        )}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, CheckCircle, Check, Loader2, Sparkles } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface PricingDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  isFeatured: boolean;
}

const STAT_BADGES = ['3 plans disponibles', 'Sans engagement', 'Annulez à tout moment'];

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'EUR' }).format(price);
}

export default function PricingDisplayV3({ content, qrCodeId, qrName }: PricingDisplayV3Props) {
  const rawTitle: string = qrName || 'Plans & Tarifs';
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch('/api/client/billing/plans');
        if (res.ok) {
          const data = await res.json();
          setPlans(data.plans || []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  const handleSubscribe = useCallback(async (planId: string) => {
    if (subscribing) return;
    setSubscribing(planId);
    try {
      const res = await fetch('/api/client/billing/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriberId: content.subscriberId || 'anonymous',
          subscriberType: content.subscriberType || 'professional',
          planId,
        }),
      });
      if (res.ok) {
        setSubscribed(planId);
      }
    } catch {
      // silent
    } finally {
      setSubscribing(null);
    }
  }, [subscribing, content.subscriberId, content.subscriberType]);

  return (
    <GradientBackground moduleType="pricing">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={15} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(5,150,105,0.3)">
          <div className="w-20 h-20 rounded-full bg-emerald-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Crown className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Choisissez le plan adapté à vos besoins
          </p>
        </AnimatedTitle>

        {/* Stat badges */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-wrap justify-center gap-2 mt-4"
        >
          {STAT_BADGES.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 px-3 py-1 text-xs font-medium text-white/80"
            >
              <Sparkles className="h-3 w-3 text-emerald-300" />
              {badge}
            </span>
          ))}
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-2xl mt-6"
        >
          <GlassCard>
            <div className="p-5 sm:p-6">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-12"
                  >
                    <Loader2 className="h-8 w-8 text-white/60 animate-spin" />
                    <p className="text-white/50 text-sm mt-3">Chargement des plans...</p>
                  </motion.div>
                ) : subscribed ? (
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
                      Abonnement confirmé !
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="text-white/60 text-sm text-center mt-2"
                    >
                      Bienvenue dans votre nouveau plan
                    </motion.p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="plans"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Pricing Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {plans.map((plan, idx) => (
                        <motion.div
                          key={plan.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.5 + idx * 0.15, duration: 0.5 }}
                          className={`relative rounded-2xl p-5 flex flex-col ${
                            plan.isFeatured
                              ? 'bg-white/15 border-2 border-emerald-400/50 shadow-lg shadow-emerald-500/10'
                              : 'bg-white/5 border border-white/10'
                          }`}
                        >
                          {plan.isFeatured && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/90 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950">
                                <Crown className="h-3 w-3" />
                                Populaire
                              </span>
                            </div>
                          )}
                          <h3 className="text-lg font-bold text-white mt-1">{plan.name}</h3>
                          <div className="mt-3 mb-4">
                            <span className="text-3xl font-extrabold text-white">
                              {formatPrice(plan.price, plan.currency)}
                            </span>
                            {plan.interval && (
                              <span className="text-white/50 text-sm ml-1">/{plan.interval}</span>
                            )}
                          </div>
                          <ul className="space-y-2.5 flex-1 mb-5">
                            {plan.features.map((feature) => (
                              <li key={feature} className="flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-emerald-300 shrink-0 mt-0.5" strokeWidth={2} />
                                <span className="text-white/75 text-sm leading-snug">{feature}</span>
                              </li>
                            ))}
                          </ul>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleSubscribe(plan.id)}
                            disabled={!!subscribing}
                            className={`w-full font-semibold rounded-2xl py-3.5 text-sm transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
                              plan.isFeatured
                                ? 'bg-white text-emerald-700 shadow-black/10 hover:bg-emerald-50'
                                : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                            }`}
                          >
                            {subscribing === plan.id ? (
                              <span className="flex items-center justify-center gap-2">
                                <motion.span
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                  className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full"
                                />
                                En cours...
                              </span>
                            ) : (
                              "S'abonner"
                            )}
                          </motion.button>
                        </motion.div>
                      ))}
                    </div>
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

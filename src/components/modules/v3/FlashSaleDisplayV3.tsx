'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Zap, MapPin, Clock, Image as ImageIcon, Flame } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface FlashSaleDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

interface FlashSale {
  id: string;
  title: string;
  description?: string;
  originalPrice?: number;
  flashPrice?: number;
  maxRedemptions?: number;
  currentRedemptions?: number;
  startsAt?: string;
  endsAt?: string;
  image?: string;
  geofenceRequired?: boolean;
  [key: string]: any;
}

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(endsAt: string): TimeLeft | null {
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return null;
  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

function TimeDisplay({ time, label }: { time: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-xl bg-white/15 backdrop-blur-sm border border-white/10 flex items-center justify-center">
        <span className="text-xl sm:text-2xl font-bold text-white tabular-nums">
          {String(time).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] text-white/50 mt-1 font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function FlashSaleDisplayV3({ content, qrCodeId, qrName }: FlashSaleDisplayV3Props) {
  const homeId = content?.homeId || content?.id || '';

  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Fetch active flash sales
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/client/flash-sales?status=active&homeId=${encodeURIComponent(homeId)}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) {
          setFlashSales(Array.isArray(data) ? data : data?.flashSales ?? []);
        }
      } catch {
        if (!cancelled) setFlashSales([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [homeId]);

  // Countdown timer tick every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Redeem handler (placeholder)
  const handleRedeem = useCallback(async (sale: FlashSale) => {
    try {
      await fetch('/api/client/flash-sales/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flashSaleId: sale.id, qrCodeId }),
      });
    } catch {
      // silent
    }
  }, [qrCodeId]);

  // Get progress percentage
  const getProgress = (sale: FlashSale) => {
    if (!sale.maxRedemptions || sale.maxRedemptions <= 0) return 0;
    return Math.min(100, ((sale.currentRedemptions ?? 0) / sale.maxRedemptions) * 100);
  };

  // Get discount percentage
  const getDiscountPercent = (sale: FlashSale) => {
    if (!sale.originalPrice || !sale.flashPrice || sale.originalPrice <= 0) return 0;
    return Math.round(((sale.originalPrice - sale.flashPrice) / sale.originalPrice) * 100);
  };

  // Filter only still-active sales (endsAt > now)
  const activeSales = flashSales.filter(s => {
    if (!s.endsAt) return true;
    return new Date(s.endsAt).getTime() > Date.now();
  });

  // Re-read tick so it's used (triggers re-render for countdown)
  void tick;

  return (
    <GradientBackground moduleType="flash_sale">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={15} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(234,88,12,0.3)">
          <div className="w-20 h-20 rounded-full bg-orange-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Zap className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            Ventes Flash
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Offres limitées — ne les manquez pas !
          </p>
        </AnimatedTitle>

        {/* Flash Sale Cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-6 space-y-4"
        >
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full mb-3"
              />
              <p className="text-white/50 text-sm">Chargement des ventes flash…</p>
            </div>
          ) : activeSales.length > 0 ? (
            activeSales.map((sale, i) => {
              const timeLeft = sale.endsAt ? getTimeLeft(sale.endsAt) : null;
              const progress = getProgress(sale);
              const discount = getDiscountPercent(sale);
              const isSoldOut = sale.maxRedemptions
                ? (sale.currentRedemptions ?? 0) >= sale.maxRedemptions
                : false;

              return (
                <motion.div
                  key={sale.id ?? i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i, duration: 0.4, ease: 'easeOut' }}
                >
                  <GlassCard>
                    <div className="p-4 sm:p-5">
                      {/* Image / Placeholder */}
                      <div className="w-full h-36 sm:h-44 rounded-2xl bg-white/5 border border-white/10 overflow-hidden mb-4 flex items-center justify-center">
                        {sale.image ? (
                          <img
                            src={sale.image}
                            alt={sale.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-12 h-12 text-white/15" strokeWidth={1.2} />
                        )}
                      </div>

                      {/* Title + Discount badge */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-white font-bold text-base sm:text-lg truncate flex-1">
                          {sale.title}
                        </h3>
                        {discount > 0 && (
                          <span className="shrink-0 px-2.5 py-1 rounded-full bg-orange-400/20 text-orange-200 text-xs font-bold border border-orange-300/20">
                            -{discount}%
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {sale.description && (
                        <p className="text-white/50 text-xs sm:text-sm line-clamp-2 mb-3">
                          {sale.description}
                        </p>
                      )}

                      {/* Geofence indicator */}
                      {sale.geofenceRequired && (
                        <div className="flex items-center gap-1.5 text-orange-200/60 text-xs mb-3">
                          <MapPin className="w-3.5 h-3.5" strokeWidth={1.8} />
                          <span>Présence sur place requise</span>
                        </div>
                      )}

                      {/* Prices */}
                      <div className="flex items-baseline gap-3 mb-4">
                        {sale.originalPrice != null && (
                          <span className="text-white/40 text-sm line-through">
                            {sale.originalPrice.toFixed(2)} €
                          </span>
                        )}
                        {sale.flashPrice != null && (
                          <span className="text-2xl sm:text-3xl font-extrabold text-white">
                            {sale.flashPrice.toFixed(2)} €
                          </span>
                        )}
                      </div>

                      {/* Countdown Timer */}
                      {timeLeft && (
                        <div className="mb-4">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Clock className="w-3.5 h-3.5 text-orange-200" strokeWidth={1.8} />
                            <span className="text-white/60 text-xs font-medium">Se termine dans</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TimeDisplay time={timeLeft.hours} label="Heures" />
                            <span className="text-white/40 text-xl font-bold mt-[-12px]">:</span>
                            <TimeDisplay time={timeLeft.minutes} label="Minutes" />
                            <span className="text-white/40 text-xl font-bold mt-[-12px]">:</span>
                            <TimeDisplay time={timeLeft.seconds} label="Secondes" />
                          </div>
                        </div>
                      )}

                      {/* Progress bar */}
                      {sale.maxRedemptions != null && sale.maxRedemptions > 0 && (
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-white/50">
                              {sale.currentRedemptions ?? 0} / {sale.maxRedemptions} récupérés
                            </span>
                            <span className="text-white/50 font-medium">{Math.round(progress)}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ duration: 0.8, delay: 0.1 * i, ease: 'easeOut' }}
                              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300"
                            />
                          </div>
                        </div>
                      )}

                      {/* Redeem Button */}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleRedeem(sale)}
                        disabled={isSoldOut}
                        className={`w-full font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition-colors shadow-lg ${
                          isSoldOut
                            ? 'bg-white/10 text-white/30 cursor-not-allowed'
                            : 'bg-white/20 hover:bg-white/30 text-white'
                        }`}
                      >
                        <Flame className="w-4 h-4" strokeWidth={1.8} />
                        {isSoldOut ? 'Épuisé' : 'Récupérer'}
                      </motion.button>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })
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
                <Clock className="w-10 h-10 text-white/30" strokeWidth={1.5} />
              </motion.div>
              <p className="text-white/50 text-base">Aucune vente flash active</p>
              <p className="text-white/30 text-sm mt-1">Revenez bientôt pour de nouvelles offres</p>
            </motion.div>
          )}
        </motion.div>
      </div>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Ticket, Copy, Check, Calendar, Clock, Tag } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface CouponDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

interface Coupon {
  id: string;
  merchantId?: string;
  merchantName?: string;
  code: string;
  discount?: string;
  discountType?: 'percentage' | 'fixed';
  validFrom?: string;
  validUntil?: string;
  status?: 'active' | 'used' | 'expired';
  description?: string;
  [key: string]: any;
}

type TabKey = 'active' | 'used' | 'expired';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Actifs' },
  { key: 'used', label: 'Utilisés' },
  { key: 'expired', label: 'Expirés' },
];

// Simple QR code placeholder as a grid pattern
function QrPlaceholder({ size = 64 }: { size?: number }) {
  // Generate a deterministic 7x7 pattern grid
  const pattern = [
    [1,1,1,0,1,1,1],
    [1,0,1,1,1,0,1],
    [1,1,1,0,1,1,1],
    [0,1,0,1,0,1,0],
    [1,1,1,0,1,1,1],
    [1,0,1,1,1,0,1],
    [1,1,1,0,1,1,1],
  ];

  const cellSize = size / 7;

  return (
    <div
      className="bg-white rounded-lg p-1 shrink-0"
      style={{ width: size + 8, height: size + 8 }}
    >
      <div className="grid grid-cols-7 gap-[1px]" style={{ width: size, height: size }}>
        {pattern.flat().map((cell, idx) => (
          <div
            key={idx}
            className={`rounded-[1px] ${cell ? 'bg-gray-800' : 'bg-white'}`}
            style={{ width: cellSize - 1, height: cellSize - 1 }}
          />
        ))}
      </div>
    </div>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CouponDisplayV3({ content, qrCodeId, qrName }: CouponDisplayV3Props) {
  const homeId = content?.homeId || content?.id || '';

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch coupons
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/client/coupons?homeId=${encodeURIComponent(homeId)}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) {
          setCoupons(Array.isArray(data) ? data : data?.coupons ?? []);
        }
      } catch {
        if (!cancelled) setCoupons([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [homeId]);

  // Copy code to clipboard
  const copyCode = useCallback(async (coupon: Coupon) => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopiedId(coupon.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // silent
    }
  }, []);

  // Filter coupons by tab
  const filtered = coupons.filter(c => {
    const s = c.status || 'active';
    if (activeTab === 'active') return s === 'active';
    if (activeTab === 'used') return s === 'used';
    return s === 'expired';
  });

  // Status badge config
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return { label: 'Actif', className: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/20' };
      case 'used':
        return { label: 'Utilisé', className: 'bg-white/10 text-white/40 border-white/10' };
      case 'expired':
        return { label: 'Expiré', className: 'bg-red-500/15 text-red-300 border-red-400/15' };
      default:
        return { label: 'Actif', className: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/20' };
    }
  };

  // Discount display
  const getDiscountLabel = (coupon: Coupon) => {
    if (coupon.discount) return coupon.discount;
    if (coupon.discountType === 'percentage') return 'Réduction';
    return 'Offre';
  };

  return (
    <GradientBackground moduleType="coupon">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={15} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(5,150,105,0.3)">
          <div className="w-20 h-20 rounded-full bg-emerald-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Ticket className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            Mes Coupons
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Vos offres et réductions à utiliser
          </p>
        </AnimatedTitle>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="flex gap-2 mt-6 bg-white/5 backdrop-blur-xl rounded-2xl p-1 border border-white/10"
        >
          {TABS.map(tab => {
            const count = coupons.filter(c => {
              const s = c.status || 'active';
              if (tab.key === 'active') return s === 'active';
              if (tab.key === 'used') return s === 'used';
              return s === 'expired';
            }).length;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key
                      ? 'bg-white/20 text-white'
                      : 'bg-white/10 text-white/40'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>

        {/* Coupon List */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-5 space-y-3"
        >
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full mb-3"
              />
              <p className="text-white/50 text-sm">Chargement des coupons…</p>
            </div>
          ) : filtered.length > 0 ? (
            filtered.map((coupon, i) => {
              const statusBadge = getStatusBadge(coupon.status);
              const isCopied = copiedId === coupon.id;
              const isInactive = coupon.status === 'used' || coupon.status === 'expired';

              return (
                <motion.div
                  key={coupon.id ?? i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i, duration: 0.4, ease: 'easeOut' }}
                  className={`relative ${isInactive ? 'opacity-60' : ''}`}
                >
                  {/* Ticket-style card with dashed border and torn edge effect */}
                  <div className="bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/15 overflow-hidden">
                    {/* Torn edge top (circle cutouts) */}
                    <div className="relative">
                      <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#10b981]" />
                      <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#10b981]" />

                      <div className="p-4 sm:p-5 border-r-0">
                        {/* Top row: Merchant + Status badge */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-white/60 text-xs mb-0.5">Commerce</p>
                            <h3 className="text-white font-semibold text-sm sm:text-base truncate">
                              {coupon.merchantName || 'Commerce'}
                            </h3>
                          </div>
                          <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.className}`}>
                            {statusBadge.label}
                          </span>
                        </div>

                        {/* Discount highlight */}
                        <div className="bg-white/5 rounded-xl p-3 mb-3 border border-white/10 border-dashed">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Tag className="w-5 h-5 text-emerald-300" strokeWidth={1.8} />
                              <span className="text-xl sm:text-2xl font-extrabold text-white">
                                {getDiscountLabel(coupon)}
                              </span>
                            </div>
                            <QrPlaceholder size={48} />
                          </div>
                        </div>

                        {/* Code + Copy */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1 bg-white/5 border border-dashed border-white/15 rounded-lg px-3 py-2 flex items-center justify-center">
                            <code className="text-white font-mono text-sm sm:text-base tracking-widest font-bold">
                              {coupon.code}
                            </code>
                          </div>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            onClick={() => copyCode(coupon)}
                            disabled={isInactive}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                              isCopied
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : isInactive
                                  ? 'bg-white/5 text-white/20 cursor-not-allowed'
                                  : 'bg-white/10 hover:bg-white/20 text-white'
                            }`}
                          >
                            {isCopied ? (
                              <Check className="w-4 h-4" strokeWidth={2} />
                            ) : (
                              <Copy className="w-4 h-4" strokeWidth={1.8} />
                            )}
                          </motion.button>
                        </div>

                        {/* Validity dates */}
                        <div className="flex items-center gap-4 text-white/40 text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" strokeWidth={1.8} />
                            <span>Du {formatDate(coupon.validFrom)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" strokeWidth={1.8} />
                            <span>Jusqu'au {formatDate(coupon.validUntil)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
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
                <Ticket className="w-10 h-10 text-white/30" strokeWidth={1.5} />
              </motion.div>
              <p className="text-white/50 text-base">
                {activeTab === 'active'
                  ? 'Aucun coupon actif'
                  : activeTab === 'used'
                    ? 'Aucun coupon utilisé'
                    : 'Aucun coupon expiré'}
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

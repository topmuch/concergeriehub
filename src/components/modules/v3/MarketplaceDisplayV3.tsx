'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Search,
  MapPin,
  Star,
  Phone,
  X,
  Clock,
  Image as ImageIcon,
  Tag,
  Store,
} from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface MarketplaceDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

interface Merchant {
  id: string;
  name: string;
  category?: string;
  rating?: number;
  address?: string;
  phone?: string;
  description?: string;
  logo?: string;
  openingHours?: string;
  [key: string]: any;
}

interface Promo {
  id: string;
  merchantId: string;
  title: string;
  description?: string;
  discount?: string;
  validUntil?: string;
  [key: string]: any;
}

const CATEGORIES = [
  'Tous',
  'Boulangerie',
  'Boucherie',
  'Épicerie',
  'Pharmacie',
  'Restauration',
  'Beauté',
  'Autre',
];

export default function MarketplaceDisplayV3({ content, qrCodeId, qrName }: MarketplaceDisplayV3Props) {
  const homeId = content?.homeId || content?.id || '';

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Tous');
  const [expandedMerchant, setExpandedMerchant] = useState<Merchant | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  // Fetch merchants
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/client/merchants?homeId=${encodeURIComponent(homeId)}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) {
          setMerchants(Array.isArray(data) ? data : data?.merchants ?? []);
        }
      } catch {
        if (!cancelled) setMerchants([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [homeId]);

  // Fetch promos
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/client/promos?homeId=${encodeURIComponent(homeId)}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) {
          setPromos(Array.isArray(data) ? data : data?.promos ?? []);
        }
      } catch {
        if (!cancelled) setPromos([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [homeId]);

  // Filter merchants
  const filtered = useMemo(() => {
    let result = merchants;
    if (activeCategory !== 'Tous') {
      result = result.filter(m => m.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => m.name?.toLowerCase().includes(q));
    }
    return result;
  }, [merchants, activeCategory, searchQuery]);

  // Get promos for a merchant
  const getMerchantPromos = useCallback(
    (merchantId: string) => promos.filter(p => p.merchantId === merchantId),
    [promos]
  );

  // Expand merchant
  const toggleExpand = useCallback((merchant: Merchant) => {
    if (expandedMerchant?.id === merchant.id) {
      setExpandedMerchant(null);
    } else {
      setExpandedMerchant(merchant);
      setPhotoIndex(0);
    }
  }, [expandedMerchant]);

  // Render stars
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

  return (
    <GradientBackground moduleType="marketplace">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={15} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(225,29,72,0.3)">
          <div className="w-20 h-20 rounded-full bg-rose-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <ShoppingBag className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            Marketplace Quartier
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Découvrez les commerces près de chez vous
          </p>
        </AnimatedTitle>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="w-full max-w-2xl mt-6"
        >
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-white/40" strokeWidth={1.8} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher un commerce..."
              className="w-full bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl pl-11 pr-4 py-3 text-white placeholder:text-white/35 text-sm focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-colors"
            />
          </div>
        </motion.div>

        {/* Category chips */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="w-full max-w-2xl mt-4"
        >
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar -mx-1 px-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
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

        {/* Merchant Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-2xl mt-5"
        >
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full mb-3"
              />
              <p className="text-white/50 text-sm">Chargement des commerces…</p>
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {filtered.map((merchant, i) => {
                const isExpanded = expandedMerchant?.id === merchant.id;
                const merchantPromos = getMerchantPromos(merchant.id);
                const photos = merchant.photos || (merchant.logo ? [merchant.logo] : []);

                return (
                  <motion.div
                    key={merchant.id ?? i}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 * i, duration: 0.4, ease: 'easeOut' }}
                    className={isExpanded ? 'col-span-2 md:col-span-3' : ''}
                  >
                    <GlassCard>
                      <div className="p-4">
                        {/* Card Header */}
                        <div className="flex items-start gap-3">
                          {/* Logo placeholder */}
                          <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                            {merchant.logo ? (
                              <img
                                src={merchant.logo}
                                alt={merchant.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Store className="w-6 h-6 text-white/40" strokeWidth={1.5} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-semibold text-sm truncate">
                              {merchant.name || 'Sans nom'}
                            </h3>
                            {merchant.category && (
                              <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-200 text-[10px] font-medium border border-rose-400/20">
                                {merchant.category}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rating */}
                        <div className="mt-3">{renderStars(merchant.rating)}</div>

                        {/* Address & Phone */}
                        <div className="mt-2 space-y-1">
                          {merchant.address && (
                            <div className="flex items-center gap-1.5 text-white/50 text-xs">
                              <MapPin className="w-3 h-3 shrink-0" strokeWidth={1.8} />
                              <span className="truncate">{merchant.address}</span>
                            </div>
                          )}
                          {merchant.phone && (
                            <div className="flex items-center gap-1.5 text-white/50 text-xs">
                              <Phone className="w-3 h-3 shrink-0" strokeWidth={1.8} />
                              <span>{merchant.phone}</span>
                            </div>
                          )}
                        </div>

                        {/* Voir button */}
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => toggleExpand(merchant)}
                          className="w-full mt-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl py-2.5 text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
                        >
                          {isExpanded ? (
                            <>
                              <X className="w-4 h-4" strokeWidth={1.8} />
                              Fermer
                            </>
                          ) : (
                            'Voir'
                          )}
                        </motion.button>

                        {/* Expanded Content */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <div className="h-px bg-white/10 my-4" />

                              {/* Description */}
                              {merchant.description && (
                                <p className="text-white/70 text-sm leading-relaxed">
                                  {merchant.description}
                                </p>
                              )}

                              {/* Opening Hours */}
                              {merchant.openingHours && (
                                <div className="mt-3 flex items-start gap-2">
                                  <Clock className="w-4 h-4 text-white/50 shrink-0 mt-0.5" strokeWidth={1.8} />
                                  <div className="text-white/70 text-sm">
                                    <p className="font-medium text-white/80 mb-1">Horaires d'ouverture</p>
                                    {merchant.openingHours.split('\n').map((line: string, idx: number) => (
                                      <p key={idx} className="text-white/50 text-xs">{line}</p>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Photos carousel */}
                              {photos.length > 0 && (
                                <div className="mt-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <ImageIcon className="w-4 h-4 text-white/50" strokeWidth={1.8} />
                                    <span className="text-white/70 text-sm font-medium">Photos</span>
                                  </div>
                                  <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                    {photos.map((photo: string, idx: number) => (
                                      <div
                                        key={idx}
                                        onClick={() => setPhotoIndex(idx)}
                                        className={`shrink-0 w-24 h-24 rounded-xl border-2 overflow-hidden cursor-pointer transition-colors ${
                                          photoIndex === idx ? 'border-white/40' : 'border-white/10'
                                        }`}
                                      >
                                        <img
                                          src={photo}
                                          alt={`Photo ${idx + 1}`}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-white/40 text-[10px] mt-1 text-center">
                                    {photoIndex + 1} / {photos.length}
                                  </p>
                                </div>
                              )}

                              {/* Active Promos */}
                              {merchantPromos.length > 0 && (
                                <div className="mt-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Tag className="w-4 h-4 text-rose-300" strokeWidth={1.8} />
                                    <span className="text-white/70 text-sm font-medium">Promotions actives</span>
                                  </div>
                                  <div className="space-y-2">
                                    {merchantPromos.map(promo => (
                                      <div
                                        key={promo.id}
                                        className="bg-rose-500/10 border border-rose-400/15 rounded-xl p-3"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-white font-medium text-sm truncate">
                                            {promo.title}
                                          </span>
                                          {promo.discount && (
                                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 text-[10px] font-bold">
                                              {promo.discount}
                                            </span>
                                          )}
                                        </div>
                                        {promo.description && (
                                          <p className="text-white/50 text-xs mt-1 line-clamp-2">
                                            {promo.description}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
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
                <ShoppingBag className="w-10 h-10 text-white/30" strokeWidth={1.5} />
              </motion.div>
              <p className="text-white/50 text-base">Aucun commerce trouvé</p>
            </motion.div>
          )}
        </motion.div>
      </div>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

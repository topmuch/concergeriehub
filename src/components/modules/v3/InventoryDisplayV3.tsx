'use client';

import { motion } from 'framer-motion';
import { Package, Clock, AlertTriangle, BoxIcon } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface InventoryDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'fresh':
      return 'bg-green-500/20 text-green-100 border border-green-400/30';
    case 'warning':
      return 'bg-yellow-500/20 text-yellow-100 border border-yellow-400/30';
    case 'critical':
      return 'bg-red-500/20 text-red-100 border border-red-400/30';
    case 'expired':
      return 'bg-gray-500/20 text-gray-300 border border-gray-400/30';
    default:
      return 'bg-white/10 text-white/70 border border-white/10';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'fresh':
      return 'Frais';
    case 'warning':
      return 'Bientôt périmé';
    case 'critical':
      return 'Urgent';
    case 'expired':
      return 'Expiré';
    default:
      return status;
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function InventoryDisplayV3({ content, qrCodeId, qrName }: InventoryDisplayV3Props) {
  const rawTitle: string = content?.title || 'Inventaire';
  const items: Record<string, any>[] = Array.isArray(content?.items)
    ? content.items
    : Array.isArray(content?.products)
      ? content.products
      : [];

  const totalProducts = items.length;
  const nearExpiryCount = items.filter(
    (item) => item.status === 'warning' || item.status === 'critical'
  ).length;
  const lowStockCount = items.filter(
    (item) =>
      item.status === 'warning' ||
      item.status === 'critical' ||
      (item.quantity !== undefined && item.minStock !== undefined && item.quantity <= item.minStock)
  ).length;

  return (
    <GradientBackground moduleType="inventory">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={15} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(220,38,38,0.3)">
          <div className="w-20 h-20 rounded-full bg-red-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-red-500/20">
            <Package className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
          <p className="text-white/60 text-center text-sm sm:text-base mt-1">
            Stock &amp; Dates Limite de Consommation
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
                {/* Total Products */}
                <div className="flex-1 bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 border border-white/10">
                  <BoxIcon className="w-5 h-5 text-white/80" strokeWidth={1.8} />
                  <span className="text-2xl font-bold text-white">{totalProducts}</span>
                  <span className="text-[10px] sm:text-xs text-white/60 font-medium leading-tight text-center">
                    Produits
                  </span>
                </div>
                {/* Near Expiry */}
                <div className="flex-1 bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 border border-white/10">
                  <AlertTriangle className="w-5 h-5 text-yellow-300" strokeWidth={1.8} />
                  <span className="text-2xl font-bold text-yellow-200">{nearExpiryCount}</span>
                  <span className="text-[10px] sm:text-xs text-white/60 font-medium leading-tight text-center">
                    Périm. bientôt
                  </span>
                </div>
                {/* Low Stock */}
                <div className="flex-1 bg-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 border border-white/10">
                  <Package className="w-5 h-5 text-orange-300" strokeWidth={1.8} />
                  <span className="text-2xl font-bold text-orange-200">{lowStockCount}</span>
                  <span className="text-[10px] sm:text-xs text-white/60 font-medium leading-tight text-center">
                    Stock bas
                  </span>
                </div>
              </motion.div>

              {/* Divider */}
              <div className="h-px bg-white/10 mb-4" />

              {/* Product List */}
              {items.length > 0 ? (
                <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                  <div className="max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar space-y-3">
                    {items.map((item, i) => (
                      <motion.div
                        key={item.id ?? item.name ?? i}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 * i, duration: 0.4, ease: 'easeOut' }}
                        className="bg-white/5 rounded-xl p-4 border border-white/10"
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Left: name + quantity */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-semibold text-base truncate">
                              {item.name || 'Sans nom'}
                            </h3>
                            <p className="text-white/60 text-sm mt-0.5">
                              {item.quantity !== undefined
                                ? `${item.quantity}${item.unit ?? ''}`
                                : '—'}
                            </p>
                          </div>
                          {/* Right: status badge */}
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(item.status ?? '')}`}
                          >
                            {getStatusLabel(item.status ?? '')}
                          </span>
                        </div>
                        {/* Expiry date */}
                        {item.expiryDate && (
                          <div className="flex items-center gap-1.5 mt-2 text-white/50 text-xs">
                            <Clock className="w-3.5 h-3.5" strokeWidth={1.8} />
                            <span>Expire le {formatDate(item.expiryDate)}</span>
                          </div>
                        )}
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
                    <Package className="w-10 h-10 text-white/30" strokeWidth={1.5} />
                  </motion.div>
                  <p className="text-white/50 text-base">
                    Aucun produit dans l&apos;inventaire
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

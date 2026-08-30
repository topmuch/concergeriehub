'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { RefreshCw, Home, Star, Wifi, ShoppingBag, BookOpen, ShieldCheck, MessageSquare } from 'lucide-react';

interface DemoSlide {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  badge: string;
  badgeColor: string;
  qrValue: string;
  phoneGradient: string;
  phoneTitle: string;
  phoneModules: { icon: React.ReactNode; label: string; value: string }[];
}

const DEMOS: DemoSlide[] = [
  {
    id: 'family',
    title: 'Mode Famille',
    subtitle: 'Tout le quotidien de la maison en un scan',
    price: '49\u20ac / an',
    badge: 'Famille',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    qrValue: 'https://qrdomotik.roomscan.pro/demo/family-hub',
    phoneGradient: 'from-emerald-600 via-teal-600 to-cyan-700',
    phoneTitle: 'Maison Martin',
    phoneModules: [
      { icon: <Wifi className="w-4 h-4" />, label: 'Wi-Fi', value: 'Martin_Fibre_5G' },
      { icon: <ShoppingBag className="w-4 h-4" />, label: 'Courses', value: '3 articles' },
      { icon: <MessageSquare className="w-4 h-4" />, label: 'Vocaux', value: '2 nouveaux' },
      { icon: <ShieldCheck className="w-4 h-4" />, label: 'Urgence', value: 'Configure' },
    ],
  },
  {
    id: 'airbnb',
    title: 'Mode Airbnb',
    subtitle: 'Vos invités scannent, vous collectez les avis',
    price: '9,90\u20ac / mois',
    badge: 'Airbnb',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    qrValue: 'https://qrdomotik.roomscan.pro/demo/airbnb-hub',
    phoneGradient: 'from-amber-500 via-orange-600 to-red-600',
    phoneTitle: 'Loft Paris 11',
    phoneModules: [
      { icon: <Wifi className="w-4 h-4" />, label: 'Wi-Fi', value: 'Loft_Invités' },
      { icon: <BookOpen className="w-4 h-4" />, label: 'Guide', value: '12 sections' },
      { icon: <Star className="w-4 h-4" />, label: 'Avis', value: 'Bouclier actif' },
      { icon: <ShoppingBag className="w-4 h-4" />, label: 'Upsell', value: '3 services' },
    ],
  },
];

export function InteractiveDemo() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const current = DEMOS[currentIndex];

  const nextDemo = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % DEMOS.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(nextDemo, 6000);
    return () => clearInterval(timer);
  }, [nextDemo]);

  useEffect(() => {
    const interval = setInterval(() => {
      setScanProgress((prev) => (prev >= 100 ? 0 : prev + 1.5));
    }, 40);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex flex-col lg:flex-row items-center gap-8 lg:gap-12 p-6 md:p-8 bg-white/[0.03] backdrop-blur-2xl rounded-3xl border border-white/[0.08] shadow-2xl">
      {/* Background glow effects */}
      <div className="absolute -top-20 -left-20 w-60 h-60 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* QR Code Zone */}
      <div className="flex flex-col items-center relative z-10">
        <div className="relative bg-white p-5 rounded-2xl shadow-[0_0_60px_rgba(139,92,246,0.15)] group">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 0.85, rotateY: -15 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              exit={{ opacity: 0, scale: 0.85, rotateY: 15 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              <QRCodeSVG
                value={current.qrValue}
                size={180}
                level="H"
                includeMargin={false}
                fgColor="#0f172a"
                bgColor="#ffffff"
              />
            </motion.div>
          </AnimatePresence>

          {/* Scan line */}
          <motion.div
            className="absolute left-5 right-5 h-[2px] pointer-events-none"
            style={{
              top: `${20 + (scanProgress / 100) * 140}px`,
              background: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)',
            }}
            animate={{ opacity: [0.2, 0.8, 0.2] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Corner markers */}
          <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-violet-500 rounded-tl-lg" />
          <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-violet-500 rounded-tr-lg" />
          <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-violet-500 rounded-bl-lg" />
          <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-violet-500 rounded-br-lg" />

          {/* Badge */}
          <motion.div
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            className="absolute -top-3 -right-3 bg-violet-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg shadow-violet-500/30 whitespace-nowrap"
          >
            Scannez-moi !
          </motion.div>
        </div>

        {/* Demo info */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id + '-info'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="mt-5 text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${current.badgeColor}`}>
                {current.badge}
              </span>
              <span className="text-white/50 text-xs">|</span>
              <span className="text-white/70 text-xs font-medium">{current.price}</span>
            </div>
            <p className="text-white/40 text-xs">{current.subtitle}</p>
          </motion.div>
        </AnimatePresence>

        {/* Cycle button */}
        <button
          onClick={nextDemo}
          className="mt-4 flex items-center gap-2 text-sm font-medium text-violet-300 hover:text-white transition-all bg-violet-500/10 hover:bg-violet-500/20 px-5 py-2.5 rounded-full border border-violet-500/20 hover:border-violet-500/40 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{currentIndex === 0 ? 'Voir Airbnb' : 'Voir Famille'}</span>
        </button>
      </div>

      {/* Phone Mockup Zone */}
      <div className="relative flex-shrink-0">
        <div className="relative w-[260px] h-[480px] bg-slate-900 rounded-[2.5rem] border-[6px] border-slate-700/80 shadow-[0_0_80px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-[22px] bg-slate-900 rounded-b-2xl z-20 flex items-center justify-center">
            <div className="w-16 h-1 bg-slate-700 rounded-full" />
          </div>

          {/* Screen content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id + '-phone'}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className={`absolute inset-0 bg-gradient-to-br ${current.phoneGradient} p-5 pt-9 flex flex-col`}
            >
              {/* Status bar */}
              <div className="flex items-center justify-between text-white/60 text-[10px] mb-4 px-1">
                <span>21:45</span>
                <div className="flex items-center gap-1">
                  <div className="w-3.5 h-2 border border-white/50 rounded-sm relative">
                    <div className="absolute inset-0.5 bg-emerald-400 rounded-[1px]" style={{ width: '70%' }} />
                  </div>
                </div>
              </div>

              {/* Home title */}
              <h3 className="text-white font-bold text-base mb-4 px-1">{current.phoneTitle}</h3>

              {/* Module cards */}
              <div className="flex-1 flex flex-col gap-2.5">
                {current.phoneModules.map((mod, i) => (
                  <motion.div
                    key={mod.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
                    className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white/90">
                        {mod.icon}
                      </div>
                      <span className="text-white/90 text-xs font-medium">{mod.label}</span>
                    </div>
                    <span className="text-white/60 text-[11px]">{mod.value}</span>
                  </motion.div>
                ))}
              </div>

              {/* Bottom dots */}
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {current.phoneModules.map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === 0 ? 'bg-white' : 'bg-white/30'}`}
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Phone reflection */}
        <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

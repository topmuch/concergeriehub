'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Wifi, DoorOpen, ShoppingBag, BookOpen, Shield } from 'lucide-react';

const DEMO_MODULES = [
  {
    id: 'wifi',
    label: 'Wi-Fi Invites',
    icon: Wifi,
    color: '#2563EB',
    description: 'Partagez votre Wi-Fi',
  },
  {
    id: 'porter',
    label: 'Portier Virtuel',
    icon: DoorOpen,
    color: '#10B981',
    description: 'Gerez les visiteurs',
  },
  {
    id: 'shopping',
    label: 'Liste de courses',
    icon: ShoppingBag,
    color: '#F59E0B',
    description: 'Synchronisez vos achats',
  },
  {
    id: 'guide',
    label: 'Manuel Maison',
    icon: BookOpen,
    color: '#8B5CF6',
    description: 'Guide pour vos invites',
  },
  {
    id: 'urgence',
    label: 'Urgence',
    icon: Shield,
    color: '#EF4444',
    description: 'Contacts d\'urgence',
  },
];

export function QrDemo({ size = 200, showLabel = true, showScanner = true }: { size?: number; showLabel?: boolean; showScanner?: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);

  const current = DEMO_MODULES[currentIndex];

  const cycleDemo = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % DEMO_MODULES.length);
  }, []);

  // Auto-cycle every 5s
  useEffect(() => {
    const timer = setInterval(cycleDemo, 5000);
    return () => clearInterval(timer);
  }, [cycleDemo]);

  // Scan line animation
  useEffect(() => {
    if (!showScanner) return;
    const interval = setInterval(() => {
      setScanProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 50);
    return () => clearInterval(interval);
  }, [showScanner]);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* QR Code with scan line */}
      <div className="relative p-3 bg-white rounded-2xl shadow-lg">
        <QRCodeSVG
          value={`https://qrdomotik.roomscan.pro/demo/${current.id}`}
          size={size}
          level="H"
          bgColor="#FFFFFF"
          fgColor="#111827"
          imageSettings={{
            src: '',
            height: 0,
            width: 0,
            excavate: false,
          }}
        />
        {/* Scan line animation */}
        {showScanner && (
          <motion.div
            className="absolute left-3 right-3 h-0.5 bg-gradient-to-r from-transparent via-[#10B981] to-transparent"
            style={{
              top: `${(scanProgress / 100) * (size - 6)}px`,
            }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
        {/* Corner markers */}
        <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-[#2563EB] rounded-tl-md" />
        <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-[#2563EB] rounded-tr-md" />
        <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-[#2563EB] rounded-bl-md" />
        <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-[#2563EB] rounded-br-md" />
      </div>

      {showLabel && (
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: current.color }}
              />
              <span className="text-sm font-semibold text-white">
                {current.label}
              </span>
            </div>
            <p className="text-xs text-gray-400">{current.description}</p>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Cycle button */}
      {showLabel && (
        <button
          onClick={cycleDemo}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white transition-all text-sm backdrop-blur-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Changer de demo
        </button>
      )}
    </div>
  );
}

// Mini version for embedding in the hero phone frame
export function QrDemoMini() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);

  const current = DEMO_MODULES[currentIndex];
  const Icon = current.icon;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % DEMO_MODULES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setScanProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-4 py-6">
      {/* Module icon + label */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-2"
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${current.color}20` }}
          >
            <Icon className="h-6 w-6" style={{ color: current.color }} />
          </div>
          <span className="text-sm font-semibold text-white">{current.label}</span>
          <span className="text-xs text-gray-400">{current.description}</span>
        </motion.div>
      </AnimatePresence>

      {/* QR Code */}
      <div className="relative p-2 bg-white rounded-xl">
        <QRCodeSVG
          value={`https://qrdomotik.roomscan.pro/demo/${current.id}`}
          size={140}
          level="H"
          bgColor="#FFFFFF"
          fgColor="#111827"
        />
        <motion.div
          className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-[#10B981] to-transparent"
          style={{ top: `${(scanProgress / 100) * 136}px` }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <div className="absolute top-0.5 left-0.5 w-3 h-3 border-t-2 border-l-2 border-[#2563EB] rounded-tl" />
        <div className="absolute top-0.5 right-0.5 w-3 h-3 border-t-2 border-r-2 border-[#2563EB] rounded-tr" />
        <div className="absolute bottom-0.5 left-0.5 w-3 h-3 border-b-2 border-l-2 border-[#2563EB] rounded-bl" />
        <div className="absolute bottom-0.5 right-0.5 w-3 h-3 border-b-2 border-r-2 border-[#2563EB] rounded-br" />
      </div>

      <p className="text-[10px] text-gray-500">Scannez pour tester</p>
    </div>
  );
}

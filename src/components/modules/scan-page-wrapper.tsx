'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Scan, Home, Eye } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface ScanPageWrapperProps {
  children: React.ReactNode;
  homeName?: string | null;
  scanCount: number;
}

export function ScanPageWrapper({ children, homeName, scanCount }: ScanPageWrapperProps) {
  const { t, dir } = useTranslation();

  return (
    <div dir={dir} className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-background">
      {/* ── Branded Header ── */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full border-b border-border/40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50"
      >
        <div className="mx-auto max-w-md px-4 py-3 flex items-center justify-between">
          {/* Logo + Home name */}
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-9 w-auto object-contain rounded-lg" />
            {homeName && (
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate leading-tight">
                  <Home className="inline h-3 w-3 mr-0.5" />
                  {homeName}
                </p>
              </div>
            )}
          </div>

          {/* Scan counter */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
            className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 border border-emerald-100 dark:border-emerald-900/30"
          >
            <Eye className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {scanCount}
            </span>
            <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70 hidden sm:inline">
              {t('connected_count')}
            </span>
          </motion.div>
        </div>
      </motion.header>

      {/* ── Main Content ── */}
      <main className="flex-1">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>

      {/* ── Branded Footer ── */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="w-full border-t border-border/40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md"
      >
        <div className="mx-auto max-w-md px-4 py-3 flex flex-col items-center gap-1">
          <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-5 w-auto object-contain rounded opacity-40" />
          <p className="text-[10px] text-muted-foreground">qrdomotik.roomscan.pro</p>
        </div>
      </motion.footer>
    </div>
  );
}

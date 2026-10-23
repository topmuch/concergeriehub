'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

// =============================================================
// PWA (Task 42-a) — Bannière d'installation « Roomscan Bouclier »
//
// Deux variants :
//   • « qr-card »  → carte blanche avec QR code (dashboard hôte,
//     vue d'ensemble) : l'hôte scanne depuis son téléphone.
//   • « button »   → bouton « Installer l'app » (page publique
//     cleaner /s/[token]) : capte beforeinstallprompt (Android/
//     Chrome), se cache si l'app est déjà installée (display-mode:
//     standalone) ou si aucun prompt n'arrive sous 6 s (iOS Safari,
//     navigateurs sans installation → passer par la carte QR).
//
// Ce composant enregistre AUSSI le Service Worker (/sw.js) en
// production → l'app cleaner reste ouverte hors connexion (mauvaise
// 4G) : navigations /s/ et /upload/ network-first avec repli cache.
// Design system PWA : bleu #055492, fond #f8fafc, cibles ≥ 44 px.
// =============================================================

const DEFAULT_QR_URL = 'https://roomscan.pro';
const PROMPT_TIMEOUT_MS = 6000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner({ variant = 'qr-card' }: { variant?: 'qr-card' | 'button' }) {
  const [qrUrl, setQrUrl] = useState(DEFAULT_QR_URL);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const gotPromptRef = useRef(false);

  useEffect(() => {
    // Enregistrement du Service Worker — production uniquement.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (typeof window === 'undefined') return;

    // App déjà installée (mode standalone) → la bannière reste cachée.
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      gotPromptRef.current = true;
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setVisible(false);
      toast.success('Application Roomscan installée sur votre appareil.');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    // Aucun prompt arrivé après quelques secondes (iOS, bureau…) →
    // on cache le bouton pour ne pas encombrer l'écran de capture.
    const timer = window.setTimeout(() => {
      if (!gotPromptRef.current) setVisible(false);
    }, PROMPT_TIMEOUT_MS);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  // Le QR pointe vers l'origine courante (https://roomscan.pro en prod).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      setQrUrl(window.location.origin);
    }
  }, []);

  async function handleInstallClick() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        toast.success('Installation lancée — retrouvez Roomscan sur votre écran d\u2019accueil.');
      } else {
        toast.info('Installation annulée — vous pourrez réessayer à tout moment.');
      }
    } catch {
      toast.error("Impossible de lancer l'installation de l'application.");
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  }

  // ── Variante « qr-card » — carte QR (toujours affichée) ──
  if (variant === 'qr-card') {
    return (
      <section
        aria-label="Installer l'application Roomscan"
        className="luxe-card p-5 sm:p-6"
      >
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="w-fit shrink-0 rounded-xl border border-[#dceaf5] bg-white p-3 dark:border-[#283a66] dark:bg-[#f8fafc]">
            <QRCodeSVG
              value={qrUrl}
              size={124}
              bgColor="#ffffff"
              fgColor="#055492"
              level="M"
              marginSize={2}
            />
          </div>
          <div className="text-center sm:text-left">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-[#055492]/70 dark:text-[#1173c7]">
              Application mobile
            </p>
            <h3 className="mt-1 text-base font-bold text-[#055492] sm:text-lg dark:text-[#8fb8dc]">
              📱 Installez l&apos;application Roomscan
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
              Ouvrez l&apos;appareil photo de votre téléphone, scannez ce code, puis touchez
              «&nbsp;Ajouter à l&apos;écran d&apos;accueil&nbsp;».
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">
              L&apos;app fonctionne même en mauvaise connexion — idéal pour vos interventions
              sur le terrain.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ── Variante « button » — bouton d'installation (auto-masqué) ──
  return (
    <AnimatePresence>
      {visible && !installed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="flex justify-center bg-[#f8fafc] px-4 pb-1 pt-3 sm:pt-4"
        >
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#055492] px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1a3278] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#055492]/40"
          >
            ⬇️ Installer l&apos;app
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PwaInstallBanner;

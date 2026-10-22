'use client';

// =============================================================
// v5.0 — BOUTON D'INSTALLATION PWA RÉEL (onglet Application mobile).
// Demande client : « l'onglet application ne propose pas
// l'installation de l'application, il est redirigé sur le site ».
//
// Ce composant capture l'événement beforeinstallprompt (Android /
// Chrome / Edge) et affiche un GROS bouton « Installer maintenant »
// qui lance le prompt natif d'installation (sans passer par le
// site). Trois états :
//   · installable   → bouton dégradé « Installer maintenant » ;
//   · déjà installée (display-mode: standalone) → confirmation verte ;
//   · non supporté (iOS Safari, Firefox…) → consignes pas à pas
//     déjà présentes dans la page (cartes Android / iPhone).
// Enregistre aussi le Service Worker (/sw.js) en production.
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const gotPromptRef = useRef(false);

  useEffect(() => {
    // Enregistrement du Service Worker — production uniquement.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // App déjà installée (mode standalone) ?
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      setChecking(false);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      gotPromptRef.current = true;
      setDeferred(event as BeforeInstallPromptEvent);
      setChecking(false);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setChecking(false);
      toast.success('Application RoomScan installée sur votre appareil.');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    // iOS / navigateurs sans prompt : après 2,5 s on affiche l'état
    // « non installable » (les consignes manuelles restent utiles).
    const timer = window.setTimeout(() => {
      if (!gotPromptRef.current) setChecking(false);
    }, 2500);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        toast.success('Installation lancée — retrouvez RoomScan sur votre écran d\u2019accueil.');
      } else {
        toast.info('Installation annulée — vous pourrez réessayer à tout moment.');
      }
    } catch {
      toast.error("Impossible de lancer l'installation de l'application.");
    } finally {
      setDeferred(null);
      setBusy(false);
    }
  }

  // Déjà installée → confirmation verte.
  if (installed) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
            Application installée ✓
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400/90">
            RoomScan fonctionne déjà comme une application sur cet appareil.
          </p>
        </div>
      </div>
    );
  }

  // Installable (Android / Chrome / Edge) → GROS bouton natif.
  if (deferred) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        disabled={busy}
        className="luxe-btn-primary w-full text-base sm:w-auto sm:px-8"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-5 w-5" aria-hidden="true" />
        )}
        Installer maintenant
      </button>
    );
  }

  // Détection en cours (rare) → neutre.
  if (checking) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-[#22305a] dark:bg-[#0d1530]/90 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Détection de l&apos;installation possible…
      </div>
    );
  }

  // Non installable programmatiquement (iOS, Firefox…) → consigne.
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div>
        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
          Installation en 2 gestes sur cet appareil
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400/90">
          Votre navigateur ne propose pas de bouton d&apos;installation automatique :
          scannez le QR code ci-dessous puis suivez le guide <strong>Android</strong> ou{' '}
          <strong>iPhone</strong> (« Ajouter à l&apos;écran d&apos;accueil »). L&apos;application
          s&apos;ouvrira sans barre de navigateur, comme une vraie app.
        </p>
      </div>
    </div>
  );
}

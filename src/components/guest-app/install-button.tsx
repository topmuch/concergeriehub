'use client';

import { useEffect, useState } from 'react';

// =============================================================
// ÉTAPE 16 (V3) — Bouton "Installer sur l'écran d'accueil"
// • Android/Desktop Chrome : capte beforeinstallprompt → prompt().
// • iOS (pas de beforeinstallprompt) : mini notice "Partager ➕
//   Sur l'écran d'accueil".
// • Masqué si l'app tourne déjà en mode standalone (installée).
// =============================================================

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallState = 'hidden' | 'ready' | 'ios-instructions';

export function InstallButton({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<InstallState>('hidden');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setState('ready');
    };
    const onInstalled = () => {
      setDeferred(null);
      setState('hidden');
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS : le prompt natif n'existe pas → notice "Ajouter à l'écran d'accueil"
    if (isIos) setState('ios-instructions');

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (state === 'hidden') return null;

  const install = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setState('hidden');
    } catch {
      /* silencieux */
    } finally {
      setInstalling(false);
    }
  };

  if (state === 'ios-instructions') {
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => setShowIosSteps((v) => !v)}
          className="w-full text-left text-xs font-semibold rounded-xl px-4 py-3 bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors cursor-pointer"
          aria-expanded={showIosSteps}
        >
          📲 Installer sur l&apos;écran d&apos;accueil
        </button>
        {showIosSteps && (
          <div className="mt-2 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-1">Sur iPhone / iPad :</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Touchez le bouton <strong className="text-foreground">Partager</strong> ⬆️ en bas de Safari</li>
              <li>Faites défiler puis choisissez <strong className="text-foreground">« Sur l&apos;écran d&apos;accueil »</strong> ➕</li>
              <li>Touchez <strong className="text-foreground">Ajouter</strong> — l&apos;app apparaît comme une vraie application 🎉</li>
            </ol>
          </div>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={install}
        disabled={installing}
        className="text-xs font-semibold rounded-full px-4 py-2 bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors cursor-pointer disabled:opacity-60"
      >
        {installing ? 'Installation…' : '📲 Installer l’app'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={install}
      disabled={installing}
      className="w-full text-left text-sm font-semibold rounded-xl px-4 py-3.5 bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground hover:border-accent active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
    >
      {installing ? '⏳ Installation en cours…' : '📲 Installer sur l’écran d’accueil'}
      {!installing && (
        <span className="block text-[11px] font-normal opacity-70 mt-0.5">
          Comme une vraie app, sans passer par l’App Store
        </span>
      )}
    </button>
  );
}

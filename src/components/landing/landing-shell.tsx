'use client';

// =============================================================
// LandingShell — coquille SPA de la page d'accueil (contrainte
// sandbox : seule la route / est exposée au preview).
//
//   view = 'landing' → LandingPage (marketing, démo interactive)
//   view = 'auth'    → AuthForm (connexion / inscription)
//
// Après login réussi : redirection vers le bon dashboard selon le
// rôle (superadmin → console admin, hôte → dashboard airbnb).
// =============================================================

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthForm } from '@/components/auth/login-form';
import { LandingLangProvider, dirFor, useLandingLang } from '@/lib/landing-i18n';
import { LandingPage, type AuthViewMode } from './landing-page';

type View = 'landing' | 'auth';

// Vue LANDING encapsulée dans le provider i18n (8 langues) : le div
// interne porte dir="rtl" pour l'arabe et lang={lang} pour les lecteurs
// d'écran. L'AuthForm reste en dehors (toujours FR). En cas de langue
// mémorisée ≠ fr, useSyncExternalStore re-rend SANS erreur
// d'hydratation (le premier rendu client = FR, identique au serveur).
function LandingView({ onGoToAuth }: { onGoToAuth: (mode: AuthViewMode) => void }) {
  const { lang } = useLandingLang();
  return (
    <div dir={dirFor(lang)} lang={lang}>
      <LandingPage onGoToAuth={onGoToAuth} />
    </div>
  );
}

export function LandingShell() {
  const router = useRouter();
  // v5.18 SITE MULTIPAGES : les boutons « Connexion / Commencer » des
  // AUTRES pages pointent /?auth=login|register — la vue auth s'ouvre
  // d'après le paramètre d'URL (useSearchParams, sûr : la page est
  // rendue en force-dynamic pour la CSP à nonce).
  const searchParams = useSearchParams();
  const authParam = searchParams.get('auth');
  const [view, setView] = useState<View>(() =>
    authParam === 'login' || authParam === 'register' ? 'auth' : 'landing',
  );
  const [authMode, setAuthMode] = useState<AuthViewMode>(() =>
    authParam === 'register' ? 'register' : 'login',
  );

  // Repartir du haut de page à chaque bascule de vue.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view]);

  // Navigation « /?auth=… » depuis une autre page → ouvrir l'auth.
  // Pattern « ajustement de state pendant le rendu » (recommandé par
  // React pour dériver d'un changement de props/URL) — le lint
  // set-state-in-effect interdit le setState direct dans un effet.
  const [syncedAuthParam, setSyncedAuthParam] = useState(authParam);
  if (syncedAuthParam !== authParam) {
    setSyncedAuthParam(authParam);
    if (authParam === 'login' || authParam === 'register') {
      setAuthMode(authParam);
      setView('auth');
    }
  }

  const handleGoToAuth = (mode: AuthViewMode) => {
    setAuthMode(mode);
    setView('auth');
  };

  const handleBackToLanding = () => {
    setView('landing');
    // Nettoyer l'URL (?auth=…) sans recharger la page.
    router.replace('/');
  };

  const handleAuthSuccess = (role: string, opts?: { registered?: boolean }) => {
    // Chantier ONBOARD : une inscription fraîche ouvre l'assistant de
    // démarrage (3 minutes) directement après la redirection.
    if (opts?.registered && role !== 'superadmin') {
      router.push('/airbnb/dashboard?onboarding=1');
      return;
    }
    router.push(role === 'superadmin' ? '/admin/dashboard' : '/airbnb/dashboard');
  };

  return (
    <AnimatePresence mode="wait">
      {view === 'landing' ? (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <LandingLangProvider>
            <LandingView onGoToAuth={handleGoToAuth} />
          </LandingLangProvider>
        </motion.div>
      ) : (
        <motion.div
          key="auth"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <AuthForm
            onSuccess={handleAuthSuccess}
            initialRegister={authMode === 'register'}
            onBack={handleBackToLanding}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

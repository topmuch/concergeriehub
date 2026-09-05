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
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthForm } from '@/components/auth/login-form';
import { LandingPage, type AuthViewMode } from './landing-page';

type View = 'landing' | 'auth';

export function LandingShell() {
  const router = useRouter();
  const [view, setView] = useState<View>('landing');
  const [authMode, setAuthMode] = useState<AuthViewMode>('login');

  // Repartir du haut de page à chaque bascule de vue.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view]);

  const handleGoToAuth = (mode: AuthViewMode) => {
    setAuthMode(mode);
    setView('auth');
  };

  const handleAuthSuccess = (role: string) => {
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
          <LandingPage onGoToAuth={handleGoToAuth} />
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
            onBack={() => setView('landing')}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

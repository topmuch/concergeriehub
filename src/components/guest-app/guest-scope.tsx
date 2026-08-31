'use client';

import { useEffect, useState } from 'react';

// =============================================================
// ÉTAPE 16 (V3) — Scope thème de l'App Invitée
// Le mode sombre suit AUTOMATIQUEMENT le téléphone de l'invité
// (prefers-color-scheme), indépendamment de l'Espace Hôte
// (classe .dark sur <html> pilotée par next-themes).
// =============================================================

export function GuestScope({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setDark(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <div
      className={dark ? 'guest-scope dark' : 'guest-scope'}
      data-theme={dark ? 'dark' : 'light'}
      style={{ minHeight: '100vh' }}
    >
      {children}
    </div>
  );
}

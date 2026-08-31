'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { B2BCard } from '@/components/ui/b2b-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// =============================================================
// LoginGate — écran affiché quand l'utilisateur n'est pas connecté.
// Connexion inline (comptes démo pré-remplis) sans passer par la
// landing. Réutilisable : props optionnelles pour un portail
// différent (ex. Portail Prestataire ÉTAPE 17.4) sans dupliquer.
// =============================================================

const DEMO_CREDENTIALS = {
  email: 'demo@qrdomotik.roomscan.pro',
  password: 'Demo2024!',
};

interface LoginGateProps {
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  demoEmail?: string;
  demoPassword?: string;
  demoLabel?: string;
}

export function LoginGate({
  title = 'Espace Hôte',
  subtitle = 'Connectez-vous pour accéder à votre tableau de bord.',
  buttonLabel = 'Accéder à mon dashboard',
  demoEmail = DEMO_CREDENTIALS.email,
  demoPassword = DEMO_CREDENTIALS.password,
  demoLabel = 'Compte démo',
}: LoginGateProps) {
  const router = useRouter();
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState(demoPassword);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('Email ou mot de passe incorrect.');
        setLoading(false);
      } else if (result?.ok) {
        router.refresh();
      }
    } catch {
      setError('Erreur de connexion au serveur.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <BrandLogo size="lg" />
          <h1 className="mt-5 text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
        </div>

        <B2BCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gate-email">Email</Label>
              <Input
                id="gate-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gate-password">Mot de passe</Label>
              <Input
                id="gate-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              {loading ? 'Connexion…' : buttonLabel}
            </Button>
          </form>
        </B2BCard>

        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">{demoLabel}</p>
          <p className="text-xs text-emerald-900 font-mono mt-0.5">
            {demoEmail} · {demoPassword}
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          <a href="/" className="hover:text-slate-600 underline underline-offset-2">
            ← Retour au site
          </a>
        </p>
      </div>
    </div>
  );
}

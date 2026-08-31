'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { B2BCard } from '@/components/ui/b2b-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * AdminLoginGate — écran de connexion réservé au Superadmin,
 * affiché sur /admin/* quand la session est absente ou sans le
 * rôle requis. Aucune donnée admin n'est rendue avant validation.
 */

const ADMIN_CREDENTIALS = {
  email: 'admin@qrdomotik.roomscan.pro',
  password: 'QrDomotik2024!',
};

export function AdminLoginGate() {
  const router = useRouter();
  const [email, setEmail] = useState(ADMIN_CREDENTIALS.email);
  const [password, setPassword] = useState(ADMIN_CREDENTIALS.password);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('Identifiants incorrects ou compte sans accès Superadmin.');
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
    <div className="min-h-screen flex flex-col bg-slate-50">
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-6">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 shadow-sm mb-4" aria-hidden="true">
              <ShieldCheck className="h-7 w-7 text-white" />
            </span>
            <BrandLogo size="lg" />
            <h1 className="mt-5 text-2xl font-bold text-slate-900">Console Superadmin</h1>
            <p className="text-sm text-slate-600 mt-1">
              Accès strictement réservé à l&apos;équipe Conciergerie Hub.
            </p>
          </div>

          <B2BCard>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email administrateur</Label>
                <Input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@exemple.fr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Mot de passe</Label>
                <Input
                  id="admin-password"
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {loading ? 'Vérification…' : 'Accéder à la console'}
              </Button>
            </form>
          </B2BCard>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-amber-900 leading-relaxed">
              Zone d&apos;administration. Toute action (désactivation de compte,
              modification de prestataire) est exécutée en direct sur la plateforme.
            </p>
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            <a href="/" className="hover:text-slate-600 underline underline-offset-2">
              ← Retour au site
            </a>
          </p>
        </div>
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto w-full px-4 py-4 text-center">
          <p className="text-xs text-slate-500">
            🛡️ <span className="font-semibold text-slate-700">Conciergerie Hub</span> — Console d&apos;administration
          </p>
        </div>
      </footer>
    </div>
  );
}

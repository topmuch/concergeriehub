'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';

// =============================================================
// AUDIT PRÉ-PROD — Page « Nouveau mot de passe » (/reset-password?token=…)
// Ouvre le lien reçu par email (valable 1 h, single-use).
// =============================================================

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Réinitialisation impossible.');
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/'), 2500);
    } catch {
      setError('Erreur de connexion au serveur.');
    } finally {
      setLoading(false);
    }
  };

  const invalidToken = !token;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/40 rounded-2xl p-6">
      {done ? (
        <div className="text-center" role="status">
          <ShieldCheck className="h-12 w-12 text-emerald-400 mx-auto" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-white">Mot de passe mis à jour ✅</h1>
          <p className="mt-2 text-sm text-slate-400">
            Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-[#0066EF] hover:bg-[#0052C4] px-6 text-white font-semibold text-sm transition-all"
          >
            Se connecter
          </Link>
        </div>
      ) : invalidToken ? (
        <div className="text-center" role="alert">
          <h1 className="text-xl font-bold text-white">Lien invalide</h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Ce lien de réinitialisation est incomplet. Refaites une demande depuis la page de connexion.
          </p>
          <Link
            href="/forgot-password"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-[#0066EF] hover:bg-[#0052C4] px-6 text-white font-semibold text-sm transition-all"
          >
            Refaire une demande
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-white">Nouveau mot de passe</h1>
          <p className="mt-2 text-sm text-slate-400">
            Choisissez un mot de passe solide : 8 caractères minimum, lettres et chiffres.
          </p>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300">Nouveau mot de passe</label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0066EF]/50 focus:ring-1 focus:ring-[#0066EF]/20 transition-all"
                  placeholder="8 caractères min. — lettres + chiffres"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Confirmer</label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#0066EF]/50 focus:ring-1 focus:ring-[#0066EF]/20 transition-all"
                  placeholder="Ressaisissez le mot de passe"
                  required
                  minLength={8}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#0066EF] hover:bg-[#0052C4] text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <Link
        href="/"
        className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-900/60 px-3.5 py-2 text-sm font-medium text-slate-300 backdrop-blur transition-all hover:bg-slate-800/80 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au site
      </Link>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-6"
        >
          <div className="flex justify-center">
            <BrandLogo variant="light" size="lg" />
          </div>
          <Suspense
            fallback={
              <div className="bg-slate-900/50 border border-slate-700/40 rounded-2xl p-6 text-center text-sm text-slate-400">
                Chargement…
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </motion.div>
      </div>
    </div>
  );
}

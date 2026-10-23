'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';

// =============================================================
// AUDIT PRÉ-PROD — Page « Mot de passe oublié » (/forgot-password)
// Envoie le lien de réinitialisation (valable 1 h, single-use).
// Réponse volontairement identique que le compte existe ou non.
// =============================================================

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Envoi impossible. Réessayez dans un instant.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Erreur de connexion au serveur.');
    } finally {
      setLoading(false);
    }
  };

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

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/40 rounded-2xl p-6">
            {sent ? (
              <div className="text-center" role="status">
                <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" aria-hidden="true" />
                <h1 className="mt-4 text-xl font-bold text-white">Email envoyé</h1>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Si un compte existe avec cette adresse, vous recevrez un lien de
                  réinitialisation valable <strong className="text-slate-200">1 heure</strong>.
                  Pensez à vérifier vos spams.
                </p>
                <Link
                  href="/"
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-[#055492] hover:bg-[#04467a] px-6 text-white font-semibold text-sm transition-all"
                >
                  Retour à la connexion
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-white">Mot de passe oublié&nbsp;?</h1>
                <p className="mt-2 text-sm text-slate-400">
                  Entrez votre email : nous vous envoyons un lien pour choisir un nouveau mot de passe.
                </p>
                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-300">Email</label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#055492]/50 focus:ring-1 focus:ring-[#055492]/20 transition-all"
                        placeholder="vous@exemple.com"
                        required
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
                    className="w-full py-3 rounded-xl bg-[#055492] hover:bg-[#04467a] text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="text-center text-sm text-slate-400">
            <Link href="/" className="text-[#1173c7] hover:text-[#8fb8dc] hover:underline font-medium">
              Retour à la connexion
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

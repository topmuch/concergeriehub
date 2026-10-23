'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, ArrowLeft, Eye, EyeOff, QrCode, Smartphone, Home, Zap } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import Link from 'next/link';
import { AdminLangProvider, useAdminLang } from '@/lib/admin-i18n';
import { AdminLangSwitcher } from '@/components/admin/lang-switcher';

interface AuthFormProps {
  /** role de l'utilisateur connecté ; opts.registered = inscription fraîche. */
  onSuccess: (role: string, opts?: { registered?: boolean }) => void;
  initialRegister?: boolean;
  /** Si fourni, affiche un bouton « Retour au site » (landing). */
  onBack?: () => void;
}

// =============================================================
// AUDIT PRÉ-PROD — SÉCURITÉ : AUCUN identifiant en dur dans ce
// formulaire public (les cartes « accès rapide » et le pré-remplage
// superadmin ont été supprimés). Le rôle est lu depuis la session
// NextAuth après connexion — jamais deviné côté client.
//
// v4.77-c2 — i18n 5 LANGUES (fr/en/es/de/zh) : le formulaire est
// enveloppé dans AdminLangProvider (source de vérité locale
// localStorage 'admin-lang', partagée avec le dashboard hôte et le
// hub hôte). Les erreurs sont stockées en TEXTE SOURCE FR puis
// traduites à l'affichage via t() — les messages serveur (déjà FR)
// passent tels quels (clé absente → repli FR).
// =============================================================

export function AuthForm(props: AuthFormProps) {
  return (
    <AdminLangProvider>
      <AuthFormInner {...props} />
    </AdminLangProvider>
  );
}

function AuthFormInner({ onSuccess, initialRegister, onBack }: AuthFormProps) {
  const { t } = useAdminLang();
  const [isLogin, setIsLogin] = useState(!initialRegister);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // v4.77-c2 — l'erreur est stockée en texte SOURCE FR ; la traduction
  // se fait à l'affichage ({t(error)}) : les retours serveur FR non
  // référencés dans le dictionnaire s'affichent tels quels.
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Chantier ONBOARD : true si ce formulaire vient de créer le compte
      // (variable locale — le state serait périmé dans la closure).
      let registered = false;
      if (!isLogin) {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, fullName }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Erreur lors de l'inscription");
          setLoading(false);
          return;
        }
        registered = true;
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Email ou mot de passe incorrect');
      } else if (result?.ok) {
        // Rôle lu depuis la session (source de vérité serveur) —
        // jamais comparé à un email en dur côté client.
        let role = 'user';
        try {
          const sessionRes = await fetch('/api/auth/session');
          const session = await sessionRes.json();
          role = (session?.user as { role?: string } | undefined)?.role ?? 'user';
        } catch {
          /* rôle par défaut : user (le middleware re-vérifie côté serveur) */
        }
        // Chantier ONBOARD : signaler une inscription fraîche pour
        // déclencher l'assistant de démarrage après redirection.
        onSuccess(role, { registered });
      }
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* v4.77-c2 — sélecteur de langue discret (5 drapeaux) */}
      <div className="absolute right-4 top-4 z-20">
        <AdminLangSwitcher variant="pills" />
      </div>

      {/* Retour vers la landing (si prop fournie) */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-900/60 px-3.5 py-2 text-sm font-medium text-slate-300 backdrop-blur transition-all hover:bg-slate-800/80 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('Retour au site')}
        </button>
      )}

      {/* Main split layout */}
      <div className="flex flex-1">
        {/* Left side — Branding (hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }} />
          {/* Gradient accent */}
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#055492]/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#055492]/8 rounded-full blur-[100px]" />

          <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <BrandLogo variant="light" size="xl" className="mb-8" />
              <h1 className="text-4xl xl:text-5xl font-bold text-white tracking-tight leading-tight">
                {t('La conciergerie digitale')}{' '}
                <span className="bg-gradient-to-r from-[#1173c7] to-[#1173c7] bg-clip-text text-transparent">
                  {t('commence par un QR')}
                </span>
              </h1>
              <p className="mt-6 text-lg text-slate-400 max-w-lg leading-relaxed">
                {t('La conciergerie digitale de vos locations. Wi-Fi, guidebook, check-out et prestataires : une seule plaque QR pour vos invités, un tableau de bord pour vous.')}
              </p>
            </motion.div>

            {/* Feature pills */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-12 flex flex-wrap gap-3"
            >
              {[
                { icon: QrCode, label: 'QR Codes intelligents' },
                { icon: Smartphone, label: 'Scan instantané' },
                { icon: Home, label: 'Gestion multi-logements' },
                { icon: Zap, label: 'Prestataires intégrés' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-800/40 px-4 py-2 text-sm text-slate-300"
                >
                  <f.icon className="h-4 w-4 text-[#1173c7]" />
                  {t(f.label)}
                </div>
              ))}
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-12 flex gap-8"
            >
              {[
                { value: '2 500+', label: 'Hôtes connectés' },
                { value: '15k+', label: 'QR Codes scannés/mois' },
                { value: '99.9%', label: 'Disponibilité' },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t(s.label)}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Right side — Form */}
        <div className="flex-1 flex flex-col">
          {/* Mobile header with logo */}
          <div className="lg:hidden flex items-center justify-center px-6 pt-6">
            <BrandLogo variant="light" size="lg" />
          </div>
          <div className="flex-1 flex items-center justify-center px-6 py-8 lg:px-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-md space-y-6"
            >
              {/* Header */}
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {isLogin ? t('Connexion') : t('Créer un compte')}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {isLogin
                    ? t('Accédez à votre espace RoomScan')
                    : t('Rejoignez les 2 500+ hôtes qui automatisent leurs locations')}
                </p>
              </div>

              {/* Form card */}
              <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/40 rounded-2xl p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <AnimatePresence mode="wait">
                    {!isLogin && (
                      <motion.div
                        key="name"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <label className="text-sm font-medium text-slate-300">{t('Nom complet')}</label>
                        <div className="relative mt-1.5">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#055492]/50 focus:ring-1 focus:ring-[#055492]/20 transition-all"
                            placeholder="Jean Dupont"
                            required={!isLogin}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label className="text-sm font-medium text-slate-300">{t('Email')}</label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#055492]/50 focus:ring-1 focus:ring-[#055492]/20 transition-all"
                        placeholder={t('vous@exemple.com')}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-300">{t('Mot de passe')}</label>
                    <div className="relative mt-1.5">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#055492]/50 focus:ring-1 focus:ring-[#055492]/20 transition-all"
                        placeholder={isLogin ? t('Mot de passe') : t('8 caractères min. — lettres + chiffres')}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={t('Mot de passe')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                    >
                      {t(error)}
                    </motion.p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-[#055492] hover:bg-[#04467a] text-white font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        {isLogin ? t('Se connecter') : t("S'inscrire")}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {isLogin && (
                    <p className="text-center">
                      <Link
                        href="/forgot-password"
                        className="text-xs text-slate-400 hover:text-[#8fb8dc] transition-colors"
                      >
                        {t('Mot de passe oublié ?')}
                      </Link>
                    </p>
                  )}
                </form>

                <p className="mt-4 text-center text-sm text-slate-400">
                  {isLogin ? t('Pas encore de compte ?') : t('Déjà un compte ?')}{' '}
                  <button
                    onClick={() => { setIsLogin(!isLogin); setError(''); }}
                    className="text-[#1173c7] hover:text-[#8fb8dc] hover:underline font-medium transition-colors"
                  >
                    {isLogin ? t("S'inscrire") : t('Se connecter')}
                  </button>
                </p>
              </div>
            </motion.div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-800/40">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <BrandLogo variant="light" size="sm" />
              </div>
              <span>{t('Conciergerie digitale pour hôtes')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, Shield, Users, Copy, Check, QrCode, Smartphone, Home, Zap } from 'lucide-react';

interface AuthFormProps {
  onSuccess: (role: string) => void;
  initialRegister?: boolean;
}

const DEPLOY_CREDENTIALS = [
  {
    role: 'superadmin',
    label: 'Super Admin',
    email: 'admin@qrdomotik.roomscan.pro',
    password: 'QrDomotik2024!',
    icon: Shield,
  },
  {
    role: 'user',
    label: 'Client Demo',
    email: 'demo@qrdomotik.roomscan.pro',
    password: 'Demo2024!',
    icon: Users,
  },
];

export function AuthForm({ onSuccess, initialRegister }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(!initialRegister);
  const [email, setEmail] = useState('admin@qrdomotik.roomscan.pro');
  const [password, setPassword] = useState('QrDomotik2024!');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fillCredentials = (cred: typeof DEPLOY_CREDENTIALS[0]) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setIsLogin(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
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
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Email ou mot de passe incorrect');
      } else if (result?.ok) {
        const role = email === 'admin@qrdomotik.roomscan.pro' ? 'superadmin' : 'user';
        onSuccess(role);
      }
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (cred: typeof DEPLOY_CREDENTIALS[0]) => {
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email: cred.email,
      password: cred.password,
      redirect: false,
    });

    if (result?.ok) {
      onSuccess(cred.role);
    } else {
      setError('Connexion echouee. Verifiez que le serveur est bien initialise.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
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
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/8 rounded-full blur-[100px]" />

          <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-16 w-auto object-contain rounded-lg mb-8" />
              <h1 className="text-4xl xl:text-5xl font-bold text-white tracking-tight leading-tight">
                La maison connectée{' '}
                <span className="bg-gradient-to-r from-violet-400 to-emerald-400 bg-clip-text text-transparent">
                  commence par un QR
                </span>
              </h1>
              <p className="mt-6 text-lg text-slate-400 max-w-lg leading-relaxed">
                Scannez, configurez, controlez. ORDOMOTIK transforme chaque pièce en un point de commande intelligent pour votre habitat.
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
                { icon: Home, label: 'Gestion multi-pièces' },
                { icon: Zap, label: 'Domotique intégrée' },
              ].map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-800/40 px-4 py-2 text-sm text-slate-300"
                >
                  <f.icon className="h-4 w-4 text-violet-400" />
                  {f.label}
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
                { value: '2 500+', label: 'Foyers connectés' },
                { value: '15k+', label: 'QR Codes scannés/mois' },
                { value: '99.9%', label: 'Disponibilité' },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Right side — Form */}
        <div className="flex-1 flex flex-col">
          {/* Mobile header with logo */}
          <div className="lg:hidden flex items-center justify-center px-6 pt-6">
            <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-10 w-auto object-contain rounded-lg" />
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
                  {isLogin ? 'Connexion' : 'Créer un compte'}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {isLogin ? 'Accédez à votre espace QR Domotik' : 'Rejoignez les 2 500+ foyers connectés'}
                </p>
              </div>

              {/* Deploy credential cards */}
              <div className="grid grid-cols-2 gap-3">
                {DEPLOY_CREDENTIALS.map((cred) => {
                  const Icon = cred.icon;
                  return (
                    <motion.button
                      key={cred.email}
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => fillCredentials(cred)}
                      className="relative overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 text-left transition-all hover:bg-slate-800/60 hover:border-slate-600/50"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4 text-slate-300" />
                        <span className="text-xs font-semibold text-slate-300">{cred.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono truncate">{cred.email}</p>
                      <p className="text-[11px] text-slate-600 font-mono truncate mt-0.5">{cred.password}</p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(cred.email, cred.email);
                        }}
                        className="absolute top-2 right-2 p-1 rounded-md hover:bg-slate-700/50 transition-colors"
                        title="Copier l'email"
                      >
                        {copiedField === cred.email ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3 text-slate-500" />
                        )}
                      </button>
                    </motion.button>
                  );
                })}
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
                        <label className="text-sm font-medium text-slate-300">Nom complet</label>
                        <div className="relative mt-1.5">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
                            placeholder="Jean Dupont"
                            required={!isLogin}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label className="text-sm font-medium text-slate-300">Email</label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
                        placeholder="vous@exemple.com"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(email, 'form-email')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        title="Copier"
                      >
                        {copiedField === 'form-email' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-300">Mot de passe</label>
                    <div className="relative mt-1.5">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
                        placeholder={isLogin ? 'Mot de passe' : '6 caractères minimum'}
                        required
                        minLength={6}
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

                  {error && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                    >
                      {error}
                    </motion.p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        {isLogin ? 'Se connecter' : "S'inscrire"}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                <p className="mt-4 text-center text-sm text-slate-400">
                  {isLogin ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
                  <button
                    onClick={() => { setIsLogin(!isLogin); setError(''); }}
                    className="text-violet-400 hover:text-violet-300 hover:underline font-medium transition-colors"
                  >
                    {isLogin ? "S'inscrire" : 'Se connecter'}
                  </button>
                </p>
              </div>

              {/* Quick login buttons */}
              <div className="space-y-3">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                  <div className="relative flex justify-center"><span className="bg-slate-950 px-3 text-xs text-slate-500">Accès rapide</span></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleQuickLogin(DEPLOY_CREDENTIALS[0])}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800/30 border border-slate-700/40 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-all text-sm font-medium disabled:opacity-50"
                  >
                    <Shield className="h-4 w-4 text-violet-400" />
                    Super Admin
                  </button>
                  <button
                    onClick={() => handleQuickLogin(DEPLOY_CREDENTIALS[1])}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800/30 border border-slate-700/40 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-all text-sm font-medium disabled:opacity-50"
                  >
                    <Users className="h-4 w-4 text-emerald-400" />
                    Client Demo
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-800/40">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-5 w-auto object-contain rounded opacity-40" />
                <span>ORDOMOTIK</span>
              </div>
              <span>Smart Home Solutions</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
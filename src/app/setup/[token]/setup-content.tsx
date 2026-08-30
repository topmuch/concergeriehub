'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  QRTCard,
  QRTButton,
  QRTActions,
  QRTProgressBar,
  QRTNumericKeypad,
} from '@/components/qrtags';

// ── Types ──
type TokenStatus = 'loading' | 'available' | 'claimed' | 'not_found' | 'error';
type SetupStep = 'welcome' | 'account' | 'pin' | 'config' | 'success';

interface PlaqueInfo {
  id: string;
  activationCode: string;
  batchId: string;
  quantity: number;
}

// ── Plans (QRTags: emojis instead of Lucide) ──
const PLANS = [
  {
    id: 'famille' as const,
    name: 'Famille',
    price: '49\u20ac',
    period: '/an',
    emoji: '\uD83C\uDFE0',
  },
  {
    id: 'airbnb_solo' as const,
    name: 'Airbnb Solo',
    price: '9,90\u20ac',
    period: '/mois',
    emoji: '\uD83C\uDFE8',
    popular: true,
  },
  {
    id: 'airbnb_pro' as const,
    name: 'Airbnb Pro',
    price: '199\u20ac',
    period: '/an',
    badge: '\u00C9conomisez 19\u20ac',
    emoji: '\uD83C\uDFE8',
  },
];

// ── Slide variants ──
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

// ── QRTags input class ──
const qrtInput =
  'w-full bg-gray-50 border-2 border-black rounded-[8px] p-3.5 text-sm text-black placeholder:text-black/30 focus:outline-none focus:border-[#6D28D9] focus:bg-white transition-all';

// ── Step metadata for progress bar ──
const STEP_TITLES: Record<SetupStep, { title: string; label: string }> = {
  welcome: { title: 'BIENVENUE', label: '' },
  account: { title: 'VOS INFORMATIONS', label: '' },
  pin: { title: 'CODE SECRET', label: '' },
  config: { title: 'CONFIGURATION', label: '' },
  success: { title: '', label: '' },
};

// ── Component ──
export function SetupPageContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data: session } = useSession();
  const router = useRouter();

  // Token state
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('loading');
  const [plaqueInfo, setPlaqueInfo] = useState<PlaqueInfo | null>(null);
  const [claimedInfo, setClaimedInfo] = useState<{ hubSlug?: string; homeName?: string }>({});

  // Step navigation
  const [step, setStep] = useState<SetupStep>('welcome');
  const [direction, setDirection] = useState(1);

  // Account
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // PIN
  const [pinKey, setPinKey] = useState(0);
  const [pinValue, setPinValue] = useState('');

  // Config
  const [selectedPlan, setSelectedPlan] = useState<string>('famille');
  const [homeName, setHomeName] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [hubSlug, setHubSlug] = useState('');

  // ── Check token on mount ──
  const checkToken = useCallback(async () => {
    try {
      const res = await fetch(`/api/setup/${encodeURIComponent(token)}`);
      if (!res.ok) {
        setTokenStatus('error');
        return;
      }
      const data = await res.json();
      if (data.status === 'available') {
        setTokenStatus('available');
        setPlaqueInfo(data.plaque);
      } else if (data.status === 'claimed') {
        setTokenStatus('claimed');
        setClaimedInfo({ hubSlug: data.hubSlug, homeName: data.homeName });
      } else {
        setTokenStatus('not_found');
      }
    } catch {
      setTokenStatus('error');
    }
  }, [token]);

  useEffect(() => { checkToken(); }, [checkToken]);

  // Pre-fill if logged in
  useEffect(() => {
    if (session?.user) {
      const u = session.user as Record<string, unknown>;
      setEmail((u?.email as string) || '');
      setFullName((u?.name as string) || '');
    }
  }, [session]);

  // ── Step navigation ──
  const stepOrder: SetupStep[] = ['welcome', 'account', 'pin', 'config', 'success'];

  const goNext = () => {
    setDirection(1);
    const idx = stepOrder.indexOf(step);
    if (idx < stepOrder.length - 1) setStep(stepOrder[idx + 1]);
  };

  const goBack = () => {
    setDirection(-1);
    const idx = stepOrder.indexOf(step);
    if (idx > 0) setStep(stepOrder[idx - 1]);
  };

  // ── Validate & navigate ──
  const handleWelcomeNext = () => goNext();

  const handleAccountNext = () => {
    if (!fullName.trim()) { toast.error('Entrez votre nom'); return; }
    if (!email.trim() || !email.includes('@')) { toast.error('Email invalide'); return; }
    if (!session?.user && (!password || password.length < 6)) {
      toast.error('Mot de passe requis (6+ caract\u00E8res)'); return;
    }
    goNext();
  };

  const handlePinComplete = (enteredPin: string) => {
    setPinValue(enteredPin);
    setTimeout(() => goNext(), 400);
  };

  const handleConfigSubmit = async () => {
    if (!homeName.trim()) { toast.error('Nommez votre logement'); return; }
    if (!PLANS.find((p) => p.id === selectedPlan)) { toast.error('Choisissez un plan'); return; }

    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        email: email.trim(),
        fullName: fullName.trim(),
        pin: pinValue,
        homeName: homeName.trim(),
        plan: selectedPlan,
      };

      if (wifiSsid.trim()) body.wifiSsid = wifiSsid.trim();
      if (wifiPassword.trim()) body.wifiPassword = wifiPassword.trim();
      if (emergencyPhone.trim()) body.emergencyPhone = emergencyPhone.trim();

      if (!session?.user) {
        body.password = password;
      } else {
        const userId = (session.user as Record<string, unknown>)?.id as string | undefined;
        if (userId) body.existingUserId = userId;
      }

      const res = await fetch(`/api/setup/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erreur lors de la configuration');

      setHubSlug(data.hubSlug || '');
      setDirection(1);
      setStep('success');

      // Auto-redirect after delay
      if (data.isNewUser) {
        setTimeout(async () => {
          try {
            const loginRes = await fetch('/api/auth/callback/credentials', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                email: email.trim(),
                password,
                callbackUrl: '/',
              }).toString(),
            });
            if (loginRes.ok) window.location.href = '/';
          } catch { /* stay on success page */ }
        }, 3000);
      } else {
        setTimeout(() => {
          window.location.href = data.hubSlug ? `/hub/${data.hubSlug}` : '/';
        }, 3000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Progress ──
  const currentIdx = stepOrder.indexOf(step);

  // ── Loading state ──
  if (tokenStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-white border-2 border-black rounded-[12px] shadow-[4px_4px_0_rgba(0,0,0,0.08)] flex items-center justify-center">
            <span className="text-3xl">\uD83D\uDFE8</span>
          </div>
          <p className="text-white/80 font-bold text-sm">V\u00E9rification de votre plaque...</p>
          <p className="text-xs text-white/40 font-mono">{token}</p>
        </div>
      </div>
    );
  }

  // ── Error states ──
  if (tokenStatus === 'not_found' || tokenStatus === 'error') {
    const isError = tokenStatus === 'error';
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <QRTCard className="text-center">
            <div className="mb-4">
              <span className="text-5xl">{isError ? '\u26A0\uFE0F' : '\u274C'}</span>
            </div>
            <h1 className="text-lg font-extrabold text-black mb-1">
              {isError ? 'Erreur' : 'Plaque non trouv\u00E9e'}
            </h1>
            <p className="text-xs text-black/40 font-mono mb-1">{token}</p>
            <p className="text-sm text-black/60 mb-6">
              {isError
                ? 'Impossible de v\u00E9rifier la plaque. R\u00E9essayez.'
                : "Ce code d'activation n'existe pas. V\u00E9rifiez votre plaque et r\u00E9essayez."}
            </p>
            <QRTButton onClick={() => { setTokenStatus('loading'); checkToken(); }}>
              R\u00E9essayer \u2192
            </QRTButton>
          </QRTCard>
        </div>
      </div>
    );
  }

  // ── Already claimed ──
  if (tokenStatus === 'claimed') {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <QRTCard className="text-center">
            <div className="mb-4">
              <span className="text-5xl">\u2705</span>
            </div>
            <h1 className="text-lg font-extrabold text-black mb-2">Plaque d\u00E9j\u00E0 configur\u00E9e</h1>
            {claimedInfo.homeName && (
              <p className="text-sm text-black/60 mb-1">
                Logement : <span className="font-bold">{claimedInfo.homeName}</span>
              </p>
            )}
            <p className="text-sm text-black/40 mb-6">Cette plaque est d\u00E9j\u00E0 li\u00E9e \u00E0 un compte.</p>
            {claimedInfo.hubSlug && (
              <div className="mb-3">
                <QRTButton onClick={() => router.push(`/hub/${claimedInfo.hubSlug}`)}>
                  Acc\u00E9der au Hub \u2192
                </QRTButton>
              </div>
            )}
            <QRTButton variant="secondary" onClick={() => router.push('/')}>
              Aller \u00E0 l'accueil
            </QRTButton>
          </QRTCard>
        </div>
      </div>
    );
  }

  // ── Main multi-step wizard ──
  return (
    <div className="min-h-screen bg-[#8B5CF6] flex flex-col">
      {/* Header */}
      <div className="w-full px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-md mx-auto">
          {/* Logo + step indicator */}
          <div className="flex items-center justify-between mb-3">
            <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-9 w-auto object-contain rounded-lg" />
            {step !== 'success' && (
              <span className="text-[11px] font-bold text-white/60">
                \u00C9tape {currentIdx + 1} / 4
              </span>
            )}
          </div>

          {/* Progress bar (only during steps, not welcome) */}
          {step !== 'welcome' && step !== 'success' && (
            <QRTProgressBar
              currentStep={currentIdx}
              totalSteps={4}
              stepTitle={STEP_TITLES[step].title}
            />
          )}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-5 py-4">
        <div className="w-full max-w-md relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>

            {/* ===== STEP 1: WELCOME ===== */}
            {step === 'welcome' && (
              <motion.div
                key="welcome"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="space-y-6 text-center"
              >
                {/* Emoji icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.6 }}
                  className="mx-auto"
                >
                  <div className="w-20 h-20 bg-white border-2 border-black rounded-[16px] shadow-[4px_4px_0_rgba(0,0,0,0.08)] flex items-center justify-center">
                    <span className="text-5xl">\uD83C\uDFE0</span>
                  </div>
                </motion.div>

                <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.15 }}>
                  <h1 className="text-2xl font-extrabold text-white mb-2">
                    Bienvenue ! \uD83C\uDF89
                  </h1>
                  <p className="text-white/70 text-sm leading-relaxed">
                    Votre QR Domotik Hub est pr\u00EAt \u00E0 \u00EAtre configur\u00E9.<br />
                    Cela ne prend que 2 minutes.
                  </p>
                </motion.div>

                {/* Feature pills in QRTags cards */}
                <motion.div
                  initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.25 }}
                  className="grid grid-cols-3 gap-3"
                >
                  {[
                    { emoji: '\uD83D\uDCF1', label: 'Wi-Fi' },
                    { emoji: '\uD83D\uDEE1\uFE0F', label: 'S\u00E9curit\u00E9' },
                    { emoji: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66', label: 'Famille' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.08 }}
                    >
                      <div className="bg-white border-2 border-black rounded-[10px] py-3 px-2 text-center shadow-[3px_3px_0_rgba(0,0,0,0.08)]">
                        <span className="text-2xl block mb-1">{item.emoji}</span>
                        <span className="text-[11px] font-bold text-black/70">{item.label}</span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Plaque badge */}
                {plaqueInfo && (
                  <motion.div
                    initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.4 }}
                  >
                    <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-[8px] px-4 py-2">
                      <span className="text-sm">\uD83D\uDFE8</span>
                      <span className="text-xs font-mono text-white/70">{plaqueInfo.activationCode}</span>
                    </div>
                  </motion.div>
                )}

                {/* CTA */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                  <QRTButton onClick={handleWelcomeNext}>
                    Commencer la configuration \u2192
                  </QRTButton>
                </motion.div>
              </motion.div>
            )}

            {/* ===== STEP 2: ACCOUNT ===== */}
            {step === 'account' && (
              <motion.div
                key="account"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="space-y-5"
              >
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                    className="mx-auto mb-3 w-14 h-14 bg-white border-2 border-black rounded-[12px] shadow-[3px_3px_0_rgba(0,0,0,0.08)] flex items-center justify-center"
                  >
                    <span className="text-2xl">\uD83D\uDC64</span>
                  </motion.div>
                  <h2 className="text-xl font-extrabold text-white">Cr\u00E9ez votre compte</h2>
                  <p className="text-white/60 text-sm mt-1">
                    {session?.user ? 'Connect\u00E9 en tant que' : 'Informations de connexion'}
                  </p>
                </div>

                {/* Google button */}
                {!session?.user && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="w-full py-3.5 px-5 rounded-[8px] text-sm font-bold flex items-center justify-center gap-3 border-2 border-black bg-white text-black hover:bg-gray-50 active:translate-y-[2px] active:shadow-[1px_1px_0_rgba(0,0,0,0.08)] shadow-[3px_3px_0_rgba(0,0,0,0.08)] transition-all cursor-pointer"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    <span>Continuer avec Google</span>
                  </motion.button>
                )}

                {/* Divider */}
                {!session?.user && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/20" />
                    <span className="text-xs font-bold text-white/40">ou</span>
                    <div className="flex-1 h-px bg-white/20" />
                  </div>
                )}

                {/* Form fields in QRTCard */}
                <QRTCard>
                  <div className="space-y-4">
                    {/* Full name */}
                    <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.2 }}>
                      <label className="text-[11px] font-bold text-black/50 uppercase tracking-wider mb-1.5 block">
                        \uD83D\uDC64 Nom complet
                      </label>
                      <input
                        type="text"
                        placeholder="Jean Dupont"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={qrtInput}
                      />
                    </motion.div>

                    {/* Email */}
                    <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.25 }}>
                      <label className="text-[11px] font-bold text-black/50 uppercase tracking-wider mb-1.5 block">
                        \u2709\uFE0F Email
                      </label>
                      <input
                        type="email"
                        placeholder="jean@exemple.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={!!session?.user}
                        className={`${qrtInput} disabled:opacity-40 disabled:cursor-not-allowed`}
                      />
                    </motion.div>

                    {/* Password */}
                    {!session?.user && (
                      <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.3 }}>
                        <label className="text-[11px] font-bold text-black/50 uppercase tracking-wider mb-1.5 block">
                          \uD83D\uDD12 Mot de passe
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="6 caract\u00E8res minimum"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={qrtInput}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60 transition-colors"
                          >
                            <span className="text-base">{showPassword ? '\uD83D\uDC41\u200D\u2B07\uFE0F' : '\uD83D\uDC41'}</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </QRTCard>

                <QRTActions onPrevious={goBack} onNext={handleAccountNext} />
              </motion.div>
            )}

            {/* ===== STEP 3: PIN ===== */}
            {step === 'pin' && (
              <motion.div
                key={`pin-${pinKey}`}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="space-y-5"
              >
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                    className="mx-auto mb-3 w-14 h-14 bg-white border-2 border-black rounded-[12px] shadow-[3px_3px_0_rgba(0,0,0,0.08)] flex items-center justify-center"
                  >
                    <span className="text-2xl">\uD83D\uDD11</span>
                  </motion.div>
                  <h2 className="text-xl font-extrabold text-white">Cr\u00E9ez votre code secret</h2>
                  <p className="text-white/60 text-sm mt-1">
                    Ce code \u00E0 4 chiffres prot\u00E9gera l&rsquo;acc\u00E8s \u00E0 votre espace Famille
                  </p>
                </div>

                {/* QRTags numeric keypad inside a card */}
                <QRTCard className="flex items-center justify-center">
                  <QRTNumericKeypad
                    key={pinKey}
                    onComplete={handlePinComplete}
                  />
                </QRTCard>

                <QRTActions
                  onPrevious={() => {
                    setPinKey((k) => k + 1);
                    setPinValue('');
                    goBack();
                  }}
                  onNext={() => {
                    // no-op: auto-advance via onComplete
                  }}
                  nextDisabled
                  nextLabel="Attendez le PIN..."
                />
              </motion.div>
            )}

            {/* ===== STEP 4: CONFIG ===== */}
            {step === 'config' && (
              <motion.div
                key="config"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="space-y-5"
              >
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                    className="mx-auto mb-3 w-14 h-14 bg-white border-2 border-black rounded-[12px] shadow-[3px_3px_0_rgba(0,0,0,0.08)] flex items-center justify-center"
                  >
                    <span className="text-2xl">\u2699\uFE0F</span>
                  </motion.div>
                  <h2 className="text-xl font-extrabold text-white">Configuration rapide</h2>
                  <p className="text-white/60 text-sm mt-1">
                    {selectedPlan === 'famille'
                      ? 'Configurez le Wi-Fi pour votre famille'
                      : 'Param\u00E9trez votre logement Airbnb'}
                  </p>
                </div>

                {/* Plan selector in QRTags cards */}
                <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.15 }}>
                  <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2 block">
                    \uD83C\uDFF7\uFE0F Votre offre
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {PLANS.map((plan) => {
                      const isSelected = selectedPlan === plan.id;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setSelectedPlan(plan.id)}
                          className={`relative border-2 rounded-[12px] p-3 text-center transition-all active:translate-y-[2px] cursor-pointer ${
                            isSelected
                              ? 'bg-white border-black shadow-[3px_3px_0_rgba(0,0,0,0.08)]'
                              : 'bg-white/50 border-black/20 hover:bg-white/70'
                          }`}
                        >
                          <span className="text-2xl block mb-1">{plan.emoji}</span>
                          <p className={`text-xs font-bold ${isSelected ? 'text-black' : 'text-black/50'}`}>
                            {plan.name}
                          </p>
                          <p className="text-[10px] text-black/40 mt-0.5 font-semibold">
                            {plan.price}{plan.period}
                          </p>
                          {'popular' in plan && plan.popular && (
                            <span className="absolute -top-1.5 -right-1.5 text-[8px] font-extrabold bg-[#6D28D9] text-white px-1.5 py-0.5 rounded-[4px] border border-black">
                              TOP
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Home name */}
                <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.2 }}>
                  <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5 block">
                    \uD83C\uDFE0 Nom du logement
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Maison Dupont, Appart Paris 15..."
                    value={homeName}
                    onChange={(e) => setHomeName(e.target.value)}
                    className={qrtInput}
                  />
                </motion.div>

                {/* Adaptive fields: Wi-Fi or Emergency */}
                {selectedPlan === 'famille' ? (
                  <QRTCard header={{ emoji: '\uD83D\uDCF1', title: 'Wi-Fi' }}>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[11px] font-bold text-black/50 uppercase tracking-wider mb-1.5 block">
                          SSID (nom du r\u00E9seau)
                        </label>
                        <input
                          type="text"
                          placeholder="MonWiFi"
                          value={wifiSsid}
                          onChange={(e) => setWifiSsid(e.target.value)}
                          className={qrtInput}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-black/50 uppercase tracking-wider mb-1.5 block">
                          Mot de passe Wi-Fi
                        </label>
                        <input
                          type="text"
                          placeholder="Mot de passe Wi-Fi"
                          value={wifiPassword}
                          onChange={(e) => setWifiPassword(e.target.value)}
                          className={qrtInput}
                        />
                      </div>
                    </div>
                  </QRTCard>
                ) : (
                  <QRTCard header={{ emoji: '\uD83D\uDCDE', title: 'Contact d\'urgence' }}>
                    <div>
                      <label className="text-[11px] font-bold text-black/50 uppercase tracking-wider mb-1.5 block">
                        Num\u00E9ro d'urgence
                      </label>
                      <input
                        type="tel"
                        placeholder="+33 6 12 34 56 78"
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value)}
                        className={qrtInput}
                      />
                    </div>
                  </QRTCard>
                )}

                {/* Summary card */}
                <QRTCard header={{ emoji: '\uD83D\uDCDD', title: 'R\u00E9capitulatif' }}>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-black/50 font-medium">Compte</span>
                      <span className="text-black font-bold truncate ml-3 max-w-[180px]">{fullName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-black/50 font-medium">Plan</span>
                      <span className="text-black font-bold capitalize">{selectedPlan.replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-black/50 font-medium">PIN</span>
                      <span className="text-black font-bold font-mono">
                        {pinValue ? '\u25CF\u25CF\u25CF\u25CF' : 'Non d\u00E9fini'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-black/50 font-medium">Logement</span>
                      <span className={`font-bold ${homeName.trim() ? 'text-black' : 'text-black/25 italic'}`}>
                        {homeName.trim() || 'Non d\u00E9fini'}
                      </span>
                    </div>
                  </div>
                </QRTCard>

                {/* Submit */}
                <div className="grid gap-4 mt-5 mb-10" style={{ gridTemplateColumns: '140px 1fr' }}>
                  <QRTButton variant="secondary" onClick={goBack}>
                    \u2190 Pr\u00E9c\u00E9dent
                  </QRTButton>
                  <QRTButton
                    variant="primary"
                    onClick={handleConfigSubmit}
                    disabled={!homeName.trim() || submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Configuration...</span>
                      </>
                    ) : (
                      <span>\u2728 Configurer maintenant \u2192</span>
                    )}
                  </QRTButton>
                </div>
              </motion.div>
            )}

            {/* ===== STEP 5: SUCCESS ===== */}
            {step === 'success' && (
              <motion.div
                key="success"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="text-center space-y-5"
              >
                {/* Big success emoji */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.8 }}
                >
                  <div className="w-24 h-24 mx-auto bg-white border-2 border-black rounded-[16px] shadow-[4px_4px_0_rgba(0,0,0,0.08)] flex items-center justify-center">
                    <span className="text-6xl">\uD83C\uDF89</span>
                  </div>
                </motion.div>

                <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.3 }}>
                  <h2 className="text-2xl font-extrabold text-white">
                    Configuration termin\u00E9e !
                  </h2>
                  <p className="text-white/70 text-sm mt-2 leading-relaxed">
                    Votre Hub est maintenant actif.<br />
                    Scannez-le \u00E0 nouveau pour commencer !
                  </p>
                </motion.div>

                {/* Success info card */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                  <QRTCard header={{ emoji: '\u2705', title: 'Votre Hub' }}>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-black/50 font-medium">Logement</span>
                        <span className="text-black font-bold">{homeName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-black/50 font-medium">Plan</span>
                        <span className="text-black font-bold capitalize">{selectedPlan.replace('_', ' ')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-black/50 font-medium">Essai gratuit</span>
                        <span className="text-emerald-600 font-bold">14 jours</span>
                      </div>
                    </div>
                  </QRTCard>
                </motion.div>

                {/* CTA buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="space-y-3"
                >
                  {hubSlug && (
                    <QRTButton onClick={() => router.push(`/hub/${hubSlug}`)}>
                      Tester mon Hub \u2192
                    </QRTButton>
                  )}
                  <QRTButton variant="secondary" onClick={() => router.push('/')}>
                    Aller au dashboard
                  </QRTButton>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
        <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-6 w-auto object-contain rounded opacity-30 mx-auto mb-1" />
        <p className="text-[10px] text-white/30 font-medium">
          qrdomotik.roomscan.pro
        </p>
      </div>
    </div>
  );
}

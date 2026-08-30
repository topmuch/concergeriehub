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
import { BrandLogo } from '@/components/ui/brand-logo';
import { EmojiIcon } from '@/components/ui/emoji-icon';
import { ProgressBar } from '@/components/ui/progress-bar';

// ── Types ──
type TokenStatus = 'loading' | 'available' | 'claimed' | 'not_found' | 'error';
type SetupStep = 'welcome' | 'type' | 'info' | 'pin' | 'config' | 'success';

interface PlaqueInfo {
  id: string;
  activationCode: string;
  batchId: string;
  quantity: number;
}

// ── Types de logement (B2B) ──
interface PropertyTypeOption {
  propertyType: 'AIRBNB' | 'GITE' | 'AGENCY_VIEW';
  plan: 'airbnb_solo' | 'agency';
  emoji: string;
  name: string;
  description: string;
  planLabel: string;
}

const PROPERTY_TYPES: PropertyTypeOption[] = [
  {
    propertyType: 'AIRBNB',
    plan: 'airbnb_solo',
    emoji: '🏠',
    name: 'Airbnb',
    description: 'Location courte durée, appartement ou maison entière',
    planLabel: 'Airbnb Solo — 9,90€/mois',
  },
  {
    propertyType: 'GITE',
    plan: 'airbnb_solo',
    emoji: '🏨',
    name: 'Gîte & Chambre d\u2019hôtes',
    description: 'Tourisme indépendant, maisons d\u2019hôtes et hébergements ruraux',
    planLabel: 'Airbnb Solo — 9,90€/mois',
  },
  {
    propertyType: 'AGENCY_VIEW',
    plan: 'agency',
    emoji: '🏢',
    name: 'Gestion multi-biens',
    description: 'Agence immobilière, co-hôtellerie, gestionnaire de plusieurs logements',
    planLabel: 'Agence — 49€/mois · jusqu\u2019à 10 biens',
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

// ── B2B input / label classes ──
const b2bInput =
  'w-full bg-white border border-slate-300 rounded-xl p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 transition-all';
const b2bLabel =
  'text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block';

// ── Step metadata for progress bar ──
const STEP_TITLES: Record<Exclude<SetupStep, 'welcome' | 'success'>, string> = {
  type: 'TYPE DE LOGEMENT',
  info: 'VOTRE LOGEMENT',
  pin: 'CODE HÔTE',
  config: 'CONFIGURATION',
};
const WIZARD_STEPS: Exclude<SetupStep, 'welcome' | 'success'>[] = ['type', 'info', 'pin', 'config'];

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

  // Property type
  const [selectedType, setSelectedType] = useState<PropertyTypeOption | null>(null);

  // Property info
  const [homeName, setHomeName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  // PIN
  const [pinKey, setPinKey] = useState(0);
  const [pinValue, setPinValue] = useState('');

  // Config
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
  const stepOrder: SetupStep[] = ['welcome', 'type', 'info', 'pin', 'config', 'success'];

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
  const handleWelcomeNext = () => {
    if (!selectedType) {
      // Pass direct à l'étape type
      setDirection(1);
      setStep('type');
      return;
    }
    goNext();
  };

  const handleTypeSelect = (option: PropertyTypeOption) => {
    setSelectedType(option);
  };

  const handleTypeNext = () => {
    if (!selectedType) {
      toast.error('Choisissez un type de logement');
      return;
    }
    goNext();
  };

  // ── Geolocation ──
  const handleLocate = () => {
    if (!navigator.geolocation) {
      toast.error('Géolocalisation non disponible sur cet appareil');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) });
        setLocating(false);
        toast.success('Position enregistrée — vos prestataires locaux seront priorisés');
      },
      () => {
        setLocating(false);
        toast.error('Impossible d\u2019obtenir la position. Renseignez l\u2019adresse manuellement.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  const handleInfoNext = () => {
    if (!fullName.trim()) { toast.error('Entrez votre nom'); return; }
    if (!email.trim() || !email.includes('@')) { toast.error('Email invalide'); return; }
    if (!session?.user && (!password || password.length < 6)) {
      toast.error('Mot de passe requis (6+ caractères)');
      return;
    }
    if (!homeName.trim()) { toast.error('Nommez votre logement'); return; }
    goNext();
  };

  const handlePinComplete = (enteredPin: string) => {
    setPinValue(enteredPin);
    setTimeout(() => goNext(), 400);
  };

  const handleConfigSubmit = async () => {
    if (!selectedType) { toast.error('Type de logement manquant'); return; }
    if (!pinValue) { toast.error('Définissez votre code hôte'); goBack(); return; }

    setSubmitting(true);
    try {
      const body: Record<string, string | number> = {
        email: email.trim(),
        fullName: fullName.trim(),
        pin: pinValue,
        homeName: homeName.trim(),
        plan: selectedType.plan,
        propertyType: selectedType.propertyType === 'AGENCY_VIEW' ? 'AIRBNB' : selectedType.propertyType,
      };

      if (address.trim()) body.address = address.trim();
      if (coords) {
        body.latitude = coords.lat;
        body.longitude = coords.lng;
      }
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
        }, 4000);
      } else {
        setTimeout(() => {
          window.location.href = '/';
        }, 4000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Progress ──
  const wizardIdx = WIZARD_STEPS.indexOf(step as Exclude<SetupStep, 'welcome' | 'success'>);

  // ── Loading state ──
  if (tokenStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-center">
            <span className="text-3xl">🗝️</span>
          </div>
          <p className="text-slate-600 font-semibold text-sm">Vérification de votre plaque...</p>
          <p className="text-xs text-slate-400 font-mono">{token}</p>
        </div>
      </div>
    );
  }

  // ── Error states ──
  if (tokenStatus === 'not_found' || tokenStatus === 'error') {
    const isError = tokenStatus === 'error';
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <QRTCard className="text-center">
            <div className="mb-4">
              <EmojiIcon emoji={isError ? '⚠️' : '❌'} size="xl" variant="plain" className="mx-auto" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 mb-1">
              {isError ? 'Erreur' : 'Plaque non trouvée'}
            </h1>
            <p className="text-xs text-slate-400 font-mono mb-1">{token}</p>
            <p className="text-sm text-slate-600 mb-6">
              {isError
                ? 'Impossible de vérifier la plaque. Réessayez.'
                : "Ce code d'activation n'existe pas. Vérifiez votre plaque et réessayez."}
            </p>
            <QRTButton onClick={() => { setTokenStatus('loading'); checkToken(); }}>
              Réessayer →
            </QRTButton>
          </QRTCard>
        </div>
      </div>
    );
  }

  // ── Already claimed ──
  if (tokenStatus === 'claimed') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <QRTCard className="text-center">
            <div className="mb-4">
              <EmojiIcon emoji="✅" size="xl" variant="plain" className="mx-auto" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 mb-2">Plaque déjà configurée</h1>
            {claimedInfo.homeName && (
              <p className="text-sm text-slate-600 mb-1">
                Logement : <span className="font-semibold">{claimedInfo.homeName}</span>
              </p>
            )}
            <p className="text-sm text-slate-500 mb-6">Cette plaque est déjà liée à un compte.</p>
            {claimedInfo.hubSlug && (
              <div className="mb-3">
                <QRTButton onClick={() => router.push(`/hub/${claimedInfo.hubSlug}`)}>
                  Accéder au Hub →
                </QRTButton>
              </div>
            )}
            <QRTButton variant="secondary" onClick={() => router.push('/')}>
              Aller à l'accueil
            </QRTButton>
          </QRTCard>
        </div>
      </div>
    );
  }

  // ── Main multi-step wizard ──
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Header */}
      <div className="w-full px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-md mx-auto">
          {/* Logo + step indicator */}
          <div className="flex items-center justify-between mb-4">
            <BrandLogo size="sm" />
            {wizardIdx >= 0 && (
              <span className="text-xs font-semibold text-slate-500">
                Étape {wizardIdx + 1} / 4
              </span>
            )}
          </div>

          {/* Progress bar (only during wizard steps) */}
          {wizardIdx >= 0 && (
            <QRTProgressBar
              currentStep={wizardIdx + 1}
              totalSteps={4}
              stepTitle={STEP_TITLES[step as Exclude<SetupStep, 'welcome' | 'success'>]}
            />
          )}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-5 py-4">
        <div className="w-full max-w-md relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>

            {/* ===== STEP 0: WELCOME ===== */}
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
                  <EmojiIcon emoji="🗝️" size="xl" variant="accent" className="mx-auto" />
                </motion.div>

                <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.15 }}>
                  <h1 className="text-2xl font-bold text-slate-900 mb-2">
                    Bienvenue ! 🎉
                  </h1>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Votre plaque <span className="font-semibold text-slate-900">Conciergerie Hub</span> est prête à être configurée.<br />
                    Cela ne prend que 2 minutes.
                  </p>
                </motion.div>

                {/* Feature pills */}
                <motion.div
                  initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.25 }}
                  className="grid grid-cols-3 gap-3"
                >
                  {[
                    { emoji: '📶', label: 'Wi-Fi invités' },
                    { emoji: '📖', label: 'Guidebook' },
                    { emoji: '🛎️', label: 'Prestataires' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.08 }}
                    >
                      <div className="bg-white border border-slate-200 rounded-xl py-3 px-2 text-center shadow-sm">
                        <span className="text-2xl block mb-1">{item.emoji}</span>
                        <span className="text-[11px] font-semibold text-slate-600">{item.label}</span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Plaque badge */}
                {plaqueInfo && (
                  <motion.div
                    initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.4 }}
                  >
                    <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
                      <span className="text-sm">🏷️</span>
                      <span className="text-xs font-mono text-slate-500">{plaqueInfo.activationCode}</span>
                    </div>
                  </motion.div>
                )}

                {/* CTA */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                  <QRTButton variant="accent" onClick={handleWelcomeNext}>
                    Commencer la configuration →
                  </QRTButton>
                </motion.div>
              </motion.div>
            )}

            {/* ===== STEP 1: PROPERTY TYPE ===== */}
            {step === 'type' && (
              <motion.div
                key="type"
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
                    className="mx-auto mb-3"
                  >
                    <EmojiIcon emoji="🏘️" size="lg" />
                  </motion.div>
                  <h2 className="text-xl font-bold text-slate-900">Votre logement</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Quel type de bien gérez-vous ?
                  </p>
                </div>

                {/* Type cards */}
                <div className="space-y-3">
                  {PROPERTY_TYPES.map((option, i) => {
                    const isSelected =
                      selectedType?.propertyType === option.propertyType && selectedType?.plan === option.plan;
                    return (
                      <motion.button
                        key={option.name}
                        type="button"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.08 }}
                        onClick={() => handleTypeSelect(option)}
                        className={`w-full text-left bg-white border rounded-xl p-4 flex items-center gap-4 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-emerald-600 ring-2 ring-emerald-600/15 shadow-md'
                            : 'border-slate-200 shadow-sm hover:border-slate-300 hover:shadow'
                        }`}
                        aria-pressed={isSelected}
                      >
                        <EmojiIcon emoji={option.emoji} size="lg" variant={isSelected ? 'accent' : 'default'} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">{option.name}</span>
                          <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">{option.description}</span>
                          <span className={`inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            isSelected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'
                          }`}>
                            {option.planLabel}
                          </span>
                        </span>
                        {/* Radio dot */}
                        <span className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-emerald-600' : 'border-slate-300'
                        }`}>
                          {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Note */}
                <p className="text-center text-xs text-slate-400 leading-relaxed px-4">
                  📍 Votre adresse servira à trouver les meilleurs prestataires autour du logement.
                  Essai gratuit de 14 jours, sans engagement.
                </p>

                <QRTActions onPrevious={goBack} onNext={handleTypeNext} nextAccent nextLabel="Continuer →" />
              </motion.div>
            )}

            {/* ===== STEP 2: PROPERTY INFO (+ host account) ===== */}
            {step === 'info' && (
              <motion.div
                key="info"
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
                    className="mx-auto mb-3"
                  >
                    <EmojiIcon emoji="📝" size="lg" />
                  </motion.div>
                  <h2 className="text-xl font-bold text-slate-900">Informations du logement</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    {session?.user ? 'Complétez les informations de votre bien' : 'Votre compte hôte et votre bien'}
                  </p>
                </div>

                {/* Host account (QRTCard) */}
                <QRTCard header={{ emoji: '👤', title: session?.user ? 'Votre compte' : 'Créez votre compte hôte' }}>
                  <div className="space-y-4">
                    {/* Full name */}
                    <div>
                      <label className={b2bLabel} htmlFor="setup-fullname">Nom complet</label>
                      <input
                        id="setup-fullname"
                        type="text"
                        placeholder="Jean Dupont"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={b2bInput}
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className={b2bLabel} htmlFor="setup-email">Email</label>
                      <input
                        id="setup-email"
                        type="email"
                        placeholder="jean@exemple.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={!!session?.user}
                        className={`${b2bInput} disabled:opacity-40 disabled:cursor-not-allowed`}
                      />
                    </div>

                    {/* Password */}
                    {!session?.user && (
                      <div>
                        <label className={b2bLabel} htmlFor="setup-password">Mot de passe</label>
                        <div className="relative">
                          <input
                            id="setup-password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="6 caractères minimum"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`${b2bInput} pr-12`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <span className="text-base">{showPassword ? '🙈' : '👁️'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </QRTCard>

                {/* Property info (QRTCard) */}
                <QRTCard header={{ emoji: '🏡', title: 'Votre logement', badge: selectedType?.name }}>
                  <div className="space-y-4">
                    {/* Property name */}
                    <div>
                      <label className={b2bLabel} htmlFor="setup-homename">Nom de l'annonce</label>
                      <input
                        id="setup-homename"
                        type="text"
                        placeholder="ex : Loft Canal Saint-Martin"
                        value={homeName}
                        onChange={(e) => setHomeName(e.target.value)}
                        className={b2bInput}
                      />
                    </div>

                    {/* Address */}
                    <div>
                      <label className={b2bLabel} htmlFor="setup-address">Adresse précise</label>
                      <input
                        id="setup-address"
                        type="text"
                        placeholder="12 rue de la Paix, 75002 Paris"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className={b2bInput}
                      />
                      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                        📍 Utilisée pour localiser les prestataires près du logement (ménage, maintenance…)
                      </p>
                    </div>

                    {/* Geolocate button */}
                    <button
                      type="button"
                      onClick={handleLocate}
                      disabled={locating}
                      className="w-full flex items-center justify-center gap-2 border border-slate-300 bg-white rounded-xl py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {locating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Localisation...
                        </>
                      ) : coords ? (
                        <>
                          ✅ Position enregistrée
                          <span className="text-xs font-mono text-slate-400">
                            ({coords.lat}, {coords.lng})
                          </span>
                        </>
                      ) : (
                        <>📍 Utiliser ma position actuelle</>
                      )}
                    </button>
                  </div>
                </QRTCard>

                <QRTActions onPrevious={goBack} onNext={handleInfoNext} nextAccent nextLabel="Continuer →" />
              </motion.div>
            )}

            {/* ===== STEP 3: HOST PIN ===== */}
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
                    className="mx-auto mb-3"
                  >
                    <EmojiIcon emoji="🔐" size="lg" variant="accent" />
                  </motion.div>
                  <h2 className="text-xl font-bold text-slate-900">Créez votre code hôte</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Ce code à 4 chiffres protège votre <span className="font-semibold text-slate-700">Mode Hôte</span> sur l'écran du logement
                  </p>
                </div>

                {/* Numeric keypad inside a card */}
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

            {/* ===== STEP 4: QUICK CONFIG ===== */}
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
                    className="mx-auto mb-3"
                  >
                    <EmojiIcon emoji="⚡" size="lg" />
                  </motion.div>
                  <h2 className="text-xl font-bold text-slate-900">Configuration rapide</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Le Wi-Fi et le Guidebook — modifiables à tout moment
                  </p>
                </div>

                {/* Wi-Fi card */}
                <QRTCard header={{ emoji: '📶', title: 'Wi-Fi invités' }} subtitle="Vos invités se connectent en 1 scan">
                  <div className="space-y-4">
                    <div>
                      <label className={b2bLabel} htmlFor="setup-wifi-ssid">Nom du réseau (SSID)</label>
                      <input
                        id="setup-wifi-ssid"
                        type="text"
                        placeholder="MonWiFi"
                        value={wifiSsid}
                        onChange={(e) => setWifiSsid(e.target.value)}
                        className={b2bInput}
                      />
                    </div>
                    <div>
                      <label className={b2bLabel} htmlFor="setup-wifi-password">Mot de passe Wi-Fi</label>
                      <input
                        id="setup-wifi-password"
                        type="text"
                        placeholder="Mot de passe du réseau"
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                        className={b2bInput}
                      />
                    </div>
                  </div>
                </QRTCard>

                {/* Modules included */}
                <QRTCard header={{ emoji: '🧩', title: 'Modules activés par défaut', badge: 'Inclus' }}>
                  <div className="space-y-2.5">
                    {[
                      { emoji: '📶', name: 'Wi-Fi', desc: 'Connexion en 1 scan', on: true },
                      { emoji: '📖', name: 'Guidebook', desc: 'Guide de bienvenue digital', on: true },
                      { emoji: '🛎️', name: 'Annuaire de prestataires', desc: 'Activable après géolocalisation', on: false },
                      { emoji: '💳', name: 'Upselling', desc: 'Services à la carte (déco, petit-déj…)', on: false },
                    ].map((mod) => (
                      <div key={mod.name} className="flex items-center gap-3 py-1.5">
                        <EmojiIcon emoji={mod.emoji} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{mod.name}</p>
                          <p className="text-xs text-slate-500">{mod.desc}</p>
                        </div>
                        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${
                          mod.on
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}>
                          {mod.on ? 'Activé' : 'Plus tard'}
                        </span>
                      </div>
                    ))}
                  </div>
                </QRTCard>

                {/* Summary card */}
                <QRTCard header={{ emoji: '📋', title: 'Récapitulatif' }}>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Compte</span>
                      <span className="text-slate-900 font-semibold truncate ml-3 max-w-[180px]">{fullName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Type</span>
                      <span className="text-slate-900 font-semibold">{selectedType?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Offre</span>
                      <span className="text-slate-900 font-semibold">{selectedType?.planLabel}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Code hôte</span>
                      <span className="text-slate-900 font-semibold font-mono">
                        {pinValue ? '●●●●' : 'Non défini'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Logement</span>
                      <span className={`font-semibold ${homeName.trim() ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                        {homeName.trim() || 'Non défini'}
                      </span>
                    </div>
                  </div>
                </QRTCard>

                {/* Submit */}
                <div className="grid gap-4 mt-5 mb-10" style={{ gridTemplateColumns: '140px 1fr' }}>
                  <QRTButton variant="secondary" onClick={goBack}>
                    ← Précédent
                  </QRTButton>
                  <QRTButton
                    variant="accent"
                    onClick={handleConfigSubmit}
                    disabled={!homeName.trim() || submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Configuration...</span>
                      </>
                    ) : (
                      <span>✨ Configurer maintenant →</span>
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
                {/* Animated success check */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.8 }}
                  className="relative mx-auto w-24 h-24"
                >
                  {/* Confetti emojis */}
                  {['🎉', '✨', '🗝️', '🎊', '⭐', '🧹'].map((e, i) => (
                    <motion.span
                      key={i}
                      className="absolute text-xl"
                      initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                      animate={{
                        opacity: [0, 1, 0],
                        x: Math.cos((i / 6) * Math.PI * 2) * 80,
                        y: Math.sin((i / 6) * Math.PI * 2) * 80,
                        scale: [0.4, 1.2, 0.8],
                      }}
                      transition={{ duration: 1.4, delay: 0.35 + i * 0.06, ease: 'easeOut' }}
                    >
                      {e}
                    </motion.span>
                  ))}
                  {/* Green check circle */}
                  <div className="w-24 h-24 rounded-full bg-emerald-600 shadow-lg shadow-emerald-600/30 flex items-center justify-center">
                    <motion.svg
                      width="44"
                      height="44"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </motion.svg>
                  </div>
                </motion.div>

                <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={{ delay: 0.4 }}>
                  <h2 className="text-2xl font-bold text-slate-900">
                    Configuration terminée !
                  </h2>
                  <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                    Votre <span className="font-semibold text-slate-900">Conciergerie Hub</span> est maintenant actif.<br />
                    Redirection vers votre tableau de bord...
                  </p>
                </motion.div>

                {/* Auto-redirect progress */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                  <ProgressBar value={100} size="sm" className="max-w-[240px] mx-auto" />
                </motion.div>

                {/* Success info card */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                  <QRTCard header={{ emoji: '✅', title: 'Votre Hub' }}>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Logement</span>
                        <span className="text-slate-900 font-semibold">{homeName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Offre</span>
                        <span className="text-slate-900 font-semibold">{selectedType?.planLabel}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Essai gratuit</span>
                        <span className="text-emerald-600 font-semibold">14 jours</span>
                      </div>
                    </div>
                  </QRTCard>
                </motion.div>

                {/* CTA buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="space-y-3"
                >
                  {hubSlug && (
                    <QRTButton onClick={() => router.push(`/hub/${hubSlug}`)}>
                      Tester mon Hub →
                    </QRTButton>
                  )}
                  <QRTButton variant="secondary" onClick={() => { window.location.href = '/'; }}>
                    Aller au tableau de bord
                  </QRTButton>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
        <BrandLogo size="sm" className="opacity-30 justify-center w-full" />
        <p className="text-[10px] text-slate-400 font-medium mt-1">
          La conciergerie digitale des hôtes
        </p>
      </div>
    </div>
  );
}

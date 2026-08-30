'use client';

import { use, useState, useEffect, useCallback, useMemo } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { QRTCard, QRTButton, QRTActions, QRTProgressBar, QRTNumericKeypad } from '@/components/qrtags';

// ── Types ──
type ActivateStep = 'check' | 'profile' | 'account' | 'pin' | 'config' | 'success' | 'error';
type ProfileType = 'famille' | 'airbnb_solo' | 'airbnb_pro';

type CodeCheckResult =
  | { ok: true; status: 'available'; physicalQrId: string }
  | { ok: true; status: 'active'; slug: string }
  | { ok: false; error: string };

// ── Plans ──
const PLANS: { id: ProfileType; emoji: string; label: string; price: string; color: string }[] = [
  { id: 'famille', emoji: '\uD83C\uDFE0', label: 'Famille', price: '49\u20AC/an', color: 'bg-[#6D28D9] text-white' },
  { id: 'airbnb_solo', emoji: '\uD83C\uDFE8', label: 'Airbnb Solo', price: '9,90\u20AC/mois', color: 'bg-[#7C3AED] text-white' },
  { id: 'airbnb_pro', emoji: '\u2B50', label: 'Airbnb Pro', price: '199\u20AC/an', color: 'bg-[#5B21B6] text-white' },
];

const STEP_TITLES: Record<string, string> = {
  check: 'VÉRIFICATION',
  profile: 'VOTRE PROFIL',
  account: 'VOS INFORMATIONS',
  pin: 'CODE SECRET',
  config: 'CONFIGURATION',
  success: 'TERMINÉ',
};

const TOTAL_STEPS = 5;

// ── Animation variants ──
const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
};

// ── Input style QRTags ──
const qrtInput =
  'w-full h-12 px-4 bg-gray-50 border-2 border-gray-200 rounded-[8px] text-[15px] font-medium text-black placeholder:text-gray-400 focus:outline-none focus:border-[#6D28D9] focus:bg-white transition-colors';

// ════════════════════════════════════════════════════════
export function ActivatePageContent({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { data: session, status: authStatus } = useSession();

  // Wizard state
  const [step, setStep] = useState<ActivateStep>('check');
  const [direction, setDirection] = useState(1);
  const [physicalQrId, setPhysicalQrId] = useState('');

  // Step data
  const [profile, setProfile] = useState<ProfileType>('famille');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [homeName, setHomeName] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [hubSlug, setHubSlug] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Computed step number for progress bar
  const stepNumber = useMemo(() => {
    const map: Record<string, number> = { profile: 1, account: 2, pin: 3, config: 4, success: 5 };
    return map[step] || 1;
  }, [step]);

  // ── Check code on mount (uses /api/setup/[code] which handles both setupToken and activationCode) ──
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`/api/setup/${encodeURIComponent(code)}`);
        const data = await res.json();

        if (!res.ok) {
          setStep('error');
          setErrorMsg(data.error || 'Ce QR code n\'existe pas.');
          return;
        }

        // Already claimed/activated → redirect to hub
        if (data.status === 'claimed') {
          if (data.hubSlug) {
            window.location.href = `/hub/${data.hubSlug}`;
          } else {
            setStep('error');
            setErrorMsg('Cette plaque est déjà configurée.');
          }
          return;
        }

        // Available for setup
        if (data.plaque?.id) setPhysicalQrId(data.plaque.id);

        // Pre-fill if logged in
        if (session?.user) {
          const u = session.user as Record<string, unknown>;
          setEmail((u?.email as string) || '');
          setFullName((u?.name as string) || '');
        }
        setStep('profile');
      } catch {
        setStep('error');
        setErrorMsg('Impossible de vérifier le code. Réessayez.');
      }
    }
    check();
  }, [code]);

  // ── Navigation ──
  const goNext = () => {
    setDirection(1);
    const order: ActivateStep[] = ['profile', 'account', 'pin', 'config', 'success'];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) setStep(order[idx + 1]);
  };
   const goBack = () => {
    setDirection(-1);
    const order: ActivateStep[] = ['profile', 'account', 'pin', 'config', 'success'];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };

  // ── Validation helpers ──
  const canGoNext = useMemo(() => {
    if (step === 'profile') return true;
    if (step === 'account') {
      if (session?.user) return true;
      return email.includes('@') && password.length >= 6 && fullName.trim().length > 0;
    }
    if (step === 'config') return homeName.trim().length > 0;
    return true;
  }, [step, email, password, fullName, homeName, session]);

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const body: Record<string, string> = {
        email: email.trim(),
        fullName: fullName.trim(),
        pin: pinValue,
        homeName: homeName.trim(),
        plan: profile,
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

      const res = await fetch(`/api/setup/${encodeURIComponent(code)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'activation');

      setHubSlug(data.hubSlug || '');
      setDirection(1);
      setStep('success');

      // Auto-login for new users
      if (data.isNewUser) {
        setTimeout(async () => {
          try {
            const loginRes = await fetch('/api/auth/callback/credentials', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                email: email.trim(), password, callbackUrl: '/',
              }).toString(),
            });
            if (loginRes.ok) window.location.href = '/';
          } catch { /* stay on success */ }
        }, 3000);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [code, email, fullName, password, pinValue, homeName, profile, wifiSsid, wifiPassword, emergencyPhone, session]);

  // ── Handle PIN complete ──
  const handlePinComplete = useCallback((pin: string) => {
    setPinValue(pin);
    setTimeout(goNext, 300);
  }, [goNext]);

  // ══════════════════════════════════════════════════════
  // LOADING
  // ══════════════════════════════════════════════════════
  if (authStatus === 'loading' || step === 'check') {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white/70 text-sm font-medium">Vérification du QR code...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // ERROR
  // ══════════════════════════════════════════════════════
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center p-6">
        <QRTCard className="max-w-sm w-full text-center">
          <p className="text-4xl mb-4">\u274C</p>
          <h2 className="text-lg font-extrabold text-black uppercase mb-2">QR Code indisponible</h2>
          <p className="text-sm text-gray-600 mb-1 font-mono">{code}</p>
          <p className="text-sm text-gray-500 mb-5">{errorMsg}</p>
          <QRTButton variant="primary" onClick={() => { window.location.href = '/'; }}>
            Retour à l\'accueil
          </QRTButton>
        </QRTCard>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // SUCCESS
  // ══════════════════════════════════════════════════════
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <QRTCard className="max-w-sm w-full text-center">
            <p className="text-6xl mb-4">\uD83C\uDF89</p>
            <h2 className="text-xl font-extrabold text-black uppercase mb-2">Tout est prêt !</h2>
            <p className="text-sm text-gray-500 mb-6">Votre maison connectée est configurée.</p>
            {hubSlug && (
              <div className="bg-gray-50 border-2 border-gray-200 rounded-[8px] p-4 mb-5 text-left">
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Votre Hub</p>
                <p className="text-sm font-bold text-[#6D28D9] font-mono break-all">qrdomotik.roomscan.pro/hub/{hubSlug}</p>
              </div>
            )}
            <QRTButton
              variant="primary"
              onClick={() => { window.location.href = hubSlug ? `/hub/${hubSlug}` : '/'; }}
            >
              Accéder à mon Hub →
            </QRTButton>
          </QRTCard>
        </motion.div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // WIZARD (Steps 1-4)
  // ══════════════════════════════════════════════════════
  const stepTitle = STEP_TITLES[step] || '';
  const showProgress = !['check', 'error', 'success'].includes(step);

  return (
    <div className="min-h-screen bg-[#8B5CF6] flex flex-col">
      {/* Top brand */}
      <div className="px-5 pt-12 pb-2">
        <div className="max-w-sm mx-auto flex items-center gap-2.5">
          <div className="h-9 w-9 bg-white/20 rounded-[8px] flex items-center justify-center text-sm font-extrabold text-white">QR</div>
          <span className="text-sm font-extrabold text-white tracking-wide">QR DOMOTIK</span>
        </div>
      </div>

      {/* Progress bar (steps 1-4 only) */}
      {showProgress && (
        <div className="px-5 pt-4">
          <div className="max-w-sm mx-auto">
            <QRTProgressBar
              currentStep={stepNumber}
              totalSteps={TOTAL_STEPS}
              stepTitle={stepTitle}
            />
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-5 py-4 overflow-y-auto">
        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {/* ─── STEP 1 : PROFILE ─── */}
              {step === 'profile' && (
                <QRTCard header={{ emoji: '\uD83D\uDC64', title: 'Votre profil', badge: 'Étape 1' }}>
                  <p className="text-sm text-gray-500 mb-5">Choisissez le type d\'utilisation.</p>
                  <div className="space-y-3">
                    {PLANS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProfile(p.id)}
                        className={`w-full flex items-center gap-4 p-4 rounded-[10px] border-2 transition-all cursor-pointer text-left
                          ${profile === p.id
                            ? 'border-[#6D28D9] bg-[#6D28D9]/5 shadow-[2px_2px_0_rgba(109,40,217,0.15)]'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                      >
                        <span className="text-2xl">{p.emoji}</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-black">{p.label}</p>
                          <p className="text-xs text-gray-400">{p.price}</p>
                        </div>
                        {profile === p.id && (
                          <div className="h-5 w-5 rounded-full bg-[#6D28D9] flex items-center justify-center">
                            <span className="text-white text-xs font-bold">\u2713</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <QRTActions onNext={goNext} nextLabel="Suivant →" />
                </QRTCard>
              )}

              {/* ─── STEP 2 : ACCOUNT ─── */}
              {step === 'account' && (
                <QRTCard header={{ emoji: '\uD83D\uDCDD', title: 'Vos informations', badge: 'Étape 2' }}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Nom complet</label>
                      <input
                        type="text"
                        placeholder="Marie Dupont"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={qrtInput}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Email</label>
                      <input
                        type="email"
                        placeholder="vous@exemple.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={qrtInput}
                      />
                    </div>
                    {!session?.user && (
                      <div>
                        <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Mot de passe</label>
                        <input
                          type="password"
                          placeholder="Minimum 6 caractères"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={qrtInput}
                        />
                      </div>
                    )}
                  </div>
                  <QRTActions
                    onPrevious={goBack}
                    onNext={goNext}
                    nextDisabled={!canGoNext}
                    nextLabel="Suivant →"
                  />
                </QRTCard>
              )}

              {/* ─── STEP 3 : PIN ─── */}
              {step === 'pin' && (
                <QRTCard header={{ emoji: '\uD83D\uDD10', title: 'Code secret', badge: 'Étape 3' }}>
                  <p className="text-sm text-gray-500 mb-6 text-center">
                    Choisissez un code à 4 chiffres pour protéger l\'accès Famille.
                  </p>
                  <QRTNumericKeypad onComplete={handlePinComplete} />
                  {pinValue && (
                    <div className="mt-5">
                      <QRTActions onPrevious={goBack} onNext={goNext} nextLabel="Suivant →" />
                    </div>
                  )}
                </QRTCard>
              )}

              {/* ─── STEP 4 : CONFIG ─── */}
              {step === 'config' && (
                <QRTCard header={{ emoji: '\u2699\uFE0F', title: 'Configuration', badge: 'Étape 4' }}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                        Nom du logement
                      </label>
                      <input
                        type="text"
                        placeholder="Le Petit Nid"
                        value={homeName}
                        onChange={(e) => setHomeName(e.target.value)}
                        className={qrtInput}
                      />
                    </div>

                    {profile === 'famille' && (
                      <>
                        <div className="h-px bg-gray-100 my-2" />
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">WiFi (optionnel)</p>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Nom du réseau</label>
                            <input
                              type="text"
                              placeholder="MonWiFi_5G"
                              value={wifiSsid}
                              onChange={(e) => setWifiSsid(e.target.value)}
                              className={qrtInput}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Mot de passe WiFi</label>
                            <input
                              type="text"
                              placeholder="MonMotDePasse"
                              value={wifiPassword}
                              onChange={(e) => setWifiPassword(e.target.value)}
                              className={qrtInput}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                        Téléphone d\'urgence (optionnel)
                      </label>
                      <input
                        type="tel"
                        placeholder="+33 6 12 34 56 78"
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value)}
                        className={qrtInput}
                      />
                    </div>

                    {errorMsg && (
                      <div className="bg-red-50 border-2 border-red-200 rounded-[8px] p-3 text-sm text-red-700 font-medium">
                        {errorMsg}
                      </div>
                    )}
                  </div>
                  <QRTActions
                    onPrevious={goBack}
                    onNext={handleSubmit}
                    nextDisabled={!canGoNext || submitting}
                    nextLabel={submitting ? 'Configuration...' : '\u2713 Valider →'}
                  />
                </QRTCard>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-8 pt-4">
        <p className="text-center text-[10px] text-white/30 font-medium">
          <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-6 w-auto object-contain rounded opacity-30" />
        </p>
      </div>
    </div>
  );
}

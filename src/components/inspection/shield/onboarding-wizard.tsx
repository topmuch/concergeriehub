'use client';

// =============================================================
// WIZARD D'ONBOARDING DYNAMIQUE (post-paiement) — 3 étapes + capture
//
// RÈGLE D'OR : 100 % DYNAMIQUE. Si l'hôte n'a pas de machine à laver,
// « Machine à laver » n'apparaît NULLE PART (UI, capture, PDF).
// Le serveur dérive pieces / equipementsCoches / nbPhotosMenage des
// choix réels → le PDF ne contient AUCUNE case vide « N/A ».
//
//   Question 0 (TASK 39) : « Avez-vous les photos de référence avec
//   vous ? » — OUI → parcours complet (upload + PDF). NON → MODE
//   DÉLÉGATION : configuration textuelle seule → écran de délégation
//   (lien magique /upload/[token] + partage WhatsApp / Email / Copier),
//   bien en PENDING_PHOTOS jusqu'à la réception des photos de l'équipe.
//
//   Étape 1 : chambres (Studio/1/2/3+) + pièces supplémentaires
//   Étape 2 : équipements présents (14 kinds, 4 catégories)
//   Étape 3 : récapitulatif + infos logement
//   Capture : 1 photo par pièce, puis 1 photo par équipement (OUI)
//   Succès  : bibliothèque verrouillée + certificat PDF (OUI)
//             ou écran de délégation (NON)
// =============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, ChevronRight, Copy, Loader2, Lock, Mail } from 'lucide-react';
import {
  SHIELD_DEVICE_CATEGORIES,
  SHIELD_DEVICE_KINDS,
} from '@/lib/shield-refs';
import { ShieldPhotoCapture } from '@/components/inspection/shield/shield-capture';

// ---------- Constantes du parcours ----------

/** Pièces de base (toujours présentes, pré-cochées et verrouillées). */
const BASE_PIECES = ['SALON', 'COULOIR', 'CUISINE', 'TOILETTE / SDB'] as const;

/** Pièces optionnelles (l'hôte coche ce qu'il a). */
const OPTIONAL_PIECES = [
  { id: 'BALCON / TERRASSE', label: 'Balcon / Terrasse' },
  { id: 'BUREAU', label: 'Bureau' },
] as const;

const CHAMBRE_OPTIONS = [
  { value: 0, label: 'Studio', hint: '0 chambre' },
  { value: 1, label: '1 chambre', hint: '' },
  { value: 2, label: '2 chambres', hint: '' },
  { value: 3, label: '3 chambres+', hint: 'et plus' },
] as const;

/** Pièces du logement dans l'ordre du walkthrough
 *  (salon > couloir > chambres > cuisine > toilette > extras). */
function buildZones(nbChambres: number, extras: Set<string>): string[] {
  const zones: string[] = ['SALON', 'COULOIR'];
  for (let i = 1; i <= nbChambres; i++) zones.push(`CHAMBRE ${i}`);
  zones.push('CUISINE', 'TOILETTE / SDB');
  if (extras.has('BALCON / TERRASSE')) zones.push('BALCON / TERRASSE');
  if (extras.has('BUREAU')) zones.push('BUREAU');
  return zones;
}

const stepVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

// ---------- Composant principal ----------

export default function OnboardingWizard() {
  // ── État du formulaire ──
  const [step, setStep] = useState(1);
  // TASK 39 — Question 0 pivot : null = pas encore répondu.
  const [hasPhotos, setHasPhotos] = useState<boolean | null>(null);
  const [nbChambres, setNbChambres] = useState<number | null>(null);
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [equipements, setEquipements] = useState<Set<string>>(new Set());
  const [propertyName, setPropertyName] = useState('Mon logement');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [city, setCity] = useState('DAKAR');
  const [nameTouched, setNameTouched] = useState(false);

  // ── État capture / envoi ──
  const [phase, setPhase] = useState<'form' | 'capture' | 'submitting' | 'success'>('form');
  const [captureIndex, setCaptureIndex] = useState(0);
  const [zonePhotos, setZonePhotos] = useState<Record<string, string>>({});
  const [devicePhotos, setDevicePhotos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'none' | 'auth' | 'abonnement'>('none');
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [result, setResult] = useState<{
    id: string;
    onboardingRef: string;
    onboardingStatus?: string;
    delegationToken?: string;
    delegationTokenExpiresAt?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // TASK 39 — mode délégation actif (photos pas avec l'hôte).
  const delegation = hasPhotos === false;

  // Session NextAuth → préremplit « Votre nom ».
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s: { user?: { name?: string | null } | null } | null) => {
        if (!alive) return;
        const name = s?.user?.name?.trim() || '';
        setLoggedIn(Boolean(s?.user));
        if (name && !nameTouched) setOwnerName(name);
      })
      .catch(() => setLoggedIn(false));
    return () => {
      alive = false;
    };
  }, [nameTouched]);

  // ── Données dérivées (100 % dynamiques) ──
  const zones = useMemo(
    () => buildZones(nbChambres ?? 0, extras),
    [nbChambres, extras],
  );
  const devices = useMemo(
    () => SHIELD_DEVICE_KINDS.filter((k) => equipements.has(k.kind)),
    [equipements],
  );
  const nbPhotosMenage = zones.length; // 1 photo de référence par pièce

  /** File de capture : pièces d'abord, puis équipements. */
  const captureQueue = useMemo(
    () => [
      ...zones.map((z) => ({ type: 'zone' as const, name: z })),
      ...devices.map((d) => ({ type: 'device' as const, name: d.name, kind: d.kind })),
    ],
    [zones, devices],
  );

  const toggleExtra = (id: string) => {
    setExtras((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEquipement = (kind: string) => {
    setEquipements((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  // ── Validation par étape ──
  const step0Valid = hasPhotos !== null; // Question 0 pivot (TASK 39)
  const step1Valid = hasPhotos !== null && nbChambres !== null;
  const step2Valid = equipements.size >= 1; // bibliothèque vide = PDF amateur → ≥ 1
  const step3Valid =
    propertyName.trim().length > 0 &&
    propertyAddress.trim().length > 0 &&
    ownerName.trim().length > 0 &&
    city.trim().length > 0;

  // ── Capture guidée ──
  const currentItem = captureQueue[captureIndex];
  const photoFor = (item: (typeof captureQueue)[number]): string | undefined =>
    item.type === 'zone' ? zonePhotos[item.name] : devicePhotos[item.name];

  const confirmPhoto = useCallback(
    (photo: string) => {
      if (!currentItem) return;
      if (currentItem.type === 'zone') {
        setZonePhotos((prev) => ({ ...prev, [currentItem.name]: photo }));
      } else {
        setDevicePhotos((prev) => ({ ...prev, [currentItem.kind]: photo }));
      }
      if (captureIndex + 1 >= captureQueue.length) {
        setPhase('submitting');
      } else {
        setCaptureIndex((i) => i + 1);
      }
    },
    [currentItem, captureIndex, captureQueue.length],
  );

  const retakePrevious = useCallback(() => {
    if (captureIndex === 0) return;
    setCaptureIndex((i) => i - 1);
  }, [captureIndex]);

  // ── Envoi final ──
  useEffect(() => {
    if (phase !== 'submitting') return;
    const controller = new AbortController();
    const run = async () => {
      try {
        setError(null);
        setErrorKind('none');
        const res = await fetch('/api/shield/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            propertyName: propertyName.trim(),
            propertyAddress: propertyAddress.trim(),
            city: city.trim() || 'DAKAR',
            ownerName: ownerName.trim(),
            nbChambres: nbChambres ?? 0,
            delegation,
            zones: zones.map((name) => ({ name, photo: zonePhotos[name] ?? '' })),
            devices: devices.map((d) => ({
              name: d.name,
              kind: d.kind,
              photo: devicePhotos[d.kind] ?? '',
            })),
          }),
        });
        if (res.status === 401) {
          setErrorKind('auth');
          setError('Connectez-vous pour enregistrer votre bibliothèque.');
          setPhase('capture');
          return;
        }
        if (res.status === 403) {
          setErrorKind('abonnement');
          setError('Votre abonnement Certificat Anti-Dégâts doit être actif.');
          setPhase('capture');
          return;
        }
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          property?: {
            id: string;
            onboardingRef: string;
            onboardingStatus?: string;
            delegationToken?: string;
            delegationTokenExpiresAt?: string;
          };
          error?: string;
        };
        if (!res.ok || !json.ok || !json.property) {
          setError(
            json.error === 'rate_limited'
              ? 'Trop de tentatives — réessayez dans une minute.'
              : "Erreur lors de l'enregistrement — vérifiez toutes les photos puis réessayez.",
          );
          setPhase(delegation ? 'form' : 'capture');
          return;
        }
        setResult(json.property);
        setPhase('success');
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        setError('Connexion interrompue — réessayez.');
        setPhase(delegation ? 'form' : 'capture');
      }
    };
    void run();
    return () => controller.abort();
  }, [phase, delegation, propertyName, propertyAddress, city, ownerName, nbChambres, zones, devices, zonePhotos, devicePhotos]);

  // ── Écran de succès : DÉLÉGATION (TASK 39) ──
  if (phase === 'success' && result && result.delegationToken) {
    const magicLink = `${window.location.origin}/upload/${result.delegationToken}`;
    const shareText = `📸 Photos de référence à prendre — « ${propertyName.trim()} » (RoomScan Bouclier)\n\nOuvrez ce lien et suivez le guide, photo par photo :\n${magicLink}\n\nLien valable 7 jours. Merci !`;
    const mailSubject = `Photos de référence à prendre — ${propertyName.trim()} (RoomScan Bouclier)`;
    const expiresLabel = result.delegationTokenExpiresAt
      ? new Date(result.delegationTokenExpiresAt).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';
    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(magicLink);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = magicLink;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    };
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-10 sm:py-12">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#C21F26] shadow-lg"
          >
            <Check className="h-10 w-10 text-white" strokeWidth={3} aria-hidden="true" />
          </motion.div>
          <h1 className="mt-6 text-center text-2xl font-black sm:text-3xl">Configuration enregistrée ✅</h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-gray-600">
            Envoyez ce lien à votre équipe pour qu&apos;ils prennent les photos.
            Dès réception, la bibliothèque sera verrouillée et votre certificat PDF généré.
          </p>

          {/* Lien magique */}
          <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C21F26]">Lien magique de votre équipe</p>
            <p className="mt-2 break-all rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 font-mono text-sm font-bold text-gray-900" aria-label="Lien de délégation">
              {magicLink}
            </p>
            {expiresLabel && (
              <p className="mt-2 text-xs text-gray-500">⏳ Valable jusqu&apos;au {expiresLabel} (7 jours).</p>
            )}
            <p className="mt-1 text-xs text-gray-500">Référence du bien : <span className="font-mono font-bold text-gray-700">{result.onboardingRef}</span></p>

            {/* 3 boutons d'action rapide */}
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <button
                type="button"
                onClick={copyLink}
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-2 border-gray-300 bg-white px-4 font-bold text-gray-800 transition-colors hover:bg-gray-50"
              >
                {copied ? <Check className="h-5 w-5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
                {copied ? 'Copié !' : '📋 Copier le lien'}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 font-bold text-white transition-opacity hover:opacity-90"
              >
                🟢 Envoyer par WhatsApp
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(shareText)}`}
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-2 border-gray-300 bg-white px-4 font-bold text-gray-800 transition-colors hover:bg-gray-50"
              >
                <Mail className="h-5 w-5" aria-hidden="true" /> 📧 Envoyer par Email
              </a>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-800">
            <p className="font-bold">Ce qui se passe ensuite :</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Votre équipe ouvre le lien et prend les {zones.length} photos de référence (+ équipements).</li>
              <li>Chaque image est sécurisée (hash SHA-256) et la bibliothèque est verrouillée automatiquement.</li>
              <li>Vous recevez un email de confirmation avec votre PDF de conformité (ONB).</li>
            </ol>
          </div>

          <Link
            href="/inspection/dashboard"
            className="mt-6 block w-full rounded-2xl border border-gray-300 bg-white px-8 py-4 text-center font-bold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Aller au tableau de bord →
          </Link>
        </main>
        <footer className="mt-auto border-t border-gray-200 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500">
          © RoomScan — Certificat Anti-Dégâts • Document sécurisé SHA-256
        </footer>
      </div>
    );
  }

  // ── Écran de succès : bibliothèque verrouillée (OUI) ──
  if (phase === 'success' && result) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-[#C21F26] shadow-lg"
          >
            <Check className="h-10 w-10 text-white" strokeWidth={3} aria-hidden="true" />
          </motion.div>
          <h1 className="mt-6 text-2xl font-black sm:text-3xl">Bibliothèque verrouillée 🔒</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Votre Certificat Anti-Dégâts est personnalisé : il ne contient
            <strong className="text-gray-900"> que vos {zones.length} pièces</strong> et
            <strong className="text-gray-900"> vos {devices.length} équipements</strong>.
            Zéro case vide.
          </p>
          <p className="mt-6 rounded-2xl border border-gray-200 bg-white px-5 py-4 font-mono text-lg font-bold tracking-wider text-[#C21F26] shadow-sm">
            {result.onboardingRef}
          </p>
          <div className="mt-8 w-full space-y-3">
            <a
              href={`/api/shield/pdf/onboarding/${result.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-2xl bg-[#C21F26] px-8 py-5 text-center text-lg font-bold text-white shadow-sm transition-colors hover:bg-[#a81a20]"
            >
              📄 Voir mon certificat PDF →
            </a>
            <Link
              href="/inspection/dashboard"
              className="block w-full rounded-2xl border border-gray-300 bg-white px-8 py-4 text-center font-bold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Aller au tableau de bord →
            </Link>
          </div>
          <p className="mt-6 text-xs text-gray-500">
            À chaque check-in, vos {nbPhotosMenage} photos ménage se comparent automatiquement
            à ces références. Il ne reste qu&apos;à vous laisser guider.
          </p>
        </main>
        <footer className="mt-auto border-t border-gray-200 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500">
          © RoomScan — Certificat Anti-Dégâts • Document sécurisé SHA-256
        </footer>
      </div>
    );
  }

  // ── Barre de progression haute ──
  const totalCapture = captureQueue.length;
  const progressPct =
    phase === 'capture'
      ? Math.round((captureIndex / Math.max(totalCapture, 1)) * 100)
      : phase === 'submitting'
        ? 100
        : Math.round(((step - 1) / 3) * 100);
  const progressLabel =
    phase === 'capture'
      ? `Capture ${Math.min(captureIndex + 1, totalCapture)}/${totalCapture}`
      : phase === 'submitting'
        ? delegation
          ? 'Enregistrement de la configuration…'
          : 'Verrouillage de la bibliothèque…'
        : `Étape ${step}/3`;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
      {/* ── Header + progression ── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-sm font-black uppercase tracking-[0.18em]">
              Room<span className="text-[#C21F26]">Scan</span> — Onboarding
            </h1>
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#C21F26]">
              {progressLabel}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <motion.div
              className="h-full rounded-full bg-[#C21F26]"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        </div>
      </header>

      {/* Avertissement session (non bloquant) */}
      {loggedIn === false && phase === 'form' && (
        <div className="mx-auto w-full max-w-2xl px-4 pt-4">
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Vous n&apos;êtes pas connecté : vous pouvez configurer votre logement, mais la
            connexion sera demandée à l&apos;enregistrement.{' '}
            <Link
              href="/api/auth/signin?callbackUrl=%2Fonboarding%2Fwizard"
              className="font-bold underline"
            >
              Se connecter maintenant
            </Link>
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-8">
        <AnimatePresence mode="wait">
          {/* ═══════════ ÉTAPE 1 — Ton logement, c'est quoi ? ═══════════ */}
          {phase === 'form' && step === 1 && (
            <motion.section key="step1" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.28 }}>
              <h2 className="text-2xl font-black sm:text-3xl">Ton logement, c&apos;est quoi ?</h2>
              <p className="mt-1.5 text-sm text-gray-600">
                2 questions — on ne configure QUE ce que vous avez réellement.
              </p>

              {/* Question 0 (TASK 39) — pivot photos avec vous / délégation */}
              <fieldset className="mt-6">
                <legend className="text-base font-bold">Avez-vous les photos de référence de ce logement avec vous ?</legend>
                <p className="mt-1 text-xs text-gray-500">
                  Oui → vous les ajoutez maintenant (bibliothèque verrouillée immédiatement). Non →
                  vous terminez la configuration et déléguez la prise de photos à votre équipe sur place.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setHasPhotos(true)}
                    aria-pressed={hasPhotos === true}
                    className={`min-h-[72px] rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                      hasPhotos === true
                        ? 'border-[#C21F26] bg-red-50 text-gray-900 shadow-lg shadow-[#C21F26]/10'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block font-bold">📷 Oui — je les upload maintenant</span>
                    <span className="text-xs text-gray-500">Parcours complet avec photos + PDF immédiat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasPhotos(false)}
                    aria-pressed={hasPhotos === false}
                    className={`min-h-[72px] rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                      hasPhotos === false
                        ? 'border-[#C21F26] bg-red-50 text-gray-900 shadow-lg shadow-[#C21F26]/10'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block font-bold">👥 Non — je délègue à mon équipe</span>
                    <span className="text-xs text-gray-500">Lien magique envoyé à l&apos;équipe sur place</span>
                  </button>
                </div>
              </fieldset>

              {/* Q1 : chambres */}
              <fieldset className="mt-6">
                <legend className="text-base font-bold">Combien de chambres ?</legend>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {CHAMBRE_OPTIONS.map((o) => {
                    const active = nbChambres === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setNbChambres(o.value)}
                        aria-pressed={active}
                        className={`min-h-[64px] rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                          active
                            ? 'border-[#C21F26] bg-red-50 text-gray-900 shadow-lg shadow-[#C21F26]/10'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="block font-bold">{o.label}</span>
                        {o.hint && <span className="text-xs text-gray-500">{o.hint}</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Q2 : pièces supplémentaires */}
              <fieldset className="mt-7">
                <legend className="text-base font-bold">Quelles pièces supplémentaires tu as ?</legend>
                <p className="mt-1 text-xs text-gray-500">
                  Les 4 pièces de base sont incluses d&apos;office (salon, couloir, cuisine, toilette/SDB).
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {BASE_PIECES.map((p) => (
                    <div
                      key={p}
                      className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 opacity-75"
                      title="Pièce de base incluse"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#C21F26]">
                        <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden="true" />
                      </span>
                      <span className="flex-1 font-semibold">{p}</span>
                      <Lock className="h-4 w-4 text-gray-400" aria-label="Incluse d'office" />
                    </div>
                  ))}
                  {OPTIONAL_PIECES.map((p) => {
                    const active = extras.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleExtra(p.id)}
                        aria-pressed={active}
                        className={`flex min-h-[52px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                          active
                            ? 'border-[#C21F26] bg-red-50 text-gray-900'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                            active ? 'border-[#C21F26] bg-[#C21F26]' : 'border-gray-300'
                          }`}
                        >
                          {active && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                        </span>
                        <span className="flex-1 font-semibold">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <button
                type="button"
                disabled={!step1Valid}
                onClick={() => setStep(2)}
                className="mt-8 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#C21F26] px-8 text-lg font-bold text-white shadow-sm transition-all hover:bg-[#a81a20] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Suivant <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
              {!step1Valid && (
                <p className="mt-2 text-center text-xs text-gray-500">
                  Répondez d&apos;abord à la question photos, puis choisissez le nombre de chambres.
                </p>
              )}
            </motion.section>
          )}

          {/* ═══════════ ÉTAPE 2 — Équipements présents ═══════════ */}
          {phase === 'form' && step === 2 && (
            <motion.section key="step2" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.28 }}>
              <h2 className="text-2xl font-black sm:text-3xl">Coche les équipements présents dans ton logement</h2>
              <p className="mt-1.5 text-sm text-gray-600">
                5 secondes par catégorie. Ce que vous ne cochez pas{' '}
                <strong className="text-gray-900">n&apos;apparaîtra nulle part</strong> — ni dans l&apos;app, ni dans le PDF.
              </p>
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-bold text-[#C21F26]">
                {equipements.size} équipement{equipements.size > 1 ? 's' : ''} sélectionné{equipements.size > 1 ? 's' : ''}
              </p>

              <div className="mt-6 space-y-6">
                {SHIELD_DEVICE_CATEGORIES.map((cat) => (
                  <fieldset key={cat}>
                    <legend className="text-xs font-black uppercase tracking-[0.18em] text-[#C21F26]">
                      {cat}
                    </legend>
                    <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {SHIELD_DEVICE_KINDS.filter((k) => k.category === cat).map((k) => {
                        const active = equipements.has(k.kind);
                        return (
                          <button
                            key={k.kind}
                            type="button"
                            onClick={() => toggleEquipement(k.kind)}
                            aria-pressed={active}
                            className={`flex min-h-[52px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                              active
                                ? 'border-[#C21F26] bg-red-50 text-gray-900'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                                active ? 'border-[#C21F26] bg-[#C21F26]' : 'border-gray-300'
                              }`}
                            >
                              {active && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                            </span>
                            <span className="flex-1 font-semibold">{k.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex min-h-[56px] items-center gap-2 rounded-2xl border border-gray-300 bg-white px-5 font-bold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Retour
                </button>
                <button
                  type="button"
                  disabled={!step2Valid}
                  onClick={() => setStep(3)}
                  className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#C21F26] px-8 text-lg font-bold text-white shadow-sm transition-all hover:bg-[#a81a20] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Suivant <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {!step2Valid && (
                <p className="mt-2 text-center text-xs text-gray-500">
                  Cochez au moins 1 équipement (votre bibliothèque de référence doit contenir vos appareils réels).
                </p>
              )}
            </motion.section>
          )}

          {/* ═══════════ ÉTAPE 3 — Récapitulatif & Capture ═══════════ */}
          {phase === 'form' && step === 3 && (
            <motion.section key="step3" variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.28 }}>
              <h2 className="text-2xl font-black sm:text-3xl">Récapitulatif &amp; Capture</h2>
              <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-5 sm:p-6 shadow-sm">
                <p className="text-[15px] leading-relaxed">
                  Parfait. Ton logement a{' '}
                  <strong className="text-[#C21F26]">{nbChambres === 0 ? '0 chambre (studio)' : `${nbChambres ?? 0} chambre${(nbChambres ?? 0) > 1 ? 's' : ''}`}</strong>{' '}
                  et <strong className="text-[#C21F26]">{devices.length} équipement{devices.length > 1 ? 's' : ''}</strong>.
                </p>
                <p className="mt-3 text-[15px] leading-relaxed">
                  {delegation ? 'Photos que votre équipe prendra sur place : ' : 'Photos ménage à prendre : '}
                  <strong className="text-[#C21F26]">{nbPhotosMenage}</strong>{' '}
                  <span className="text-gray-600">({zones.join(' · ')})</span>
                </p>
                <p className="mt-3 text-[15px] leading-relaxed">
                  📦 Équipements à photographier{delegation ? ' (par votre équipe)' : ''} :{' '}
                  <strong className="text-[#C21F26]">{devices.map((d) => d.name).join(' · ')}</strong>
                </p>
              </div>

              {/* Infos logement (compact) */}
              <div className="mt-5 rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
                <p className="text-sm font-bold">Dernière ligne droite — infos du certificat</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Nom du logement</span>
                    <input
                      value={propertyName}
                      onChange={(e) => setPropertyName(e.target.value)}
                      maxLength={120}
                      required
                      className="mt-1 min-h-[48px] w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-[#C21F26] focus:ring-2 focus:ring-[#C21F26]/30 dark:bg-white dark:text-gray-900"
                      placeholder="Appartement Plateau"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Votre nom (propriétaire)</span>
                    <input
                      value={ownerName}
                      onChange={(e) => {
                        setOwnerName(e.target.value);
                        setNameTouched(true);
                      }}
                      maxLength={120}
                      required
                      className="mt-1 min-h-[48px] w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-[#C21F26] focus:ring-2 focus:ring-[#C21F26]/30 dark:bg-white dark:text-gray-900"
                      placeholder="Awa Diop"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-gray-600">Adresse du logement</span>
                    <input
                      value={propertyAddress}
                      onChange={(e) => setPropertyAddress(e.target.value)}
                      maxLength={240}
                      required
                      className="mt-1 min-h-[48px] w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-[#C21F26] focus:ring-2 focus:ring-[#C21F26]/30 dark:bg-white dark:text-gray-900"
                      placeholder="Rue 12 x Bd du Centenaire"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Ville</span>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      maxLength={60}
                      required
                      className="mt-1 min-h-[48px] w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-[#C21F26] focus:ring-2 focus:ring-[#C21F26]/30 dark:bg-white dark:text-gray-900"
                      placeholder="DAKAR"
                    />
                  </label>
                </div>
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}{' '}
                  {errorKind === 'auth' && (
                    <Link
                      href="/api/auth/signin?callbackUrl=%2Fonboarding%2Fwizard"
                      className="font-bold underline"
                    >
                      Se connecter
                    </Link>
                  )}
                  {errorKind === 'abonnement' && (
                    <Link href="/edl/abonnement" className="font-bold underline">
                      Vérifier mon abonnement
                    </Link>
                  )}
                </p>
              )}

              {delegation && (
                <p className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  👥 <strong>Mode délégation</strong> : pas besoin des photos maintenant. À l&apos;étape
                  suivante, un lien magique sera généré pour votre équipe — dès qu&apos;ils auront envoyé
                  les photos, la bibliothèque sera verrouillée et le PDF généré automatiquement.
                </p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex min-h-[56px] items-center gap-2 rounded-2xl border border-gray-300 bg-white px-5 font-bold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Retour
                </button>
                <button
                  type="button"
                  disabled={!step3Valid}
                  onClick={() => {
                    setError(null);
                    if (delegation) {
                      setPhase('submitting'); // TASK 39 — pas de capture : envoi direct de la config
                    } else {
                      setCaptureIndex(0);
                      setPhase('capture');
                    }
                  }}
                  className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#C21F26] px-8 text-lg font-bold text-white shadow-sm transition-all hover:bg-[#a81a20] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {delegation ? 'ENVOYER LA CONFIGURATION →' : 'COMMENCER LA CAPTURE →'}
                </button>
              </div>
              {!step3Valid && (
                <p className="mt-2 text-center text-xs text-gray-500">
                  Renseignez le nom du logement, votre nom, l&apos;adresse et la ville.
                </p>
              )}
            </motion.section>
          )}

          {/* ═══════════ CAPTURE GUIDÉE ═══════════ */}
          {phase === 'capture' && currentItem && (
            <motion.section key={`capture-${captureIndex}`} variants={stepVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C21F26]">
                    {currentItem.type === 'zone' ? 'Pièce' : 'Équipement'} • photo de référence
                  </p>
                  <h2 className="mt-1 text-2xl font-black">{currentItem.name}</h2>
                </div>
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 shadow-sm">
                  {captureIndex + 1}/{totalCapture}
                </span>
              </div>

              <div className="mt-5">
                <ShieldPhotoCapture
                  key={`${currentItem.type}-${currentItem.name}`}
                  hint={
                    currentItem.type === 'zone'
                      ? 'Cadrez la pièce depuis l’entrée, à hauteur d’épaule.'
                      : 'Cadrez l’équipement en entier, bien éclairé.'
                  }
                  onConfirmed={confirmPhoto}
                />
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => (captureIndex === 0 ? setPhase('form') : retakePrevious())}
                  className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 font-bold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {captureIndex === 0 ? 'Récap' : 'Photo précédente'}
                </button>
                {photoFor(currentItem) && (
                  <p className="text-xs text-emerald-700">✓ Photo validée — vous pouvez la reprendre si besoin</p>
                )}
              </div>
            </motion.section>
          )}

          {/* ═══════════ ENVOI (verrouillage ou délégation) ═══════════ */}
          {phase === 'submitting' && (
            <motion.section key="submitting" variants={stepVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center py-16 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-[#C21F26]" aria-hidden="true" />
              <h2 className="mt-5 text-xl font-black">
                {delegation ? 'Enregistrement de la configuration…' : 'Verrouillage de la bibliothèque…'}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {delegation
                  ? 'Génération du lien magique pour votre équipe — quelques secondes.'
                  : 'Hash SHA-256 par photo, QR codes, certificat — quelques secondes.'}
              </p>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto border-t border-gray-200 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500">
        © RoomScan — Certificat Anti-Dégâts • Document sécurisé SHA-256
      </footer>
    </div>
  );
}

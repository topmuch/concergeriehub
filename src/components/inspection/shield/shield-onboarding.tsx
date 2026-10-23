'use client';

// =============================================================
// ROOMSCAN BOUCLIER AUTOMATISÉ (v5.1) — ONBOARDING (10 MIN, 1 FOIS)
// Assistant 4 étapes : infos logement → photo initiale des 6 zones
// → validation des 4 appareils → verrouillage de la bibliothèque
// (POST /api/shield/onboarding). Les photos deviennent les futurs
// FANTÔMES D'ANGLE réutilisés à chaque check-in / check-out.
// =============================================================
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { SHIELD_DEVICE_KINDS, SHIELD_ZONES } from '@/lib/shield-refs';
import { ShieldPhotoCapture } from './shield-capture';

type StepId = 'infos' | 'zones' | 'devices' | 'lock';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'infos', label: '1 · Infos' },
  { id: 'zones', label: '2 · Photo initiale' },
  { id: 'devices', label: '3 · Équipements' },
  { id: 'lock', label: '4 · Verrouillage' },
];

interface ShieldOnboardingProps {
  sessionName: string | null;
  onDone: (propertyId: string, onboardingRef: string) => void;
}

export function ShieldOnboarding({ sessionName, onDone }: ShieldOnboardingProps) {
  const [step, setStep] = useState<StepId>('infos');

  // Étape 1 — infos
  const [propertyName, setPropertyName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [city, setCity] = useState('Dakar');
  const [ownerName, setOwnerName] = useState(sessionName ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Étapes 2 & 3 — photos de référence (clés = nom de zone / kind)
  const [zonePhotos, setZonePhotos] = useState<Record<string, string>>({});
  const [devicePhotos, setDevicePhotos] = useState<Record<string, string>>({});

  // Étape 4 — envoi
  const [sending, setSending] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [subRequired, setSubRequired] = useState(false);
  const [created, setCreated] = useState<{ id: string; onboardingRef: string } | null>(null);

  const zonesDone = SHIELD_ZONES.filter((z) => zonePhotos[z]).length;
  const devicesDone = SHIELD_DEVICE_KINDS.filter((d) => devicePhotos[d.kind]).length;
  const totalPhotos = useMemo(() => zonesDone + devicesDone, [zonesDone, devicesDone]);

  // ---------- Navigation ----------
  const validateInfos = () => {
    const errors: Record<string, string> = {};
    if (!propertyName.trim()) errors.propertyName = 'Le nom du logement est requis.';
    if (!propertyAddress.trim()) errors.propertyAddress = "L'adresse est requise.";
    if (!city.trim()) errors.city = 'La ville est requise.';
    if (!ownerName.trim()) errors.ownerName = 'Le nom du propriétaire est requis.';
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) {
      setInlineError(null);
      setStep('zones');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goTo = (s: StepId) => {
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---------- Envoi final ----------
  const lockLibrary = async () => {
    if (sending) return;
    if (zonesDone < SHIELD_ZONES.length || devicesDone < SHIELD_DEVICE_KINDS.length) {
      toast.error('Toutes les photos sont requises avant le verrouillage.');
      return;
    }
    setSending(true);
    setInlineError(null);
    setSubRequired(false);
    try {
      const res = await fetch('/api/shield/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyName: propertyName.trim(),
          propertyAddress: propertyAddress.trim(),
          city: city.trim(),
          ownerName: ownerName.trim(),
          zones: SHIELD_ZONES.map((name) => ({ name, photo: zonePhotos[name] })),
          devices: SHIELD_DEVICE_KINDS.map((d) => ({
            name: d.name,
            kind: d.kind,
            photo: devicePhotos[d.kind],
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            message?: string;
            property?: { id: string; onboardingRef: string };
          }
        | null;
      if (!res.ok || !json?.ok || !json.property) {
        if (res.status === 403 && json?.error === 'abonnement_requis') {
          setSubRequired(true);
          setInlineError(json.message ?? 'Abonnement requis pour lancer l\'Inventaire.');
          return;
        }
        const msg = json?.message ?? json?.error ?? `Verrouillage impossible (HTTP ${res.status}).`;
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setCreated(json.property);
      toast.success('Bibliothèque verrouillée — l\'Inventaire est actif.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      const msg = 'Verrouillage impossible — vérifiez votre connexion puis réessayez.';
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // ---------- Écran de succès ----------
  if (created) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 py-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#C21F26]/15">
          <Lock className="size-8 text-[#f87171]" aria-hidden="true" />
        </span>
        <h2 className="lux-display text-xl font-semibold text-white sm:text-2xl">
          Bibliothèque verrouillée
        </h2>
        <p className="max-w-md text-sm text-[#8fabc2]">
          Les photos de référence de <span className="font-semibold text-white">{propertyName}</span>{' '}
          sont scellées. Chaque check-in / check-out ne prend plus que 90 secondes.
        </p>
        <p
          className="rounded-2xl border border-[#C21F26]/40 bg-[#C21F26]/10 px-6 py-4 font-mono text-2xl font-bold tracking-[0.12em] text-[#f87171]"
          aria-label="Référence d'onboarding"
        >
          {created.onboardingRef}
        </p>
        <p className="font-mono text-[11px] text-[#8fabc2]">
          Conservez cette référence : elle identifie le certificat d&apos;onboarding.
        </p>
        <Button
          type="button"
          onClick={() => onDone(created.id, created.onboardingRef)}
          className="min-h-[44px] rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20]"
          aria-label="Accéder au tableau de bord Inventaire"
        >
          Accéder à l&apos;Inventaire →
        </Button>
      </div>
    );
  }

  // ---------- Assistant ----------
  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* En-tête + fil d'étapes */}
      <div className="text-center">
        <p className="lux-eyebrow text-[#f87171]">Inventaire automatisé — configuration unique</p>
        <h1 className="lux-display mt-1 text-2xl font-semibold text-white sm:text-3xl">
          Onboarding — 10 minutes, une seule fois
        </h1>
      </div>
      <ol
        className="mt-5 flex flex-wrap items-center justify-center gap-1.5"
        aria-label="Étapes de l'onboarding"
      >
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => {
                // Retour libre vers les étapes déjà validées.
                if (i < stepIndex) goTo(s.id);
              }}
              disabled={i > stepIndex}
              className={cn(
                'min-h-[36px] rounded-full px-3 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
                s.id === step
                  ? 'bg-[#C21F26] text-white'
                  : i < stepIndex
                    ? 'text-[#4ade80] hover:bg-white/8'
                    : 'cursor-default text-[#8fabc2]/60',
              )}
              aria-current={s.id === step ? 'step' : undefined}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        {/* ============ ÉTAPE 1 — INFOS ============ */}
        {step === 'infos' ? (
          <motion.section
            key="step-infos"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="lux-card mt-6 p-4 sm:p-6"
            aria-label="Informations du logement"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="shield-prop-name" className="text-xs text-[#8fabc2]">
                  Nom du logement *
                </Label>
                <Input
                  id="shield-prop-name"
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                  placeholder="Appartement Almadies — Vue mer"
                  maxLength={120}
                  className={cn('h-11', 'border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#C21F26]/50')}
                  aria-invalid={Boolean(fieldErrors.propertyName)}
                />
                {fieldErrors.propertyName ? (
                  <p className="text-[11px] font-semibold text-[#f87171]" role="alert">
                    {fieldErrors.propertyName}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="shield-prop-address" className="text-xs text-[#8fabc2]">
                  Adresse *
                </Label>
                <Input
                  id="shield-prop-address"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  placeholder="Rue des Manguiers, Almadies"
                  maxLength={240}
                  className="h-11 border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#C21F26]/50"
                  aria-invalid={Boolean(fieldErrors.propertyAddress)}
                />
                {fieldErrors.propertyAddress ? (
                  <p className="text-[11px] font-semibold text-[#f87171]" role="alert">
                    {fieldErrors.propertyAddress}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shield-prop-city" className="text-xs text-[#8fabc2]">
                  Ville
                </Label>
                <Input
                  id="shield-prop-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Dakar"
                  maxLength={60}
                  className="h-11 border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#C21F26]/50"
                  aria-invalid={Boolean(fieldErrors.city)}
                />
                {fieldErrors.city ? (
                  <p className="text-[11px] font-semibold text-[#f87171]" role="alert">
                    {fieldErrors.city}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shield-prop-owner" className="text-xs text-[#8fabc2]">
                  Propriétaire
                </Label>
                <Input
                  id="shield-prop-owner"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Nom du propriétaire"
                  maxLength={120}
                  className="h-11 border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#C21F26]/50"
                  aria-invalid={Boolean(fieldErrors.ownerName)}
                />
                {fieldErrors.ownerName ? (
                  <p className="text-[11px] font-semibold text-[#f87171]" role="alert">
                    {fieldErrors.ownerName}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                onClick={validateInfos}
                className="min-h-[44px] rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20]"
                aria-label="Continuer vers les photos initiales"
              >
                Continuer →
              </Button>
            </div>
          </motion.section>
        ) : null}

        {/* ============ ÉTAPE 2 — PHOTO INITIALE (6 ZONES) ============ */}
        {step === 'zones' ? (
          <motion.section
            key="step-zones"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mt-6"
            aria-label="Photos initiales des 6 zones"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="lux-display text-lg font-semibold text-white">
                Photo initiale du logement
              </h2>
              <span className="font-mono text-sm font-bold text-[#f87171]" aria-live="polite">
                {zonesDone}/{SHIELD_ZONES.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#8fabc2]">
              Photographiez les 6 zones fixes sous leur meilleur angle : ces clichés deviennent les
              fantômes d&apos;angle de toutes vos prochaines sessions.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {SHIELD_ZONES.map((name) => (
                <div key={name} className="lux-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-white">
                      {name}
                    </h3>
                    {zonePhotos[name] ? (
                      <span className="text-[11px] font-bold text-[#4ade80]" aria-label={`${name} validée`}>
                        ✓ OK
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-[#8fabc2]">À photographier</span>
                    )}
                  </div>
                  <div className="mt-3">
                    {zonePhotos[name] ? (
                      <div className="space-y-2">
                        <img
                          src={zonePhotos[name]}
                          alt={`Photo de référence — ${name}`}
                          className="aspect-[3/4] w-full rounded-xl border border-white/15 object-cover sm:aspect-video"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setZonePhotos((prev) => {
                              const next = { ...prev };
                              delete next[name];
                              return next;
                            })
                          }
                          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 text-xs font-semibold text-[#8fabc2] transition-colors hover:text-white"
                          aria-label={`Reprendre la photo de ${name}`}
                        >
                          Reprendre
                        </button>
                      </div>
                    ) : (
                      <ShieldPhotoCapture
                        hint="Photo de référence — angle à reproduire"
                        onConfirmed={(photo) => setZonePhotos((prev) => ({ ...prev, [name]: photo }))}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goTo('infos')}
                className="min-h-[44px] rounded-full px-5"
                aria-label="Retour aux informations"
              >
                ← Retour
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => zonesDone === SHIELD_ZONES.length && goTo('devices')}
                disabled={zonesDone < SHIELD_ZONES.length}
                className="min-h-[44px] rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20] disabled:opacity-50"
                aria-label="Continuer vers les équipements"
              >
                Continuer →
              </Button>
            </div>
          </motion.section>
        ) : null}

        {/* ============ ÉTAPE 3 — ÉQUIPEMENTS (4 APPAREILS) ============ */}
        {step === 'devices' ? (
          <motion.section
            key="step-devices"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mt-6"
            aria-label="Validation des équipements"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="lux-display text-lg font-semibold text-white">
                Validation des équipements
              </h2>
              <span className="font-mono text-sm font-bold text-[#f87171]" aria-live="polite">
                {devicesDone}/{SHIELD_DEVICE_KINDS.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#8fabc2]">
              Chaque appareil reçoit un code QR de référence (REF-xxx) et une empreinte SHA-256 :
              la bibliothèque prouvera leur bon état à vie.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {SHIELD_DEVICE_KINDS.map((d) => (
                <div key={d.kind} className="lux-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-white">
                      {d.name}
                    </h3>
                    {devicePhotos[d.kind] ? (
                      <span className="text-[11px] font-bold text-[#4ade80]" aria-label={`${d.name} validé`}>
                        ✓ OK
                      </span>
                    ) : (
                      <span className="rounded-full border border-[#C21F26]/40 bg-[#C21F26]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#f87171]">
                        {d.kind}
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    {devicePhotos[d.kind] ? (
                      <div className="space-y-2">
                        <img
                          src={devicePhotos[d.kind]}
                          alt={`Photo de référence — ${d.name}`}
                          className="aspect-[3/4] w-full rounded-xl border border-white/15 object-cover sm:aspect-video"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDevicePhotos((prev) => {
                              const next = { ...prev };
                              delete next[d.kind];
                              return next;
                            })
                          }
                          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 text-xs font-semibold text-[#8fabc2] transition-colors hover:text-white"
                          aria-label={`Reprendre la photo de ${d.name}`}
                        >
                          Reprendre
                        </button>
                      </div>
                    ) : (
                      <ShieldPhotoCapture
                        hint="L'appareil entier, allumé si possible"
                        onConfirmed={(photo) =>
                          setDevicePhotos((prev) => ({ ...prev, [d.kind]: photo }))
                        }
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goTo('zones')}
                className="min-h-[44px] rounded-full px-5"
                aria-label="Retour aux photos initiales"
              >
                ← Retour
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => devicesDone === SHIELD_DEVICE_KINDS.length && goTo('lock')}
                disabled={devicesDone < SHIELD_DEVICE_KINDS.length}
                className="min-h-[44px] rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20] disabled:opacity-50"
                aria-label="Continuer vers le verrouillage"
              >
                Continuer →
              </Button>
            </div>
          </motion.section>
        ) : null}

        {/* ============ ÉTAPE 4 — VERROUILLAGE ============ */}
        {step === 'lock' ? (
          <motion.section
            key="step-lock"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mt-6"
            aria-label="Verrouillage de la bibliothèque"
          >
            <div className="lux-card p-4 sm:p-6">
              <h2 className="lux-display text-lg font-semibold text-white sm:text-xl">
                Génération de la bibliothèque
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <dt className="text-[11px] uppercase tracking-[0.08em] text-[#8fabc2]">Logement</dt>
                  <dd className="mt-1 truncate font-semibold text-white">{propertyName}</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <dt className="text-[11px] uppercase tracking-[0.08em] text-[#8fabc2]">Ville</dt>
                  <dd className="mt-1 font-semibold text-white">{city}</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <dt className="text-[11px] uppercase tracking-[0.08em] text-[#8fabc2]">Zones</dt>
                  <dd className="mt-1 font-mono font-bold text-[#f87171]">{zonesDone} photos</dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <dt className="text-[11px] uppercase tracking-[0.08em] text-[#8fabc2]">Appareils</dt>
                  <dd className="mt-1 font-mono font-bold text-[#f87171]">{devicesDone} photos</dd>
                </div>
              </dl>

              <div
                className="mt-4 rounded-2xl border border-[#C21F26]/30 bg-[#C21F26]/10 p-4 text-sm text-[#f1b7ba]"
                role="note"
              >
                Ces photos seront verrouillées et réutilisées automatiquement à chaque check-in. La
                preuve de leur bon état actuel sera apportée par la vidéo walkthrough de chaque
                session.
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goTo('devices')}
                  disabled={sending}
                  className="min-h-[44px] rounded-full px-5"
                  aria-label="Retour aux équipements"
                >
                  ← Retour
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void lockLibrary()}
                  disabled={sending || totalPhotos < SHIELD_ZONES.length + SHIELD_DEVICE_KINDS.length}
                  className="min-h-[44px] rounded-full bg-[#C21F26] px-6 font-bold text-white hover:bg-[#a81a20] disabled:opacity-60"
                  aria-label="Verrouiller la bibliothèque de référence"
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Verrouillage…
                    </>
                  ) : (
                    'Verrouiller la bibliothèque'
                  )}
                </Button>
              </div>
            </div>

            {inlineError ? (
              <div
                role="alert"
                className="mt-4 rounded-2xl border border-[#ef4444]/30 bg-[#ef4444]/10 p-4 text-sm text-[#f87171]"
              >
                <p className="font-semibold">{inlineError}</p>
                {subRequired ? (
                  <Link
                    href="/edl/abonnement"
                    className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-[#C21F26] px-4 text-xs font-bold text-white hover:bg-[#a81a20]"
                  >
                    Renouveler l&apos;abonnement
                  </Link>
                ) : null}
              </div>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

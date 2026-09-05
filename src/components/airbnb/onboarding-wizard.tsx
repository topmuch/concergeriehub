'use client';

// =============================================================
// OnboardingWizard — chantier ONBOARD (A) : assistant de démarrage
// du nouvel hôte, promesse landing « Opérationnel en 3 minutes ».
//
//   Étape 1 🏠 : nom du logement + adresse + lien du Hub (slug)
//   Étape 2 📶 : Wi-Fi (réseau, clé, sécurité)
//   Étape 3 📱 : envoi → écran succès avec plaque QR (scan → Hub),
//                lien impression plaque + ouverture du Hub.
//
// Déclencheur : ?onboarding=1 (post-inscription) ou
// user.onboardingCompleted === false (visite suivante). Lien
// « Plus tard » : reporté à la prochaine session (sessionStorage).
// =============================================================

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Home,
  Loader2,
  MapPin,
  PartyPopper,
  Printer,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface OnboardingWizardProps {
  open: boolean;
  propertyId: string;
  initialName: string;
  initialAddress: string;
  /** completed = l'hôte a terminé (false = « Plus tard »). */
  onFinished: (completed: boolean) => void;
}

interface CompleteResult {
  property: { id: string; name: string; address: string | null; qrHubSlug: string | null };
  hubUrl: string | null;
}

const STEPS = [
  { icon: Home, label: 'Logement' },
  { icon: Wifi, label: 'Wi-Fi' },
  { icon: PartyPopper, label: 'Plaque QR' },
] as const;

/** Même normalisation que le serveur (aperçu temps réel du slug). */
function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function OnboardingWizard({
  open,
  propertyId,
  initialName,
  initialAddress,
  onFinished,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName === 'Ma Maison' ? '' : initialName);
  const [address, setAddress] = useState(initialAddress);
  const [slug, setSlug] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [password, setPassword] = useState('');
  const [securityType, setSecurityType] = useState('WPA2');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CompleteResult | null>(null);

  // Slug déduit du nom tant que l'hôte ne l'a pas édité à la main.
  const effectiveSlug = useMemo(() => (slug ? slugifyName(slug) : slugifyName(name)), [slug, name]);
  const hubUrl = result?.hubUrl ?? null;
  const qrValue =
    hubUrl && typeof window !== 'undefined' ? `${window.location.origin}${hubUrl}` : '';

  if (!open) return null;

  function reset() {
    setStep(0);
    setError('');
    setLoading(false);
    setResult(null);
  }

  function finish(completed: boolean) {
    reset();
    onFinished(completed);
  }

  async function submit() {
    if (name.trim().length < 2) {
      setError('Donnez un nom à votre logement (2 caractères minimum).');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          name: name.trim(),
          address: address.trim(),
          qrHubSlug: effectiveSlug || undefined,
          wifi:
            networkName.trim() || password
              ? { networkName: networkName.trim(), password, securityType }
              : undefined,
        }),
      });
      const json = (await res.json()) as CompleteResult & { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Erreur lors de la configuration. Réessayez.');
        setStep(1); // retour à l'étape modifiable
        return;
      }
      setResult(json);
    } catch {
      setError('Erreur de connexion au serveur.');
      setStep(1);
    } finally {
      setLoading(false);
    }
  }

  const canNext =
    step === 0 ? name.trim().length >= 2 : step === 1 ? networkName.trim().length > 0 : true;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Assistant de démarrage"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* ----- En-tête + progression ----- */}
        <div className="border-b border-slate-100 px-6 pb-5 pt-6 sm:px-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                Conciergerie Hub
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                {result ? 'Votre Hub est prêt !' : 'Configurez votre logement'}
              </h2>
            </div>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"
            >
              {(() => {
                const StepIcon = STEPS[Math.min(step, 2)].icon;
                return <StepIcon className="h-5 w-5" />;
              })()}
            </span>
          </div>

          {!result && (
            <div className="mt-4 flex items-center gap-2" aria-hidden="true">
              {STEPS.map((s, i) => (
                <div key={s.label} className="flex flex-1 items-center gap-2">
                  <div
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                      i < step
                        ? 'bg-emerald-500 text-white'
                        : i === step
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      'hidden text-[11px] font-semibold sm:block',
                      i === step ? 'text-slate-900' : 'text-slate-400',
                    )}
                  >
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={cn(
                        'h-0.5 flex-1 rounded-full',
                        i < step ? 'bg-emerald-500' : 'bg-slate-100',
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ----- Contenu des étapes ----- */}
        <div className="px-6 py-6 sm:px-8">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 }}
                  aria-hidden="true"
                  className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl"
                >
                  🎉
                </motion.div>
                <p className="text-sm text-slate-600">
                  <strong className="text-slate-900">{result.property.name}</strong> est
                  opérationnel. Vos invités n&apos;ont qu&apos;à scanner :
                </p>

                {qrValue && (
                  <div className="mx-auto mt-4 w-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <QRCodeSVG
                      value={qrValue}
                      size={148}
                      bgColor="#FFFFFF"
                      fgColor="#0F172A"
                      level="H"
                    />
                    <p className="mt-2 font-mono text-[11px] text-slate-400">
                      /{result.property.qrHubSlug}
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-2.5">
                  <Button
                    onClick={() => finish(true)}
                    className="h-11 w-full rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  >
                    Aller au tableau de bord
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                  <div className="flex gap-2.5">
                    {propertyId && (
                      <Button
                        asChild
                        variant="outline"
                        className="h-10 flex-1 rounded-xl border-slate-200"
                      >
                        <Link href={`/airbnb/dashboard/plaques/${propertyId}/print`} target="_blank">
                          <Printer className="mr-1 h-4 w-4" />
                          Imprimer la plaque
                        </Link>
                      </Button>
                    )}
                    {hubUrl && (
                      <Button
                        asChild
                        variant="outline"
                        className="h-10 flex-1 rounded-xl border-slate-200"
                      >
                        <Link href={hubUrl} target="_blank">
                          <ExternalLink className="mr-1 h-4 w-4" />
                          Tester le Hub
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : step === 0 ? (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <p className="text-sm text-slate-600">
                  Deux informations suffisent pour personnaliser le Hub de vos invités.
                </p>
                <div>
                  <Label htmlFor="onb-name" className="text-sm font-medium text-slate-700">
                    Nom du logement
                  </Label>
                  <Input
                    id="onb-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex : Loft Canal Saint-Martin"
                    className="mt-1.5 h-11 rounded-xl border-slate-200"
                    maxLength={80}
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="onb-address" className="text-sm font-medium text-slate-700">
                    Adresse ou ville <span className="font-normal text-slate-400">(pour vos prestataires)</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="onb-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="ex : 12 quai de Valmy, Paris 10e"
                      className="h-11 rounded-xl border-slate-200 pl-9"
                      maxLength={200}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="onb-slug" className="text-sm font-medium text-slate-700">
                    Lien de votre Hub <span className="font-normal text-slate-400">(déduit du nom)</span>
                  </Label>
                  <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/20">
                    <span className="shrink-0 border-r border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                      /hub/
                    </span>
                    <input
                      id="onb-slug"
                      value={effectiveSlug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="mon-logement"
                      className="w-full px-3 py-2.5 text-sm text-slate-900 outline-none"
                      maxLength={60}
                    />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <p className="text-sm text-slate-600">
                  Vos invités se connecteront en <strong>1 scan</strong>, sans saisir de clé.
                </p>
                <div>
                  <Label htmlFor="onb-wifi-name" className="text-sm font-medium text-slate-700">
                    Nom du réseau (SSID)
                  </Label>
                  <Input
                    id="onb-wifi-name"
                    value={networkName}
                    onChange={(e) => setNetworkName(e.target.value)}
                    placeholder="ex : Loft_5GHz"
                    className="mt-1.5 h-11 rounded-xl border-slate-200"
                    maxLength={64}
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="onb-wifi-pass" className="text-sm font-medium text-slate-700">
                    Clé Wi-Fi <span className="font-normal text-slate-400">(optionnelle si réseau libre)</span>
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="onb-wifi-pass"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 rounded-xl border-slate-200 pr-10"
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Masquer la clé' : 'Afficher la clé'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700">Sécurité</Label>
                  <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                    {['WPA2', 'WPA', 'WEP', 'nopass'].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setSecurityType(sec)}
                        aria-pressed={securityType === sec}
                        className={cn(
                          'rounded-xl border px-2 py-2 text-xs font-semibold transition-colors',
                          securityType === sec
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                        )}
                      >
                        {sec === 'nopass' ? 'Libre' : sec}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && !result && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              {error}
            </p>
          )}
        </div>

        {/* ----- Pied : actions ----- */}
        {!result && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 sm:px-8">
            <button
              type="button"
              onClick={() => finish(false)}
              className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-600"
            >
              Plus tard
            </button>
            <div className="flex gap-2.5">
              {step === 1 && (
                <Button
                  variant="outline"
                  onClick={() => setStep(0)}
                  className="h-11 rounded-xl border-slate-200 px-4"
                  disabled={loading}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Retour
                </Button>
              )}
              {step === 0 ? (
                <Button
                  onClick={() => {
                    if (name.trim().length < 2) {
                      setError('Donnez un nom à votre logement (2 caractères minimum).');
                      return;
                    }
                    setError('');
                    setStep(1);
                  }}
                  disabled={!canNext}
                  className="h-11 rounded-xl bg-slate-900 px-5 text-white hover:bg-slate-800"
                >
                  Continuer
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={submit}
                  disabled={!canNext || loading}
                  className="h-11 rounded-xl bg-emerald-600 px-5 text-white hover:bg-emerald-500"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      Configuration…
                    </>
                  ) : (
                    <>
                      Terminer la configuration
                      <PartyPopper className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

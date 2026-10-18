'use client';

// =============================================================
// ONBOARDING 3 ÉTAPES — module standalone « État des Lieux »
// Affiché quand la liste d'inspections est vide :
//   1. Vos informations (prénom/nom + email de session, éditables,
//      persistés en localStorage 'edl_profile') ;
//   2. Votre premier logement (nom + adresse complète) ;
//   3. C'est prêt ! (récapitulatif + création du 1er document).
// Progression par points typographiques (● ○ ○), zéro icône.
// =============================================================
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { LUX_FIELD } from './dashboard-ui';
import { EDL_PROFILE_KEY, type EdlProfile } from './inspection-types';

export interface OnboardingResult {
  profile: EdlProfile;
  propertyName: string;
  propertyAddress: string;
}

interface OnboardingProps {
  sessionName: string | null;
  sessionEmail: string | null;
  /** Déclenché à l'étape 3 → ouvre le formulaire de création pré-rempli. */
  onFinish: (result: OnboardingResult) => void;
}

const STEP_LABELS = ['Vos informations', 'Votre premier logement', "C'est prêt !"];

export function InspectionOnboarding({ sessionName, sessionEmail, onFinish }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');

  // Pré-remplissage depuis la session PUIS depuis le profil local
  // (une re-visite ne repart pas de zéro). Sort de la pile synchrone
  // de l'effet avant tout setState (règle set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      let name = sessionName ?? '';
      let mail = sessionEmail ?? '';
      try {
        const raw = window.localStorage.getItem(EDL_PROFILE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<EdlProfile>;
          if (saved.fullName) name = saved.fullName;
          if (saved.email) mail = saved.email;
        }
      } catch {
        /* profil local illisible → session seule */
      }
      setFullName(name);
      setEmail(mail);
      setMounted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionName, sessionEmail]);

  const goToStep = (next: number) => {
    if (next === 1) {
      // Étape 2 exige le profil validé → persistance locale.
      try {
        window.localStorage.setItem(
          EDL_PROFILE_KEY,
          JSON.stringify({ fullName: fullName.trim(), email: email.trim() }),
        );
      } catch {
        /* localStorage indisponible — on continue sans persister */
      }
    }
    setStep(next);
  };

  const step1Valid = fullName.trim().length >= 2 && email.trim().length >= 5;
  const step2Valid = propertyName.trim().length >= 1 && propertyAddress.trim().length >= 4;

  if (!mounted) {
    return <div className="lux-card min-h-[60vh] rounded-3xl" aria-hidden="true" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-1 py-6 sm:py-10">
      {/* ----- En-tête typographique ----- */}
      <p className="lux-eyebrow">Module indépendant — 299 €/an</p>
      <h1 className="lux-display mt-2 text-center text-3xl font-semibold text-white sm:text-4xl">
        États des Lieux
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-[#8fa0c2]">
        Générez vos états des lieux d&apos;entrée et de sortie en quelques minutes —
        pièce par pièce, avec photos et signature électronique de l&apos;invité.
      </p>

      {/* ----- Progression par points (● ○ ○) ----- */}
      <div
        className="mt-6 flex items-center gap-3"
        role="group"
        aria-label={`Étape ${step + 1} sur 3 : ${STEP_LABELS[step]}`}
      >
        {STEP_LABELS.map((label, i) => (
          <span key={label} className="flex items-center gap-3">
            {i > 0 && <span aria-hidden="true" className="h-px w-6 bg-white/15 sm:w-10" />}
            <span
              aria-hidden="true"
              className={cn(
                'text-sm leading-none transition-colors',
                i === step ? 'text-[#e9c47c]' : i < step ? 'text-[#34d399]' : 'text-white/25',
              )}
            >
              {i <= step ? '●' : '○'}
            </span>
            <span
              className={cn(
                'hidden text-[11px] font-semibold uppercase tracking-[0.14em] sm:inline',
                i === step ? 'text-white' : 'text-[#8fa0c2]/70',
              )}
            >
              {label}
            </span>
          </span>
        ))}
      </div>

      {/* ----- Carte de l'étape courante ----- */}
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="lux-card mt-6 w-full p-5 sm:p-8"
        aria-live="polite"
      >
        {step === 0 && (
          <div>
            <p className="lux-eyebrow">Étape 1</p>
            <h2 className="lux-display mt-1 text-xl font-semibold text-white sm:text-2xl">
              Vos informations
            </h2>
            <p className="mt-1 text-sm text-[#8fa0c2]">
              Elles apparaissent sur vos documents en tant que propriétaire.
            </p>
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edl-fullname" className="text-xs text-[#8fa0c2]">
                  Prénom et nom
                </Label>
                <Input
                  id="edl-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ex. Camille Martin"
                  autoComplete="name"
                  className={cn('h-11', LUX_FIELD)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edl-email" className="text-xs text-[#8fa0c2]">
                  Email
                </Label>
                <Input
                  id="edl-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex. camille@exemple.fr"
                  autoComplete="email"
                  className={cn('h-11', LUX_FIELD)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="lux-eyebrow">Étape 2</p>
            <h2 className="lux-display mt-1 text-xl font-semibold text-white sm:text-2xl">
              Votre premier logement
            </h2>
            <p className="mt-1 text-sm text-[#8fa0c2]">
              Le logement visé par votre premier état des lieux.
            </p>
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edl-property" className="text-xs text-[#8fa0c2]">
                  Nom du logement
                </Label>
                <Input
                  id="edl-property"
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                  placeholder="ex. Villa Azur — Appartement 2"
                  className={cn('h-11', LUX_FIELD)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edl-address" className="text-xs text-[#8fa0c2]">
                  Adresse complète
                </Label>
                <Input
                  id="edl-address"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  placeholder="ex. 12 rue des Palmiers, 06000 Nice"
                  autoComplete="street-address"
                  className={cn('h-11', LUX_FIELD)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="lux-eyebrow">Étape 3</p>
            <h2 className="lux-display mt-1 text-xl font-semibold text-white sm:text-2xl">
              C&apos;est prêt !
            </h2>
            <p className="mt-1 text-sm text-[#8fa0c2]">
              Votre module est initialisé. Voici le récapitulatif de votre premier document.
            </p>
            <dl className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-xs uppercase tracking-[0.14em] text-[#8fa0c2]">Propriétaire</dt>
                <dd className="font-semibold text-white">{fullName.trim()}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-xs uppercase tracking-[0.14em] text-[#8fa0c2]">Email</dt>
                <dd className="font-semibold text-white">{email.trim()}</dd>
              </div>
              <div className="lux-rule" aria-hidden="true" />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-xs uppercase tracking-[0.14em] text-[#8fa0c2]">Logement</dt>
                <dd className="font-semibold text-white">{propertyName.trim()}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-xs uppercase tracking-[0.14em] text-[#8fa0c2]">Adresse</dt>
                <dd className="font-semibold text-white">{propertyAddress.trim()}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-[#8fa0c2]">
              À la création, les 5 pièces réglementaires (séjour, cuisine, chambre, salle de bain,
              WC) et leurs équipements sont pré-remplis — l&apos;invité n&apos;a plus qu&apos;à
              vérifier, photographier et signer.
            </p>
          </div>
        )}

        {/* ----- Navigation Précédent / Suivant ----- */}
        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              className="h-11 rounded-full px-5 text-sm"
              aria-label="Revenir à l'étape précédente"
            >
              ‹ Précédent
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}

          {step < 2 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => step1Valid && goToStep(step + 1)}
              disabled={step === 0 ? !step1Valid : !step2Valid}
              className="h-11 rounded-full bg-[#e9c47c] px-6 text-sm font-semibold text-[#1a1206] shadow-[0_10px_28px_-12px_rgba(212,175,106,0.5)] hover:bg-[#dfb76a]"
              aria-label="Passer à l'étape suivante"
            >
              Suivant ›
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                onFinish({
                  profile: { fullName: fullName.trim(), email: email.trim() },
                  propertyName: propertyName.trim(),
                  propertyAddress: propertyAddress.trim(),
                })
              }
              className="h-11 rounded-full bg-[#e9c47c] px-6 text-sm font-semibold text-[#1a1206] shadow-[0_10px_28px_-12px_rgba(212,175,106,0.5)] hover:bg-[#dfb76a]"
              aria-label="Créer mon premier état des lieux"
            >
              Créer mon premier état des lieux
            </Button>
          )}
        </div>
      </motion.div>

      <p className="mt-5 max-w-md text-center text-xs leading-relaxed text-[#8fa0c2]/80">
        Les documents générés restent consultables et téléchargeables (PDF) depuis ce tableau de
        bord, pendant toute la durée de votre abonnement.
      </p>
    </div>
  );
}

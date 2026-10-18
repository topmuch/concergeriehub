'use client';

// =============================================================
// v4.75 « LUXURY PIN PAD » — ÉCRAN DE VERROUILLAGE HAUT DE GAMME
// -------------------------------------------------------------
// Refonte luxe de la saisie du code PIN (spécification « Smart Home
// de Luxe / hôtel 5 étoiles ») :
//   • FOND : photo immersive du logement PLEIN ÉCRAN (hubPhotos.hero
//     passé par le parent, repli /hub-hero-villa.jpg), floutée et
//     assombrie ;
//   • OVERLAY : dégradé sombre pour la lisibilité ;
//   • CARTE : glassmorphism avancé (bg-white/10 + backdrop-blur-2xl +
//     bordure verre) ;
//   • PAVÉ : boutons 3×4 animés Framer Motion (whileHover/whileTap),
//     cibles ≥ 56 px (mobile friendly) ;
//   • ERREUR : secousse de la carte (Framer Motion, sans remount) +
//     message animé AnimatePresence ;
//   • AUTO-SUBMIT à 4 chiffres + support clavier physique (0-9,
//     Retour arrière) pour le desktop.
//
// Deux variantes (même composant) :
//   • variant="fullscreen" → écran de verrouillage invité
//     (/hub/[slug], v4.50) ;
//   • variant="embedded" → modale centrale du Mode Hôte / Ménage
//     (le parent fournit le Dialog, le pad fournit le décor photo).
//
// Contrat onVerify : true = code valide ; string = message d'erreur
// affiché tel quel (ex. « Trop de tentatives… ») ; false = erreur
// générique. Le composant gère busy + reset + secousse.
// =============================================================

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Delete, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HUB_PROPERTY_HERO } from '@/lib/hub-visuals';
// v4.77-c2 « ADMIN I18N » — les textes du pad (écran de verrouillage hub
// ET modale Mode Hôte/Ménage) sont traduits en 5 langues via useAdminLang.
// Le FR reste la source : les props (title, eyebrow, subtitle, footerNote)
// et les messages d'erreur retournés par onVerify sont traduits à
// l'affichage — repli FR si la clé est absente.
import { useAdminLang } from '@/lib/admin-i18n';

export type PinVerifyResult = boolean | string;

interface LuxuryPinPadProps {
  /** Photo principale du logement (hubPhotos.hero). Repli : hero villa. */
  propertyImage?: string | null;
  /** Nom du bien affiché sous le titre. */
  propertyName: string;
  /**
   * Vérification du code — true = succès ; string = message d'erreur
   * affiché ; false = « Code incorrect. Veuillez réessayer. »
   */
  onVerify: (pin: string) => Promise<PinVerifyResult>;
  /** Bouton « Retour » optionnel (masqué si absent). */
  onCancel?: () => void;
  /** fullscreen = écran de verrouillage ; embedded = modale centrale. */
  variant?: 'fullscreen' | 'embedded';
  /** Titre (défaut : « Accès sécurisé »). */
  title?: string;
  /** Sur-titre uppercase au-dessus du titre. */
  eyebrow?: string;
  /** Ligne de contexte sous le nom du bien (ex. rappel du code attendu). */
  subtitle?: string;
  /** Salutation invité (« Marie » → « Bonjour Marie — »). */
  greeting?: string | null;
  /** Téléphone de l'hôte → lien d'aide. */
  contactPhone?: string | null;
  /** Note de bas de page (fullscreen). */
  footerNote?: string | null;
  /** Slot libre entre l'en-tête et les pastilles (sélecteur d'espace). */
  children?: ReactNode;
}

const KEYPAD: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];
/** Erreur générique — clé FR du dictionnaire admin-i18n (traduite à l'affichage). */
const GENERIC_ERROR = 'Code incorrect. Veuillez réessayer.';

export function LuxuryPinPad({
  propertyImage,
  propertyName,
  onVerify,
  onCancel,
  variant = 'fullscreen',
  title = 'Accès sécurisé',
  eyebrow = 'Hub sécurisé',
  subtitle,
  greeting,
  contactPhone,
  footerNote,
  children,
}: LuxuryPinPadProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // v4.77-c2 — traduction des textes du pad (clé = texte FR source).
  const { t } = useAdminLang();

  // Secousse SANS remount (les enfants ne rejouent jamais leur entrée).
  const shakeControls = useAnimationControls();
  const triggerShake = useCallback(() => {
    void shakeControls.start({
      x: [0, -10, 10, -6, 6, 0],
      transition: { duration: 0.45, ease: 'easeOut' },
    });
  }, [shakeControls]);

  const verify = useCallback(
    async (value: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const result = await onVerify(value);
        if (result !== true) {
          // Le message serveur (FR) est traduit à l'affichage si une clé
          // correspond ; sinon il s'affiche tel quel (repli FR).
          setError(typeof result === 'string' && result.trim() ? result : t(GENERIC_ERROR));
          setPin('');
          triggerShake();
        }
        // Succès : le parent démonte le pad (vue suivante) — rien à faire.
      } catch {
        setError(t('Connexion impossible. Réessayez.'));
        setPin('');
        triggerShake();
      } finally {
        setBusy(false);
      }
    },
    [busy, onVerify, triggerShake, t],
  );

  // FIX v4.75 — l'auto-submit est HORS du updater setPin : appeler verify()
  // (setBusy → setState) dans un updater d'état déclenchait l'avertissement
  // React « Cannot update a component while rendering a different component ».
  // Les événements clavier/clic sont discrets : l'état `pin` est à jour à
  // chaque presse, on peut donc calculer la valeur directement.
  const pressDigit = useCallback(
    (d: string) => {
      if (busy) return;
      setError(null);
      const next = `${pin}${d}`;
      if (next.length > 4) return;
      setPin(next);
      if (next.length === 4) void verify(next);
    },
    [busy, pin, verify],
  );

  const pressDelete = useCallback(() => {
    if (busy) return;
    setError(null);
    setPin((p) => p.slice(0, -1));
  }, [busy]);

  // Clavier physique (desktop / tests) : chiffres + Retour arrière.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key);
      else if (e.key === 'Backspace') {
        e.preventDefault();
        pressDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressDigit, pressDelete]);

  const isFullscreen = variant === 'fullscreen';

  return (
    <div
      className={cn(
        'relative flex w-full items-center justify-center',
        isFullscreen
          ? 'fixed inset-0 z-50 overflow-y-auto p-4 py-8'
          : 'overflow-hidden rounded-[28px]',
      )}
      {...(isFullscreen
        ? { role: 'dialog', 'aria-modal': true, 'aria-label': `${t('Accès sécurisé')} — ${propertyName}` }
        : {})}
    >
      {/* ── 1. Photo immersive du logement + overlay sombre ── */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center"
          style={{
            backgroundImage: `url(${propertyImage || HUB_PROPERTY_HERO})`,
            filter: 'blur(10px) brightness(0.62) saturate(1.05)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-900/40 to-slate-950/80" />
      </div>

      {/* ── 2. Carte glassmorphism centrale ── */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          'relative z-10 w-full max-w-sm',
          isFullscreen && 'my-auto',
        )}
      >
        <motion.div animate={shakeControls}>
          <div
            className={cn(
              'rounded-3xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-2xl',
              'max-h-[92dvh] overflow-y-auto scrollbar-thin',
              isFullscreen ? 'p-6 sm:p-8' : 'p-5',
            )}
          >
            {/* En-tête */}
            <div className={cn('mb-7 text-center', !isFullscreen && 'mb-5')}>
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/20 shadow-[0_0_32px_rgba(245,158,11,0.25)]"
                aria-hidden="true"
              >
                <Lock className="h-8 w-8 text-amber-400" strokeWidth={1.8} />
              </div>
              {eyebrow && (
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300/80">
                  {t(eyebrow)}
                </p>
              )}
              <h2
                className="mt-1 text-2xl font-bold text-white"
                style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
              >
                {t(title)}
              </h2>
              <p className="mt-1 truncate text-sm text-slate-300" title={propertyName}>
                {greeting ? `${t('Bonjour')} ${greeting} — ` : ''}
                {propertyName}
              </p>
              {subtitle && (
                <p className="mt-2 text-xs font-semibold leading-relaxed text-white/70" aria-live="polite">
                  {t(subtitle)}
                </p>
              )}
            </div>

            {/* Slot parent (sélecteur d'espace hôte / ménage) */}
            {children && <div className={cn(!isFullscreen && 'mb-4', isFullscreen && 'mb-6')}>{children}</div>}

            {/* Pastilles du code saisi */}
            <div className={cn('mb-2 flex items-center justify-center gap-4', isFullscreen && 'mt-6')} aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <motion.span
                  key={i}
                  animate={{ scale: i < pin.length ? 1.2 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className={cn(
                    'h-4 w-4 rounded-full border transition-colors duration-200',
                    i < pin.length
                      ? 'border-amber-400 bg-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.55)]'
                      : 'border-white/30 bg-white/20',
                  )}
                />
              ))}
            </div>

            {/* Message d'erreur (hauteur réservée, jamais de saut de layout) */}
            <div className={cn('mb-5 flex h-5 items-center justify-center', !isFullscreen && 'mb-3')} aria-live="assertive">
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-sm font-medium text-red-400"
                    role="alert"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Pavé numérique 3×4 (cibles ≥ 56 px = mobile friendly) */}
            <div className={cn('grid grid-cols-3 gap-3', isFullscreen ? 'mb-4' : 'mb-2')} aria-busy={busy}>
              {KEYPAD.map((num, index) => {
                if (num === '') return <span key={index} aria-hidden="true" />;
                const isDel = num === 'DEL';
                return (
                  <motion.button
                    key={index}
                    type="button"
                    whileHover={busy ? undefined : { scale: 1.05, backgroundColor: 'rgba(255,255,255,0.15)' }}
                    whileTap={busy ? undefined : { scale: 0.94 }}
                    onClick={() => (isDel ? pressDelete() : pressDigit(num))}
                    disabled={busy}
                    aria-label={isDel ? t('Effacer le dernier chiffre') : `${t('Chiffre')} ${num}`}
                    className={cn(
                      'flex items-center justify-center rounded-2xl border text-2xl font-medium transition-colors',
                      isFullscreen ? 'h-16' : 'h-14',
                      isDel
                        ? 'border-transparent bg-transparent text-white/50 hover:text-white'
                        : 'border-white/10 bg-white/[0.06] text-white hover:border-white/30',
                      busy && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {isDel ? <Delete className="h-6 w-6" aria-hidden="true" /> : num}
                  </motion.button>
                );
              })}
            </div>

            {/* Vérification en cours */}
            <div className="flex h-5 items-center justify-center" aria-live="polite">
              {busy && (
                <p className="flex items-center gap-2 text-xs font-semibold text-white/70">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {t('Vérification du code…')}
                </p>
              )}
            </div>

            {/* Retour / aide */}
            <div className={cn('space-y-2 text-center', isFullscreen ? 'mt-3' : 'mt-1')}>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={busy}
                  className="w-full py-2 text-sm font-medium text-white/50 transition-colors hover:text-white disabled:opacity-50"
                >
                  {t('Retour')}
                </button>
              )}
              {contactPhone && (
                <p className="text-xs text-white/60">
                  {t("Besoin d'aide ?")}{' '}
                  <a
                    href={`tel:${contactPhone}`}
                    className="font-semibold text-amber-300 underline-offset-2 hover:underline"
                  >
                    {t('Contactez votre hôte')}
                  </a>
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Note de bas de page (écran de verrouillage) */}
        {footerNote && (
          <p className="relative z-10 mx-auto mt-6 max-w-xs text-center text-[11px] leading-relaxed text-white/45">
            {t(footerNote)}
          </p>
        )}
      </motion.div>
    </div>
  );
}

export default LuxuryPinPad;

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

// =============================================================
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » (amélioration 1.5)
// Nouvel onglet du Hub Invité — carte « Pressing & Blanchisserie
// Express » ouvrant un dialog de commande complet :
//   • 3 services : Repassage Express (5 €/pièce, 4 h), Lessive
//     Complète (15 €/panier, 24 h), Pressing à Sec (8 €/pièce, 48 h)
//   • estimation des pièces (stepper) + créneau de récupération
//     (matin / après-midi) + note libre
//   • paiement Stripe (cloné du Late Check-out) OU demande à l'hôte
// Le dialog est monté dans un PORTAL (fixed inset-0) pour survivre
// aux contextes imbriqués (PWA ET overlay du hub QR « embedded »).
// Les tarifs affichés sont indicatifs — le SERVEUR fait foi.
// =============================================================

type ServiceType = 'ironing' | 'washing' | 'drycleaning';

const SERVICES: {
  id: ServiceType;
  emoji: string;
  title: string;
  description: string;
  price: string;
  priceHint: string;
  delay: string;
}[] = [
  {
    id: 'ironing',
    emoji: '👔',
    title: 'Repassage Express',
    description: 'Chemises et vêtements professionnels',
    price: '5 € / pièce',
    priceHint: 'par pièce',
    delay: 'Retour en 4 h',
  },
  {
    id: 'washing',
    emoji: '🧺',
    title: 'Lessive Complète',
    description: 'Lavage, séchage, pliage',
    price: '15 € / panier',
    priceHint: 'par panier',
    delay: 'Retour en 24 h',
  },
  {
    id: 'drycleaning',
    emoji: '🧥',
    title: 'Pressing à Sec',
    description: 'Costumes, robes délicates',
    price: 'À partir de 8 €',
    priceHint: 'par pièce',
    delay: 'Retour en 48 h',
  },
];

type State = 'idle' | 'sending' | 'sent' | 'redirecting' | 'error';

export function PressingCard({
  slug,
  bookingId = null,
  guestName = null,
  paymentEnabled = false,
  embedded = false,
}: {
  slug: string;
  /** Séjour courant (requis pour le flux Stripe — anti paiement orphelin). */
  bookingId?: string | null;
  guestName?: string | null;
  /** Stripe actif côté serveur (payload.premiumFeatures.paymentEnabled). */
  paymentEnabled?: boolean;
  /** Monté dans l'overlay du hub QR → styles adaptés. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const [service, setService] = useState<ServiceType | null>(null);
  const [pieces, setPieces] = useState(3);
  const [slot, setSlot] = useState<'morning' | 'afternoon'>('morning');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState<'stripe' | 'host'>('stripe');
  const [state, setState] = useState<State>('idle');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const selected = SERVICES.find((s) => s.id === service) ?? null;
  const unitPrice = service === 'ironing' ? 5 : service === 'washing' ? 15 : service === 'drycleaning' ? 8 : 0;
  const units = service === 'washing' ? 1 : pieces;
  const total = selected ? unitPrice * units : 0;
  const totalLabel = total > 0 ? `${total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}` : '';
  // Flux Stripe : booking obligatoire (le webhook doit rattacher la
  // commande à un séjour — jamais d'argent encaissé « dans le vide »).
  const stripeFlow = paymentEnabled && !!bookingId;

  // Verrou du scroll quand le dialog est ouvert.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const reset = () => {
    setService(null);
    setPieces(3);
    setSlot('morning');
    setNotes('');
    setState('idle');
    setFeedback('');
    setError('');
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 250);
  };

  const submit = async () => {
    if (!service || state === 'sending') return;
    setState('sending');
    setError('');
    const chosenPayment = stripeFlow ? payment : 'host';
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/laundry/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: service,
          pieces,
          pickupSlot: slot,
          notes: notes.trim() || null,
          guestName,
          bookingId,
          payment: chosenPayment,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        url?: string;
        message?: string;
        mode?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(json?.error || 'Envoi impossible. Réessayez dans un instant.');
        setState('error');
        return;
      }
      // Paiement Stripe → redirection vers la page Checkout sécurisée.
      if (json?.url) {
        setState('redirecting');
        window.location.href = json.url;
        return;
      }
      setState('sent');
      setFeedback(
        json?.message ||
          'Demande envoyée à votre hôte ! Il vous indiquera la suite (récupération et règlement).',
      );
    } catch {
      setError('Envoi impossible. Vérifiez votre connexion puis réessayez.');
      setState('error');
    }
  };

  return (
    <>
      {/* ── Carte d'appel (style Luxe Tech cohérent avec le Late Check-out) ── */}
      <section
        aria-label="Pressing et blanchisserie express"
        className={`rounded-2xl shadow-sm p-5 card-amber-lux ${embedded ? '' : ''}`}
      >
        <div className="flex items-start gap-3">
          <motion.span
            aria-hidden="true"
            className="text-3xl leading-none select-none origin-center"
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          >
            👔
          </motion.span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif! text-lg font-bold text-card-foreground leading-tight tracking-tight">
              Pressing &amp; Blanchisserie Express
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Vêtements repassés, lavés ou nettoyés à sec — <strong className="text-card-foreground">récupérés à votre porte</strong> et rapportés pliés.
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5" aria-hidden="true">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border" style={{ backgroundColor: 'var(--amber-chip-bg)', color: 'var(--amber-chip-ink)', borderColor: 'var(--amber-chip-border)' }}>
            👔 Repassage 5&nbsp;€
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border" style={{ backgroundColor: 'var(--amber-chip-bg)', color: 'var(--amber-chip-ink)', borderColor: 'var(--amber-chip-border)' }}>
            🧺 Lessive 15&nbsp;€
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border" style={{ backgroundColor: 'var(--amber-chip-bg)', color: 'var(--amber-chip-ink)', borderColor: 'var(--amber-chip-border)' }}>
            🧥 Sec dès 8&nbsp;€
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="animate-pulse-slow mt-4 w-full h-11 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold text-sm shadow-[0_6px_24px_rgba(245,158,11,0.35)] hover:shadow-[0_10px_32px_rgba(245,158,11,0.5)] hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
        >
          {state === 'sent' ? '✅ Commande envoyée — en refaire une' : 'Commander le pressing'}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground text-center">
          Créneau de récupération au choix — matin ou après-midi.
        </p>
      </section>

      {/* ── Dialog de commande (PORTAL plein écran, SSR-safe : open=false
          au rendu serveur, le portail n'existe qu'après interaction) ── */}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Commande pressing et blanchisserie"
            onClick={(e) => {
              if (e.target === e.currentTarget && state !== 'sending') close();
            }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="absolute inset-x-0 bottom-0 top-auto sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-2xl"
            >
              <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border px-5 py-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif! text-lg font-bold text-card-foreground tracking-tight">
                    👔 Pressing &amp; Blanchisserie
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sélectionnez un service — récupération à votre porte.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  disabled={state === 'sending'}
                  aria-label="Fermer"
                  className="h-9 w-9 shrink-0 rounded-full bg-secondary text-muted-foreground font-bold hover:bg-secondary/70 cursor-pointer disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                {state === 'sent' ? (
                  <div className="py-8 text-center" role="status">
                    <p className="text-4xl" aria-hidden="true">✅</p>
                    <h3 className="font-serif! mt-3 text-lg font-bold text-card-foreground">Demande envoyée&nbsp;!</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{feedback}</p>
                    <button
                      type="button"
                      onClick={close}
                      className="mt-5 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-95 cursor-pointer"
                    >
                      Parfait, merci
                    </button>
                  </div>
                ) : state === 'redirecting' ? (
                  <div className="py-8 text-center" aria-busy="true" role="status">
                    <p className="text-sm font-semibold text-card-foreground">💳 Redirection vers le paiement sécurisé…</p>
                  </div>
                ) : state === 'error' ? (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-center" role="alert">
                    <p className="text-sm font-bold text-destructive">Envoi impossible</p>
                    <p className="text-xs text-muted-foreground mt-1">{error}</p>
                    <button
                      type="button"
                      onClick={() => setState('idle')}
                      className="mt-2.5 h-10 px-4 rounded-xl bg-card border border-border text-sm font-semibold text-card-foreground hover:bg-secondary cursor-pointer"
                    >
                      Réessayer
                    </button>
                  </div>
                ) : (
                  <>
                    {/* ── 1. Choix du service ── */}
                    <div className="space-y-2.5" role="radiogroup" aria-label="Choisir un service">
                      {SERVICES.map((s) => {
                        const active = service === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setService(s.id)}
                            className={`w-full text-left rounded-2xl border p-3.5 transition-all cursor-pointer ${
                              active
                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 shadow-[0_4px_18px_rgba(245,158,11,0.18)]'
                                : 'border-border bg-card hover:border-amber-400/60 hover:bg-secondary/40'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-2xl select-none" aria-hidden="true">{s.emoji}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-bold text-card-foreground">{s.title}</p>
                                  <p className="text-sm font-bold whitespace-nowrap" style={{ color: 'var(--amber-ink)' }}>{s.price}</p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                                <div className="mt-1.5 flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 px-2 py-0.5">
                                    ⚡ {s.delay}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* ── 2. Estimation des pièces (pas pour la lessive) ── */}
                    {selected && (
                      <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                        {service !== 'washing' ? (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-card-foreground">Nombre de pièces</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Chemises, pantalons, robes…</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPieces((p) => Math.max(1, p - 1))}
                                disabled={pieces <= 1}
                                aria-label="Retirer une pièce"
                                className="h-10 w-10 rounded-xl bg-card border border-border text-lg font-bold text-card-foreground hover:bg-secondary cursor-pointer disabled:opacity-40"
                              >
                                −
                              </button>
                              <span className="w-10 text-center font-serif text-xl font-bold text-card-foreground" aria-live="polite">
                                {pieces}
                              </span>
                              <button
                                type="button"
                                onClick={() => setPieces((p) => Math.min(50, p + 1))}
                                aria-label="Ajouter une pièce"
                                className="h-10 w-10 rounded-xl bg-card border border-border text-lg font-bold text-card-foreground hover:bg-secondary cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-card-foreground">
                            🧺 <strong>1 panier</strong> = environ 8-10 pièces (lavage, séchage et pliage inclus).
                          </p>
                        )}

                        {/* ── 3. Créneau de récupération ── */}
                        <div className="mt-3.5">
                          <p className="text-sm font-bold text-card-foreground">Récupération souhaitée</p>
                          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Créneau de récupération">
                            <button
                              type="button"
                              role="radio"
                              aria-checked={slot === 'morning'}
                              onClick={() => setSlot('morning')}
                              className={`h-11 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${
                                slot === 'morning'
                                  ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                                  : 'border-border bg-card text-muted-foreground hover:bg-secondary/50'
                              }`}
                            >
                              🌅 Ce matin
                            </button>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={slot === 'afternoon'}
                              onClick={() => setSlot('afternoon')}
                              className={`h-11 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${
                                slot === 'afternoon'
                                  ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                                  : 'border-border bg-card text-muted-foreground hover:bg-secondary/50'
                              }`}
                            >
                              ☀️ Cet après-midi
                            </button>
                          </div>
                        </div>

                        {/* ── 4. Note (optionnel) ── */}
                        <div className="mt-3.5">
                          <label htmlFor="pressing-notes" className="text-sm font-bold text-card-foreground">
                            Précisions <span className="font-normal text-muted-foreground">(optionnel)</span>
                          </label>
                          <textarea
                            id="pressing-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                            rows={2}
                            placeholder="Ex. : laisser le linge dans le sac bleu près de l'entrée…"
                            className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* ── 5. Paiement ── */}
                    {selected && (
                      <div className="rounded-2xl border border-border p-4">
                        {stripeFlow ? (
                          <>
                            <p className="text-sm font-bold text-card-foreground">Règlement</p>
                            <div className="mt-2 space-y-2" role="radiogroup" aria-label="Mode de règlement">
                              <button
                                type="button"
                                role="radio"
                                aria-checked={payment === 'stripe'}
                                onClick={() => setPayment('stripe')}
                                className={`w-full rounded-xl border px-3.5 py-3 text-left cursor-pointer transition-colors ${
                                  payment === 'stripe'
                                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10'
                                    : 'border-border bg-card hover:bg-secondary/40'
                                }`}
                              >
                                <p className="text-sm font-bold text-card-foreground">💳 Payer maintenant — {totalLabel}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Paiement sécurisé par carte, confirmation immédiate.</p>
                              </button>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={payment === 'host'}
                                onClick={() => setPayment('host')}
                                className={`w-full rounded-xl border px-3.5 py-3 text-left cursor-pointer transition-colors ${
                                  payment === 'host'
                                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10'
                                    : 'border-border bg-card hover:bg-secondary/40'
                                }`}
                              >
                                <p className="text-sm font-bold text-card-foreground">🏠 Régler avec votre hôte</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Demande simple — règlement ensuite avec votre hôte.</p>
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            📨 Votre demande sera transmise à votre hôte, qui organise la récupération et vous indique le règlement ({totalLabel}).
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── CTA ── */}
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!service || state === 'sending'}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold text-sm shadow-[0_6px_24px_rgba(245,158,11,0.35)] hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {state === 'sending' ? '⏳ Envoi…' : selected ? `Envoyer la commande — ${totalLabel}` : 'Choisissez un service'}
                    </button>
                    <p className="text-[11px] text-muted-foreground text-center pb-1">
                      🔒 {stripeFlow ? 'Paiement sécurisé par carte — confirmation immédiate.' : 'Votre hôte vous confirme la récupération.'}
                    </p>
                  </>
                )}
              </div>
            </motion.div>
          </div>,
          document.body,
        )}
    </>
  );
}

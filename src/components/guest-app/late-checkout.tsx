'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — 2.4 + ÉTAPE 3.3
// LATE CHECK-OUT — départ tardif jusqu'à 14 h (au lieu de 11 h).
//
// DESIGN PREMIUM « LUXE TECH » (V4.10) :
//   • fond gradient amber-50 → orange-50 (dark: ambre très sombre)
//   • bordure amber-200, horloge animée (balancement lent)
//   • prix en font-serif text-4xl amber-700
//   • bouton principal avec pulse subtil (animate-pulse-slow)
//
// Deux parcours selon la config serveur (paymentEnabled = Stripe actif) :
//   • PRIX FIXÉ + STRIPE → bouton principal « Confirmer et payer »
//     → POST /api/public/hub/[slug]/late-checkout/pay
//     → Stripe Checkout Session (mode 'payment', montant SERVEUR)
//     → redirection ; retour ?paid=latecheckout ; le webhook Stripe
//       fait booking.lateCheckoutStatus='PAID' + notifie l'hôte
//       « ✅ [Nom] a payé pour un départ tardif à 14h ».
//   • SINON → « Envoyer la demande à l'hôte » (POST /late-checkout,
//     règlement ensuite avec l'hôte — comportement MVP historique).
// Le statut booking.lateCheckoutStatus est l'autorité d'affichage :
//   PAID → carte confirmation ✅ ; REQUESTED → relance paiement.
// =============================================================

type RequestState = 'idle' | 'sending' | 'sent' | 'error';
type PayState = 'idle' | 'redirecting' | 'error';

export function LateCheckoutCard({
  slug,
  price,
  guestName,
  bookingId = null,
  paymentEnabled = false,
  lateCheckoutStatus = null,
}: {
  slug: string;
  price: number | null;
  guestName: string | null;
  bookingId?: string | null;
  paymentEnabled?: boolean;
  lateCheckoutStatus?: string | null;
}) {
  const [state, setState] = useState<RequestState>('idle');
  const [payState, setPayState] = useState<PayState>('idle');
  const [error, setError] = useState('');

  const paid = lateCheckoutStatus === 'PAID';
  const stripeFlow = paymentEnabled && !!price && price > 0;

  const priceLabel = price
    ? price.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
    : 'à convenir avec votre hôte';

  // ── Parcours 1 : paiement Stripe ──
  const startPayment = async () => {
    setPayState('redirecting');
    setError('');
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/late-checkout/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName, bookingId }),
      });
      const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !json?.url) {
        setError(json?.error || 'Paiement indisponible. Réessayez dans un instant.');
        setPayState('error');
        return;
      }
      // Redirection vers Stripe Checkout (hôte de paiement sécurisé)
      window.location.href = json.url;
    } catch {
      setError('Paiement indisponible. Vérifiez votre connexion puis réessayez.');
      setPayState('error');
    }
  };

  // ── Parcours 2 : simple demande (historique) ──
  const request = async () => {
    setState('sending');
    setError('');
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/late-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName, bookingId }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || 'Envoi impossible. Réessayez dans un instant.');
        setState('error');
        return;
      }
      setState('sent');
    } catch {
      setError('Envoi impossible. Vérifiez votre connexion puis réessayez.');
      setState('error');
    }
  };

  // ── État confirmé (webhook Stripe → PAID) ──
  if (paid) {
    return (
      <section
        aria-label="Départ tardif confirmé"
        className="card-emerald-lux rounded-2xl shadow-sm p-5"
      >
        <div className="text-center" role="status">
          <p className="text-3xl select-none" aria-hidden="true">✅</p>
          <h2 className="font-serif! mt-2 text-lg font-bold text-card-foreground tracking-tight">
            Départ tardif confirmé&nbsp;!
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Votre départ est fixé à <strong className="text-card-foreground">14&nbsp;h</strong> (au lieu de 11&nbsp;h).
            {price ? ` Règlement de ${priceLabel} bien reçu.` : null} Passez un dernier bon moment&nbsp;!
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Prolonger votre séjour ?"
      className="card-amber-lux rounded-2xl shadow-[0_6px_28px_rgba(245,158,11,0.12)] p-5"
    >
      {payState === 'redirecting' ? (
        <div className="py-6 text-center" aria-busy="true" role="status">
          <p className="text-sm font-semibold text-card-foreground">💳 Redirection vers le paiement sécurisé…</p>
        </div>
      ) : state === 'sent' ? (
        <div className="text-center" role="status">
          <p className="text-3xl select-none" aria-hidden="true">✅</p>
          <h2 className="font-serif! mt-2 text-lg font-bold text-card-foreground tracking-tight">Demande envoyée&nbsp;!</h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Votre hôte vous confirme la disponibilité et vous indique comment régler le
            supplément ({priceLabel}).
          </p>
        </div>
      ) : state === 'error' || payState === 'error' ? (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-center" role="alert">
          <p className="text-sm font-bold text-destructive">
            {payState === 'error' ? 'Paiement indisponible' : 'Envoi impossible'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <button
            type="button"
            onClick={() => {
              setPayState('idle');
              setState('idle');
            }}
            className="mt-2.5 h-10 px-4 rounded-xl bg-card border border-border text-sm font-semibold text-card-foreground hover:bg-secondary cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <motion.span
              aria-hidden="true"
              className="text-3xl leading-none select-none origin-[30%_55%]"
              animate={{ rotate: [0, 14, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              ⏱️
            </motion.span>
            <div className="min-w-0">
              <h2 className="font-serif! text-lg font-bold text-card-foreground leading-tight tracking-tight">
                Prolonger votre séjour&nbsp;?
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Partez en toute tranquillité&nbsp;: <strong className="text-card-foreground">départ tardif jusqu&apos;à 14&nbsp;h</strong> au
                lieu de 11&nbsp;h.
              </p>
            </div>
          </div>

          {/* Prix en display serif — la star de la carte */}
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--amber-ink-soft)' }}
              >
                Départ tardif · Checkout à 14&nbsp;h
              </p>
              {price ? (
                <p
                  className="font-serif! mt-0.5 text-4xl font-bold leading-none tracking-tight"
                  style={{ color: 'var(--amber-ink)' }}
                >
                  {priceLabel}
                </p>
              ) : (
                <p
                  className="font-serif! mt-0.5 text-xl font-bold leading-snug"
                  style={{ color: 'var(--amber-ink)' }}
                >
                  {priceLabel}
                </p>
              )}
            </div>
            <span
              className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border"
              style={{
                backgroundColor: 'var(--amber-chip-bg)',
                color: 'var(--amber-chip-ink)',
                borderColor: 'var(--amber-chip-border)',
              }}
              aria-hidden="true"
            >
              +3&nbsp;h
            </span>
          </div>

          {/* Parcours Stripe : paiement immédiat sécurisé */}
          {stripeFlow ? (
            <>
              <button
                type="button"
                onClick={startPayment}
                className="animate-pulse-slow mt-4 w-full h-11 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white font-bold text-sm shadow-[0_6px_24px_rgba(245,158,11,0.35)] hover:shadow-[0_10px_32px_rgba(245,158,11,0.5)] hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
              >
                Confirmer et payer {priceLabel}
              </button>
              <button
                type="button"
                onClick={request}
                disabled={state === 'sending'}
                className="mt-2 w-full h-10 rounded-xl bg-card border border-border text-sm font-semibold text-muted-foreground hover:text-card-foreground hover:bg-secondary transition-colors disabled:opacity-60 disabled:cursor-wait cursor-pointer"
              >
                {state === 'sending' ? '⏳ Envoi…' : 'Ou envoyer la demande à votre hôte'}
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground text-center">
                🔒 Paiement sécurisé par carte — confirmation immédiate.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={request}
                disabled={state === 'sending'}
                className="animate-pulse-slow mt-4 w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-[0_6px_20px_rgba(0,0,0,0.12)] hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-wait cursor-pointer"
              >
                {state === 'sending' ? '⏳ Envoi de la demande…' : 'Demander un départ tardif'}
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground text-center">
                Sous réserve de disponibilité — confirmation par votre hôte.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

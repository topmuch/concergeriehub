'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatEurGuest, type GuestBookingInfo, type GuestOrder } from './types';
import {
  groupCartByProvider,
  playDing,
  useCartStore,
  type CartItem,
} from './cart-store';
import { ServiceCover } from './service-visual';

// =============================================================
// REFONTE SERVICES PREMIUM (V4.11) — CHECKOUT PREMIUM (plein écran)
// ÉTAPE 3 du brief :
//   3.1 Récapitulatif groupé par prestataire (miniatures, −/+, total)
//   3.2 Créneau de livraison : chips date (7 jours) + slots de 30 min
//       (passés grisés le jour même) + note spéciale (allergies…)
//   3.3 Paiement : bouton gradient amber→orange →
//       • 1 prestataire  → POST /api/public/service-orders + /[id]/pay
//         (Stripe Connect préservé : destination charge)
//       • N prestataires → POST /api/public/service-orders/checkout
//         (une seule session Stripe, webhook serviceOrderIds)
//       Montants JAMAIS envoyés — re-pricing serveur (17.5).
//   3.4 Confirmation : confettis dorés (canvas-confetti) + récap.
// Hors booking : le serveur exige un nom (2-80) → champs nom/email.
// =============================================================

export interface CartOrderResult {
  orderIds: string[];
  grandTotal: number;
  deliveryDate: string | null;
  demoPaid: boolean;
}

export function CartCheckout({
  slug,
  booking,
  bookingId,
  online,
  propertyName,
  onClose,
  onConfirmed,
}: {
  slug: string;
  booking: GuestBookingInfo | null;
  bookingId: string | null;
  online: boolean;
  propertyName: string;
  onClose: () => void;
  onConfirmed: (result: CartOrderResult) => void;
}) {
  const items = useCartStore((s) => s.items[slug] ?? []);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);

  const groups = useMemo(() => Object.entries(groupCartByProvider(items)), [items]);
  const subtotal = Math.round(items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;

  // ── 3.2 Créneau ──
  const [dayOffset, setDayOffset] = useState(0); // 0 = aujourd'hui
  const [slot, setSlot] = useState('');
  const [note, setNote] = useState('');

  // ── 3.3 Paiement ──
  const [phase, setPhase] = useState<'idle' | 'sending' | 'paying'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // Hors booking : le serveur exige un nom — l'invité les saisit ici.
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );

  // Slots de 30 min 6 h → 21 h 30 ; passés (ou < 1 h) grisés aujourd'hui.
  const slots = useMemo(() => {
    const list: { label: string; iso: string; disabled: boolean }[] = [];
    const now = new Date();
    const base = days[dayOffset];
    for (let h = 6; h <= 21; h++) {
      for (const m of [0, 30]) {
        const d = new Date(base);
        d.setHours(h, m, 0, 0);
        const disabled =
          dayOffset === 0 && d.getTime() < now.getTime() + 60 * 60 * 1000;
        list.push({
          label: `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`,
          iso: d.toISOString(),
          disabled,
        });
      }
    }
    return list;
  }, [dayOffset, days]);

  // (le reset du créneau au changement de jour est fait dans le handler
  // des chips — pas d'effet synchronisé, règle react-hooks/set-state-in-effect)

  const totalLabel = formatEurGuest(subtotal);

  const pay = () => {
    if (phase !== 'idle' || items.length === 0) return;
    if (!online) {
      setErrorMsg('Vous êtes hors-ligne — reconnectez-vous au Wi-Fi du logement pour commander.');
      return;
    }
    if (!booking && guestName.trim().length < 2) {
      setErrorMsg('Indiquez votre nom pour la commande (au moins 2 caractères).');
      return;
    }
    setErrorMsg('');
    setPhase('sending');

    const deliveryIso = slot || undefined;
    const bodyCommon = {
      bookingId: bookingId || undefined,
      guestName: booking?.guestName || guestName.trim(),
      guestEmail: guestEmail.trim() || undefined,
      ...(deliveryIso ? { deliveryDate: deliveryIso } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    const finalize = (r: Response, createdCount: number) =>
      r.json().then((j) => {
        if (!r.ok || !j?.ok) {
          setErrorMsg(j?.message || 'La commande a échoué. Réessayez dans un instant.');
          setPhase('idle');
          return;
        }
        if (j.mode === 'stripe' && j.url) {
          // Retour ?paid= via webhook — le flash rouvre la confirmation.
          window.location.assign(j.url);
          return;
        }
        setPhase('idle');
        clear(slug);
        onConfirmed({
          orderIds: Array.isArray(j.orderIds) ? j.orderIds : createdCount ? [] : [],
          grandTotal: typeof j.grandTotal === 'number' ? j.grandTotal : subtotal,
          deliveryDate: deliveryIso ?? null,
          demoPaid: true,
        });
      });

    const finishDemoFromOrder = (orderId: string) => {
      // Flux mono-prestataire : création puis encaissement (Connect).
      setPhase('paying');
      fetch(
        `/api/public/service-orders/${encodeURIComponent(orderId)}/pay?slug=${encodeURIComponent(slug)}${bookingId ? `&b=${encodeURIComponent(bookingId)}` : ''}`,
        { method: 'POST' },
      )
        .then(async (payRes) => {
          const pj = await payRes.json().catch(() => null);
          if (pj?.ok && pj.mode === 'stripe' && pj.url) {
            window.location.assign(pj.url);
            return;
          }
          setPhase('idle');
          clear(slug);
          onConfirmed({
            orderIds: [orderId],
            grandTotal: subtotal,
            deliveryDate: deliveryIso ?? null,
            demoPaid: Boolean(pj?.ok && (pj.paymentStatus === 'PAID' || pj.alreadyPaid)),
          });
        })
        .catch(() => {
          // La commande EXISTE — payable depuis « Mes commandes ».
          setPhase('idle');
          clear(slug);
          onConfirmed({
            orderIds: [orderId],
            grandTotal: subtotal,
            deliveryDate: deliveryIso ?? null,
            demoPaid: false,
          });
        });
    };

    if (groups.length === 1) {
      const [, groupItems] = groups[0];
      fetch(`/api/public/service-orders?slug=${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyCommon,
          providerId: groupItems[0].providerId,
          items: groupItems.map((i) =>
            i.offerId ? { offerId: i.offerId, qty: i.qty } : { name: i.offerName, qty: i.qty },
          ),
        }),
      })
        .then((r) =>
          r.json().then((j) => {
            if (!r.ok || !j?.ok) {
              setErrorMsg(j?.message || 'La commande a échoué. Réessayez dans un instant.');
              setPhase('idle');
              return;
            }
            const orderId = typeof j.order?.id === 'string' ? j.order.id : '';
            if (!orderId || !bookingId) {
              // Sans séjour rattaché : pas de paiement in-app (flux 17.6).
              // HUB DÉMO (V4.14) : mode:'demo' → confirmation payée complète.
              setPhase('idle');
              clear(slug);
              onConfirmed({
                orderIds: orderId ? [orderId] : [],
                grandTotal: subtotal,
                deliveryDate: deliveryIso ?? null,
                demoPaid: j.mode === 'demo',
              });
              return;
            }
            finishDemoFromOrder(orderId);
          }),
        )
        .catch(() => {
          setErrorMsg('Connexion impossible. Vérifiez votre réseau.');
          setPhase('idle');
        });
    } else {
      fetch(`/api/public/service-orders/checkout?slug=${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyCommon,
          groups: groups.map(([providerId, groupItems]) => ({
            providerId,
            items: groupItems.map((i) =>
              i.offerId ? { offerId: i.offerId, qty: i.qty } : { name: i.offerName, qty: i.qty },
            ),
          })),
        }),
      })
        .then((r) => finalize(r, groups.length))
        .catch(() => {
          setErrorMsg('Connexion impossible. Vérifiez votre réseau.');
          setPhase('idle');
        });
    }
  };

  const canPay = items.length > 0 && phase === 'idle' && (booking || guestName.trim().length >= 2);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Finaliser la commande"
    >
      {/* ── En-tête ── */}
      <div className="shrink-0 border-b border-border bg-card/80 backdrop-blur px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-xl bg-card border border-border text-lg font-bold text-muted-foreground hover:text-card-foreground hover:border-accent transition-colors cursor-pointer"
            aria-label="Retour aux services"
          >
            ←
          </button>
          <div className="text-center min-w-0">
            <h1 className="font-serif text-lg font-bold text-card-foreground truncate">Votre commande</h1>
            <p className="text-[11px] text-muted-foreground truncate">{propertyName}</p>
          </div>
          <span className="h-10 w-10" aria-hidden="true" />
        </div>
      </div>

      {/* ── Contenu scrollable ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-40">
        <div className="max-w-lg mx-auto space-y-5">
          {/* 3.1 — Récapitulatif par prestataire */}
          {groups.map(([providerId, groupItems]) => (
            <section
              key={providerId}
              className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden"
              aria-label={`Commande ${groupItems[0].providerName}`}
            >
              <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border-b border-border">
                <span className="text-base" aria-hidden="true">{groupItems[0].serviceEmoji}</span>
                <h2 className="text-xs font-bold text-card-foreground truncate">{groupItems[0].providerName}</h2>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">
                  ✓ Vérifié
                </span>
              </div>
              <ul className="divide-y divide-border/60">
                {groupItems.map((item) => (
                  <li key={item.lineKey} className="p-3.5 flex items-center gap-3">
                    <ServiceCover
                      emoji={item.serviceEmoji}
                      categoryLabel={item.categoryLabel}
                      className="h-14 w-14 shrink-0 rounded-xl"
                      emojiClassName="text-2xl"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-card-foreground truncate">{item.offerName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatEurGuest(item.unitPrice)} / {item.unit}
                      </p>
                      <button
                        type="button"
                        onClick={() => remove(slug, item.lineKey)}
                        className="mt-1 text-[10px] font-semibold text-muted-foreground hover:text-rose-600 dark:hover:text-rose-300 transition-colors cursor-pointer"
                      >
                        Retirer
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label={`Quantité ${item.offerName}`}>
                      <button
                        type="button"
                        onClick={() => setQty(slug, item.lineKey, item.qty - 1)}
                        aria-label="Retirer un"
                        className="h-8 w-8 rounded-lg border border-border bg-card text-base font-bold text-card-foreground hover:bg-accent/10 transition-colors cursor-pointer"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-xs font-bold text-card-foreground" aria-live="polite">{item.qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty(slug, item.lineKey, item.qty + 1)}
                        aria-label="Ajouter un"
                        className="h-8 w-8 rounded-lg bg-amber-500 text-white text-base font-bold hover:bg-amber-400 transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                    <span className="shrink-0 w-16 text-right text-xs font-bold text-card-foreground">
                      {formatEurGuest(item.qty * item.unitPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {/* Hors booking : identité de l'invité (exigée serveur) */}
          {!booking && (
            <section className="bg-card border border-border rounded-2xl p-4" aria-label="Vos coordonnées">
              <h2 className="text-xs font-bold text-card-foreground mb-2.5">Vos coordonnées</h2>
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={80}
                  placeholder="Votre nom (requis)"
                  aria-label="Votre nom"
                  className="w-full h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  maxLength={120}
                  placeholder="Votre email (pour le reçu — optionnel)"
                  aria-label="Votre email"
                  className="w-full h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            </section>
          )}

          {/* 3.2 — Créneau de livraison */}
          <section className="bg-card border border-border rounded-2xl p-4" aria-label="Choix de la livraison">
            <h2 className="text-xs font-bold text-card-foreground">📅 Quand souhaitez-vous la livraison&nbsp;?</h2>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x" role="radiogroup" aria-label="Jour de livraison">
              {days.map((d, i) => {
                const active = i === dayOffset;
                const label = i === 0 ? "Auj." : i === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setDayOffset(i);
                      setSlot(''); // le créneau du jour précédent n'est plus valide
                    }}
                    className={`shrink-0 snap-start px-3.5 h-9 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'bg-card text-muted-foreground border-border hover:border-amber-500/50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Heure de livraison">
              {slots.map((s) => {
                const active = slot === s.iso;
                return (
                  <button
                    key={s.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={s.disabled}
                    onClick={() => setSlot(s.iso)}
                    className={`h-8 rounded-lg text-[11px] font-bold border transition-all ${
                      s.disabled
                        ? 'bg-secondary/40 text-muted-foreground/40 border-border/60 cursor-not-allowed'
                        : active
                          ? 'bg-emerald-600 text-white border-emerald-600 cursor-pointer'
                          : 'bg-card text-card-foreground border-border hover:border-emerald-500/50 cursor-pointer'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Instructions particulières (allergies, étage, code d'entrée…)"
              aria-label="Instructions particulières"
              className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-xs text-card-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{note.length}/500</p>
          </section>
        </div>
      </div>

      {/* ── Pied : total + paiement (sticky, safe-area) ── */}
      <div className="shrink-0 fixed bottom-0 inset-x-0 border-t border-border bg-card/95 backdrop-blur px-4 pt-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] z-10">
        <div className="max-w-lg mx-auto">
          <div className="space-y-1 text-xs text-muted-foreground mb-2.5">
            <div className="flex justify-between">
              <span>Sous-total</span>
              <span className="font-semibold text-card-foreground">{totalLabel}</span>
            </div>
            <div className="flex justify-between">
              <span>Livraison à votre porte</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">Offerte 🎉</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-1.5 text-sm">
              <span className="font-bold text-card-foreground">Total</span>
              <span className="font-bold text-card-foreground">{totalLabel}</span>
            </div>
          </div>

          {errorMsg && (
            <p className="mb-2 text-[11px] font-semibold text-rose-600 dark:text-rose-300 text-center" role="alert">
              {errorMsg}
            </p>
          )}

          <button
            type="button"
            onClick={pay}
            disabled={!canPay}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-500/25 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {phase === 'sending'
              ? 'Envoi en cours…'
              : phase === 'paying'
                ? '💳 Paiement en cours…'
                : online
                  ? `🔒 Payer ${totalLabel}`
                  : '📴 Indisponible hors-ligne'}
          </button>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            🔒 Paiement sécurisé Stripe · ✅ Annulation gratuite jusqu&apos;à 2 h avant
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================
// 3.4 — CONFIRMATION : checkmark géant + confettis dorés + récap.
// =============================================================
export function OrderConfirmation({
  result,
  orderCountHint,
  onClose,
}: {
  result: CartOrderResult;
  /** Nombre de commandes (1 par prestataire) si les ids ne suffisent pas. */
  orderCountHint?: number;
  onClose: () => void;
}) {
  // Confettis dorés — burst unique au montage (canvas-confetti déjà
  // présent dans le projet, ~6 Ko gz). Couleurs marque : or + émeraude.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const confetti = (await import('canvas-confetti')).default;
        if (cancelled) return;
        confetti({
          particleCount: 90,
          spread: 75,
          startVelocity: 38,
          origin: { y: 0.35 },
          colors: ['#f59e0b', '#fbbf24', '#fde68a', '#10b981', '#ffffff'],
          scalar: 0.9,
          ticks: 220,
        });
        setTimeout(() => {
          if (!cancelled) {
            confetti({
              particleCount: 45,
              spread: 100,
              origin: { y: 0.4 },
              colors: ['#f59e0b', '#fbbf24', '#ffffff'],
              scalar: 0.8,
              ticks: 200,
            });
          }
        }, 350);
      } catch {
        /* confettis indisponibles — la confirmation reste lisible */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const time = result.deliveryDate
    ? new Date(result.deliveryDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const day = result.deliveryDate
    ? new Date(result.deliveryDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[60] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Commande confirmée"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
          className="h-24 w-24 rounded-full bg-emerald-500/15 border-2 border-emerald-500 flex items-center justify-center"
          aria-hidden="true"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.25 }}
            className="text-5xl"
          >
            ✅
          </motion.span>
        </motion.div>

        <h1 className="mt-6 font-serif text-2xl font-bold text-card-foreground">
          Commande confirmée&nbsp;!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xs">
          Vous recevrez une notification quand elle sera en route vers votre logement.
        </p>

        <div className="mt-6 w-full max-w-xs bg-card border border-border rounded-2xl p-4 space-y-2 text-left">
          <Row label="Commandes" value={`${result.orderIds.length || orderCountHint || 1} prestataire${(result.orderIds.length || orderCountHint || 1) > 1 ? 's' : ''}`} />
          {result.grandTotal > 0 && <Row label="Total payé" value={formatEurGuest(result.grandTotal)} strong />}
          {day && time && <Row label="Livraison" value={`${day} · ${time}`} />}
          {result.demoPaid === false && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold pt-1">
              💳 Finalisez le paiement depuis «&nbsp;Mes commandes&nbsp;».
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onClose}
          className="mx-auto block w-full max-w-xs h-12 rounded-xl bg-accent text-accent-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
        >
          ← Retour au Hub
        </button>
      </div>
    </motion.div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-bold text-card-foreground' : 'font-semibold text-card-foreground'}>{value}</span>
    </div>
  );
}

/** Commande suivie (chip) — rappel du créneau choisi si présent. */
export function orderDeliveryLabel(order: Pick<GuestOrder, 'deliveryDate'>): string | null {
  if (!order.deliveryDate) return null;
  try {
    const d = new Date(order.deliveryDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export type { CartItem };

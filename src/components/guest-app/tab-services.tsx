'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  GUEST_ORDER_STATUS_META,
  formatEurGuest,
  type GuestBookingInfo,
  type GuestOrder,
  type GuestOrderStatus,
  type GuestPayload,
  type GuestService,
} from './types';

// =============================================================
// ÉTAPE 16 (V3) — Onglet 🥐 Services
// Catalogue des prestataires GUEST_EXPERIENCE autour du bien.
// ÉTAPE 17.2 (V3) — MOTEUR DE TRANSACTION :
//   • service avec unitPrice → commande in-app (POST
//     /api/public/service-orders) : sélecteur de quantité,
//     confirmation, création PENDING, suivi "Mes commandes"
//   • service "Sur devis" (unitPrice null) → mise en relation
//     email conservée (flux V1)
// ÉTAPE 17.5 (V3) — CATALOGUE FIN : si le prestataire a des offres
//   pour ce bien (offers[]), l'invité choisit SA formule (offerId)
//   — le prix est re-résolu serveur, jamais envoyé par le client.
// =============================================================

export function TabServices({ slug, services, contact, propertyName, booking, bookingId, online }: {
  slug: string;
  services: GuestService[];
  contact: GuestPayload['guest']['contact'];
  propertyName: string;
  booking: GuestBookingInfo | null;
  bookingId: string | null;
  online: boolean;
}) {
  const [selected, setSelected] = useState<GuestService | null>(null);
  const [orders, setOrders] = useState<GuestOrder[] | null>(null);

  // "Mes commandes" : rechargées à l'ouverture de l'onglet (et après commande)
  const refreshOrders = useCallback(() => {
    if (!bookingId) {
      setTimeout(() => setOrders(null), 0); // hors booking : état réinitialisé (règle hooks)
      return;
    }
    if (!online) return;
    let cancelled = false;
    fetch(`/api/public/service-orders?slug=${encodeURIComponent(slug)}&b=${encodeURIComponent(bookingId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setOrders(Array.isArray(j.orders) ? j.orders : []);
      })
      .catch(() => {
        if (!cancelled) setOrders(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, bookingId, online]);

  useEffect(() => {
    const cleanup = refreshOrders();
    return cleanup;
  }, [refreshOrders]);

  if (services.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center" role="status">
        <span className="text-5xl select-none" aria-hidden="true">🥐</span>
        <h2 className="mt-4 text-lg font-bold text-card-foreground">Aucun service pour l&apos;instant</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Votre hôte n&apos;a pas encore de partenaires autour de ce logement. Des expériences arrivent bientôt&nbsp;!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-lg font-bold text-card-foreground">Services &amp; expériences</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {services.length} proposition{services.length > 1 ? 's' : ''} de partenaires locaux vérifiés autour de {propertyName}
        </p>
      </div>

      {/* ── Mes commandes (suivi du séjour courant) ── */}
      {orders && orders.length > 0 && (
        <section className="bg-card border border-border rounded-2xl shadow-sm p-4" aria-label="Mes commandes">
          <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
            <span aria-hidden="true">🧾</span> Mes commandes
            <span className="text-[11px] font-semibold text-muted-foreground">({orders.length})</span>
          </h2>
          <ul className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
            {orders.map((o) => (
              <OrderChip key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}

      <ul className="space-y-3">
        {services.map((svc) => {
          const orderable = svc.offers.length > 0 || svc.unitPrice != null;
          return (
            <li key={svc.id}>
              <button
                type="button"
                onClick={() => setSelected(svc)}
                className="w-full text-left bg-card border border-border rounded-2xl shadow-sm p-4 hover:border-accent active:scale-[0.99] transition-all cursor-pointer"
                aria-label={`Voir le service ${svc.name}`}
              >
                <div className="flex items-start gap-3.5">
                  <span className="text-3xl leading-none select-none shrink-0" aria-hidden="true">
                    {svc.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-bold text-card-foreground">{svc.name}</p>
                      <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30">
                        {svc.priceLabel}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">
                      {svc.categoryLabel}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{svc.description}</p>
                    {orderable && (
                      <p className="mt-2 text-[11px] font-bold text-accent">
                        🛍️ Commandable directement dans l&apos;app
                      </p>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Fiche détail — bottom sheet */}
      <AnimatePresence>
        {selected && (
          <ServiceSheet
            slug={slug}
            service={selected}
            contact={contact}
            propertyName={propertyName}
            booking={booking}
            bookingId={bookingId}
            online={online}
            onOrdered={() => refreshOrders()}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Ligne compacte de suivi de commande. */
function OrderChip({ order }: { order: GuestOrder }) {
  const meta = GUEST_ORDER_STATUS_META[order.status as GuestOrderStatus] ?? GUEST_ORDER_STATUS_META.PENDING;
  const items = Array.isArray(order.items) ? (order.items as { name: string; qty: number }[]) : [];
  const summary = items.map((it) => `${it.qty}× ${it.name}`).join(', ') || 'Commande';
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-bold text-card-foreground truncate">
          {order.provider.businessName}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{summary}</p>
      </div>
      <div className="shrink-0 text-right">
        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.className}`}>
          {meta.emoji} {meta.label}
        </span>
        <p className="text-[11px] font-bold text-card-foreground mt-0.5">{formatEurGuest(order.totalAmount)}</p>
      </div>
    </li>
  );
}

function ServiceSheet({ slug, service, contact, propertyName, booking, bookingId, online, onOrdered, onClose }: {
  slug: string;
  service: GuestService;
  contact: GuestPayload['guest']['contact'];
  propertyName: string;
  booking: GuestBookingInfo | null;
  bookingId: string | null;
  online: boolean;
  onOrdered: () => void;
  onClose: () => void;
}) {
  const hasOffers = service.offers.length > 0;
  const [qty, setQty] = useState(1);
  const [offerId, setOfferId] = useState<string>(service.offers[0]?.id ?? '');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const selectedOffer = service.offers.find((o) => o.id === offerId) ?? service.offers[0] ?? null;
  const orderable = hasOffers || service.unitPrice != null;
  const unitPrice = hasOffers ? selectedOffer?.unitPrice ?? 0 : (service.unitPrice as number);
  const unitLabel = hasOffers ? selectedOffer?.unit || 'prestation' : 'prestation';
  const total = orderable ? unitPrice * qty : 0;

  const order = () => {
    if (!orderable || state === 'sending') return;
    if (hasOffers && !selectedOffer) return;
    if (!online) {
      setErrorMsg('Vous êtes hors-ligne — reconnectez-vous au Wi-Fi du logement pour commander.');
      return;
    }
    setState('sending');
    setErrorMsg('');
    // ÉTAPE 17.5 : le client n'envoie JAMAIS de prix — offerId (offre
    // catalogue) ou nom informatif (offre standard). Le serveur re-prix.
    fetch(`/api/public/service-orders?slug=${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: service.id,
        bookingId: bookingId || undefined,
        guestName: booking?.guestName || undefined,
        items:
          hasOffers && selectedOffer
            ? [{ offerId: selectedOffer.id, qty }]
            : [{ name: `${service.name} — offre standard`, qty }],
      }),
    })
      .then(async (res) => {
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) {
          setErrorMsg(j?.message || 'La commande a échoué. Réessayez dans un instant.');
          setState('idle');
          return;
        }
        setState('done');
        onOrdered();
      })
      .catch(() => {
        setErrorMsg('Connexion impossible. Vérifiez votre réseau.');
        setState('idle');
      });
  };

  const emailFallback = () => {
    if (!contact.email) return;
    const subject = encodeURIComponent(`Demande de service — ${service.name} (${propertyName})`);
    const body = encodeURIComponent(
      `Bonjour ${contact.name},\n\nJe séjourne au "${propertyName}" et je souhaite commander :\n\n• ${service.name} (${service.categoryLabel}) — ${service.priceLabel}\n\nMerci de me confirmer la disponibilité.\n\nMerci !`,
    );
    window.location.assign(`mailto:${contact.email}?subject=${subject}&body=${body}`);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Service ${service.name}`}
    >
      {/* Fond */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 cursor-default"
      />

      <motion.div
        className="relative w-full max-w-lg rounded-t-3xl bg-card border-t border-x border-border p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-border mb-4" aria-hidden="true" />

        <div className="flex items-start gap-4">
          <span className="text-4xl leading-none select-none" aria-hidden="true">
            {service.emoji}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-card-foreground">{service.name}</h2>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">
              {service.categoryLabel} · Partenaire vérifié ✓
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-card-foreground/90 leading-relaxed">{service.description}</p>

        {orderable ? (
          <>
            {/* ÉTAPE 17.5 — Sélecteur de formule (catalogue fin) */}
            {hasOffers && (
              <fieldset className="mt-4" disabled={state !== 'idle'}>
                <legend className="text-xs font-bold text-card-foreground mb-1.5">
                  Choisissez votre formule
                </legend>
                <div className="space-y-2" role="radiogroup" aria-label="Formules disponibles">
                  {service.offers.map((o) => {
                    const active = selectedOffer?.id === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setOfferId(o.id)}
                        className={`w-full text-left rounded-xl border p-3 flex items-center justify-between gap-3 transition-all cursor-pointer ${
                          active
                            ? 'border-accent bg-accent/10 shadow-sm'
                            : 'border-border bg-card hover:bg-secondary/60'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                                active ? 'border-accent bg-accent' : 'border-muted-foreground/40 bg-transparent'
                              }`}
                            />
                            <span className="text-xs font-bold text-card-foreground truncate">{o.name}</span>
                          </span>
                          {o.description && (
                            <span className="block text-[11px] text-muted-foreground mt-0.5 pl-5 leading-snug">
                              {o.description}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="text-xs font-bold text-accent">{formatEurGuest(o.unitPrice)}</span>
                          <span className="block text-[10px] text-muted-foreground">/ {o.unit}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Sélecteur de quantité + total */}
            <div className="mt-4 rounded-xl bg-secondary border border-border p-3.5 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground font-medium shrink-0">
                {formatEurGuest(unitPrice)} / {unitLabel}
              </span>
              {state === 'idle' && (
                <div className="flex items-center gap-2" role="group" aria-label="Quantité">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="Retirer une prestation"
                    className="w-9 h-9 rounded-lg border border-border bg-card text-lg font-bold text-card-foreground disabled:opacity-40 hover:bg-accent/10 transition-colors cursor-pointer"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-card-foreground" aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(20, q + 1))}
                    aria-label="Ajouter une prestation"
                    className="w-9 h-9 rounded-lg border border-border bg-card text-lg font-bold text-card-foreground hover:bg-accent/10 transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
              )}
              <span className="shrink-0 text-sm font-bold text-accent">
                Total&nbsp;: {formatEurGuest(total)}
              </span>
            </div>

            {booking && (
              <p className="mt-2.5 text-[11px] text-muted-foreground text-center">
                Commande au nom de <span className="font-bold text-card-foreground">{booking.guestName}</span> (votre séjour)
              </p>
            )}

            {errorMsg && (
              <p className="mt-2.5 text-xs font-semibold text-rose-600 dark:text-rose-300 text-center" role="alert">
                {errorMsg}
              </p>
            )}

            {state === 'done' ? (
              <div
                className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center"
                role="status"
              >
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  ✅ Commande envoyée au partenaire&nbsp;!
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  Suivez son statut dans «&nbsp;Mes commandes&nbsp;». Votre hôte la confirme sous peu.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={order}
                disabled={state === 'sending'}
                className="mt-4 w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
              >
                {state === 'sending'
                  ? 'Envoi en cours…'
                  : online
                    ? `Commander — ${formatEurGuest(total)}`
                    : '📴 Indisponible hors-ligne'}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="mt-4 rounded-xl bg-secondary border border-border p-3.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Tarif</span>
              <span className="text-sm font-bold text-accent">{service.priceLabel}</span>
            </div>
            {contact.email ? (
              <button
                type="button"
                onClick={emailFallback}
                className="mt-4 w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
              >
                Demander un devis par email
              </button>
            ) : (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Demandez à votre hôte ({contact.name}) pour réserver ce service.
              </p>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 w-full h-11 rounded-xl border border-border bg-card text-card-foreground text-sm font-semibold hover:bg-secondary transition-colors cursor-pointer"
        >
          Fermer
        </button>
      </motion.div>
    </motion.div>
  );
}

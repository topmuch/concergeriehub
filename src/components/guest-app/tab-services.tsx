'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  GUEST_ORDER_STATUS_META,
  GUEST_PAYMENT_STATUS_META,
  formatEurGuest,
  type GuestBookingInfo,
  type GuestOrder,
  type GuestOrderStatus,
  type GuestPaymentStatus,
  type GuestPayload,
  type GuestService,
  type GuestServiceOffer,
  type GuestView,
} from './types';
import { playDing, useCartStore, type CartItem } from './cart-store';
import { ServiceCover } from './service-visual';
import { FloatingCart } from './floating-cart';
import { PhotoBand } from './photo-band';
import { HUB_VISUALS } from '@/lib/hub-visuals';
import {
  CartCheckout,
  OrderConfirmation,
  orderDeliveryLabel,
  type CartOrderResult,
} from './cart-checkout';
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » — carte + dialog de commande.
import { PressingCard } from './pressing-card';

// =============================================================
// REFONTE SERVICES PREMIUM (V4.11) — Onglet 🛎️ Services & Expériences
// Expérience « conciergerie de luxe / Uber Eats » :
//   • Header serif + recherche + chips de catégories (actif = amber)
//   • ⭐ Les plus demandés — carrousel horizontal snap (cartes cover)
//   • Sélection de l'hôte — section dédiée bordure ambre
//   • Tous les services — grille 2 colonnes compacte
//   • Panier flottant (FloatingCart) + Checkout plein écran (date,
//     créneaux 30 min, note) + Confirmation confettis dorés
// Moteur de transaction préservé : re-pricing serveur (17.5),
// paiement in-app (17.6), Connect mono-prestataire, checkout groupé
// multi-prestataires (V4.11), suivi « Mes commandes ».
// =============================================================

export function TabServices({ slug, services, contact, propertyName, booking, bookingId, online, payFlash, onNavigate, embedded = false, paymentEnabled = false }: {
  slug: string;
  services: GuestService[];
  contact: GuestPayload['guest']['contact'];
  propertyName: string;
  booking: GuestBookingInfo | null;
  bookingId: string | null;
  online: boolean;
  /** ÉTAPE 17.6 — retour Stripe Checkout consommé par GuestApp. */
  payFlash?: { type: 'paid' | 'cancelled'; orderId?: string };
  /** Retour au Hub depuis la confirmation (V4.11). */
  onNavigate?: (view: GuestView) => void;
  /** REFONTE HUB QR (V4.14) — monté dans l'overlay plein écran du hub :
   * panier flottant calé à bottom-4 (pas de bottom-nav à chevaucher). */
  embedded?: boolean;
  /** v4.54 — Stripe actif côté serveur (payload.premiumFeatures.paymentEnabled). */
  paymentEnabled?: boolean;
}) {
  const add = useCartStore((s) => s.add);

  const [selected, setSelected] = useState<GuestService | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmResult, setConfirmResult] = useState<CartOrderResult | null>(null);
  // payFlash 'paid' → confirmation PLEINE gérée au niveau GuestApp (toutes vues).
  // Ici : bandeau 'cancelled' uniquement (paiement non finalisé).
  const [payBanner, setPayBanner] = useState<'cancelled' | null>(
    payFlash?.type === 'cancelled' ? 'cancelled' : null,
  );

  // Recherche + filtres catégorie
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('Tous');

  // Micro-interactions : emoji qui « vole » vers le panier + ✓ 1 s
  const [flyer, setFlyer] = useState<{ id: number; emoji: string; x: number; y: number } | null>(null);
  const [addedKey, setAddedKey] = useState<string | null>(null);

  const [orders, setOrders] = useState<GuestOrder[] | null>(null);

  useEffect(() => {
    if (!payBanner) return;
    const t = setTimeout(() => setPayBanner(null), 8000);
    return () => clearTimeout(t);
  }, [payBanner]);

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

  // ── Dérivés : catégories, populaires, sélection hôte, filtrage ──
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const svc of services) {
      if (!map.has(svc.categoryLabel)) map.set(svc.categoryLabel, svc.emoji);
    }
    return [...map.entries()].map(([label, emoji]) => ({ label, emoji }));
  }, [services]);

  const orderableOf = (svc: GuestService) => svc.offers.length > 0 || svc.unitPrice != null;

  const popular = useMemo(
    () =>
      services
        .filter(orderableOf)
        .sort(
          (a, b) =>
            // Coups de cœur : mieux notés d'abord, catalogues riches en priorité.
            b.ratingAvg - a.ratingAvg || (b.offers.length > 0 ? 1 : 0) - (a.offers.length > 0 ? 1 : 0),
        )
        .slice(0, 6),
    [services],
  );

  const hostPicks = useMemo(() => services.filter((s) => s.offers.length > 0), [services]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      services.filter((svc) => {
        const matchCat = activeCat === 'Tous' || svc.categoryLabel === activeCat;
        const matchQ =
          !q ||
          svc.name.toLowerCase().includes(q) ||
          svc.description.toLowerCase().includes(q) ||
          svc.categoryLabel.toLowerCase().includes(q);
        return matchCat && matchQ;
      }),
    [services, activeCat, q],
  );

  // ── Ajout au panier (carte, carrousel ou fiche) ──
  const addToCart = (
    svc: GuestService,
    opts: { offer?: GuestServiceOffer; event?: React.MouseEvent; qty?: number; silentKey?: string } = {},
  ) => {
    const offer = opts.offer ?? null;
    const item: Omit<CartItem, 'qty'> = {
      lineKey: offer ? `${svc.id}:${offer.id}` : `${svc.id}:std:${svc.name}`,
      providerId: svc.id,
      providerName: svc.name,
      offerId: offer?.id ?? null,
      offerName: offer ? offer.name : `${svc.name} — offre standard`,
      serviceEmoji: svc.emoji,
      categoryLabel: svc.categoryLabel,
      // Affichage : prix de l'offre, sinon tarif standard, sinon 1re offre
      unitPrice: offer
        ? offer.unitPrice
        : (svc.unitPrice ?? svc.offers[0]?.unitPrice ?? 0),
      unit: offer ? offer.unit : 'prestation',
    };
    add(slug, { ...item, qty: opts.qty ?? 1 });
    playDing();
    const key = opts.silentKey ?? item.lineKey;
    setAddedKey(key);
    setTimeout(() => setAddedKey((k) => (k === key ? null : k)), 1000);
    // Emoji qui vole vers le panier flottant (bas-centre)
    if (opts.event) {
      const x = opts.event.clientX;
      const y = opts.event.clientY;
      setFlyer({ id: Date.now(), emoji: svc.emoji, x, y });
    }
  };

  const handleConfirmed = (result: CartOrderResult) => {
    setCheckoutOpen(false);
    setConfirmResult(result);
    refreshOrders();
  };

  const closeConfirmation = () => {
    setConfirmResult(null);
    setPayBanner(null);
    onNavigate?.('home'); // « Retour au Hub »
  };

  // ── États vides (photo d'accueil + repli emoji) ──
  if (services.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden text-center" role="status">
        <PhotoBand
          src={HUB_VISUALS.breakfast}
          emoji="🛎️"
          alt="Petit-déjeuner livré — services de la conciergerie"
          className="h-28"
        />
        <div className="p-8 pt-5">
          <h2 className="font-serif text-lg font-bold text-card-foreground">
            La conciergerie arrive bientôt
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Votre hôte prépare une sélection de services premium pour votre séjour. Revenez très vite&nbsp;—&nbsp;petit-déjeuner, champagne et expériences vous attendent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header premium (masqué dans l'overlay du hub : l'overlay
          fournit déjà son propre header sticky) ── */}
      {!embedded && (
        <div className="px-1">
          <h1 className="font-serif text-2xl font-bold text-card-foreground tracking-tight">
            🛎️ Room Services &amp; Expériences
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Commandez en 1 clic, livré à votre porte — sélection de partenaires vérifiés autour de {propertyName}
          </p>
        </div>
      )}

      {/* Bandeau retour Stripe (annulation seulement — le succès → confirmation pleine) */}
      {payBanner === 'cancelled' && (
        <div
          role="status"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-semibold text-amber-700 dark:text-amber-300 leading-relaxed"
        >
          💳 Paiement non finalisé — réglez votre commande depuis «&nbsp;Mes commandes&nbsp;» ci-dessous.
        </div>
      )}

      {/* ── Recherche + filtres catégorie ── */}
      <div className="space-y-3">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm select-none" aria-hidden="true">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un service…"
            aria-label="Rechercher un service"
            className="w-full h-11 rounded-full border border-border bg-card pl-10 pr-10 text-sm text-card-foreground placeholder:text-muted-foreground/70 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Effacer la recherche"
              className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-secondary text-muted-foreground text-xs font-bold hover:bg-secondary/70 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x" role="radiogroup" aria-label="Filtrer par catégorie">
          <CategoryChip label="Tous" emoji="✨" active={activeCat === 'Tous'} onClick={() => setActiveCat('Tous')} />
          {categories.map((c) => (
            <CategoryChip
              key={c.label}
              label={c.label}
              emoji={c.emoji}
              active={activeCat === c.label}
              onClick={() => setActiveCat(c.label)}
            />
          ))}
        </div>
      </div>

      {/* ── v4.54 PRESSING & BLANCHISSERIE EXPRESS (amélioration 1.5) —
          toujours visible en tête de catalogue (PWA ET hub QR) ; le
          flux Stripe n'est proposé qu'avec un séjour identifié ── */}
      <PressingCard
        slug={slug}
        bookingId={bookingId}
        guestName={booking?.guestName ?? null}
        paymentEnabled={paymentEnabled}
        embedded={embedded}
      />

      {/* ── ⭐ Les coups de cœur de l'hôte — carrousel style Uber Eats ── */}
      {popular.length > 0 && activeCat === 'Tous' && !q && (
        <section aria-label="Les coups de cœur de l'hôte">
          <h2 className="px-1 text-sm font-bold text-card-foreground flex items-center gap-1.5">
            ⭐ Les coups de cœur de l'hôte
          </h2>
          <div className="mt-2.5 flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
            {popular.map((svc, idx) => (
              <PopularCard
                key={svc.id}
                svc={svc}
                addedKey={addedKey}
                badge={idx === 0 ? 'Populaire' : 'Coup de cœur'}
                onOpen={() => setSelected(svc)}
                onAdd={(e) => addToCart(svc, { offer: svc.offers[0] ?? null, event: e, silentKey: `pop:${svc.id}` })}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Sélection de l'hôte (catalogue fin) ── */}
      {hostPicks.length > 0 && activeCat === 'Tous' && !q && (
        <section
          aria-label="Sélection de l'hôte"
          className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 p-4"
        >
          <h2 className="text-sm font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
            🎁 Sélection de votre hôte
          </h2>
          <p className="text-[11px] text-amber-800/70 dark:text-amber-200/60 mt-0.5">
            Des attentions choisies avec soin pour votre séjour
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {hostPicks.slice(0, 4).map((svc) => (
              <HostPickCard
                key={svc.id}
                svc={svc}
                addedKey={addedKey}
                onOpen={() => setSelected(svc)}
                onAdd={(e) => addToCart(svc, { offer: svc.offers[0] ?? null, event: e, silentKey: `host:${svc.id}` })}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Tous les services — grille 2 colonnes ── */}
      <section aria-label="Tous les services">
        <h2 className="px-1 text-sm font-bold text-card-foreground">
          {activeCat === 'Tous' && !q ? 'Tous les services' : 'Résultats'}
          <span className="ml-1.5 text-[11px] font-semibold text-muted-foreground">({filtered.length})</span>
        </h2>
        {filtered.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
            <span className="text-4xl select-none" aria-hidden="true">🔎</span>
            <p className="mt-3 text-sm font-bold text-card-foreground">Aucun service trouvé</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Essayez un autre mot-clé ou revenez à «&nbsp;Tous&nbsp;».
            </p>
          </div>
        ) : (
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            {filtered.map((svc) => (
              <CompactCard
                key={svc.id}
                svc={svc}
                addedKey={addedKey}
                onOpen={() => setSelected(svc)}
                onAdd={(e) => orderableOf(svc) ? addToCart(svc, { offer: svc.offers[0] ?? null, event: e, silentKey: `grid:${svc.id}` }) : setSelected(svc)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Mes commandes (suivi du séjour courant) ── */}
      {orders && orders.length > 0 && (
        <section className="bg-card border border-border rounded-2xl shadow-sm p-4" aria-label="Mes commandes">
          <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
            <span aria-hidden="true">🧾</span> Mes commandes
            <span className="text-[11px] font-semibold text-muted-foreground">({orders.length})</span>
          </h2>
          <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
            {orders.map((o) => (
              <OrderChip
                key={o.id}
                order={o}
                slug={slug}
                bookingId={bookingId}
                online={online}
                onChanged={refreshOrders}
              />
            ))}
          </ul>
        </section>
      )}

      {/* ── Fiche détail — bottom sheet premium ── */}
      <AnimatePresence>
        {selected && (
          <ServiceSheet
            service={selected}
            contact={contact}
            propertyName={propertyName}
            online={online}
            addedKey={addedKey}
            onAdd={addToCart}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Panier flottant (au-dessus de la bottom-nav) ── */}
      <AnimatePresence>
        {!checkoutOpen && !confirmResult && (
          <FloatingCart slug={slug} embedded={embedded} onCheckout={() => setCheckoutOpen(true)} />
        )}
      </AnimatePresence>

      {/* ── Checkout plein écran ── */}
      <AnimatePresence>
        {checkoutOpen && (
          <CartCheckout
            slug={slug}
            booking={booking}
            bookingId={bookingId}
            online={online}
            propertyName={propertyName}
            onClose={() => setCheckoutOpen(false)}
            onConfirmed={handleConfirmed}
          />
        )}
      </AnimatePresence>

      {/* ── Confirmation du checkout (le retour Stripe ?paid= est géré par GuestApp) ── */}
      <AnimatePresence>
        {confirmResult && <OrderConfirmation result={confirmResult} onClose={closeConfirmation} />}
      </AnimatePresence>

      {/* ── Micro-interaction : emoji qui vole vers le panier ── */}
      <AnimatePresence>
        {flyer && (
          <FlyEmoji
            key={flyer.id}
            emoji={flyer.emoji}
            x={flyer.x}
            y={flyer.y}
            onDone={() => setFlyer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================
// Cartes premium
// =============================================================

/** Note affichée sur les cartes — démonstration sociale (style Uber Eats).
 *  Module-level : utilisée par PopularCard / HostPickCard / CompactCard / ServiceSheet. */
function ratingLabel(avg: number, count: number): string {
  return `⭐ ${avg.toFixed(1).replace('.', ',')} · ${count} avis`;
}

/** Chip de filtre catégorie — actif = ambre plein. */
function CategoryChip({ label, emoji, active, onClick }: {
  label: string;
  emoji: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`shrink-0 snap-start px-3.5 h-9 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
        active
          ? 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/30 scale-[1.02]'
          : 'bg-card/80 text-muted-foreground border-border hover:border-amber-500/50 hover:text-card-foreground'
      }`}
    >
      <span aria-hidden="true">{emoji}</span> {label}
    </button>
  );
}

/** Bouton « + » rond ambre → ✓ vert pendant 1 s après ajout. */
function AddButton({ added, onClick, label }: { added: boolean; onClick: (e: React.MouseEvent) => void; label: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      aria-label={label}
      className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md transition-colors cursor-pointer ${
        added ? 'bg-emerald-500' : 'bg-amber-500 hover:bg-amber-400'
      }`}
    >
      {added ? '✓' : '+'}
    </motion.button>
  );
}

/** Grande carte carrousel (style Uber Eats) — cover gradient + badge.
 *  ⚠️ a11y : la carte est un <div> avec un bouton d'ouverture plein
 *  surface ; le « + » est un FRÈRE du bouton (jamais imbriqué). */
function PopularCard({ svc, addedKey, badge, onOpen, onAdd }: {
  svc: GuestService;
  addedKey: string | null;
  badge: string;
  onOpen: () => void;
  onAdd: (e: React.MouseEvent) => void;
}) {
  const price = svc.offers[0]?.unitPrice ?? svc.unitPrice;
  const added = addedKey === `pop:${svc.id}`;
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className="relative shrink-0 snap-start w-64 text-left bg-card border border-border rounded-2xl shadow-lg shadow-black/5 overflow-hidden hover:border-amber-500/40 transition-colors"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Voir ${svc.name}`}
        className="block w-full text-left cursor-pointer"
      >
        <div className="relative">
          <ServiceCover emoji={svc.emoji} categoryLabel={svc.categoryLabel} imageUrl={svc.imageUrl} alt={svc.name} className="h-36" emojiClassName="text-6xl" />
          <span className="absolute top-2.5 right-2.5 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md">
            {badge}
          </span>
          <span className="absolute bottom-2.5 left-2.5 bg-black/45 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
            ✓ Partenaire vérifié
          </span>
        </div>
        <div className="p-3.5">
          <p className="text-sm font-bold text-card-foreground truncate">{svc.name}</p>
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5" aria-label={`Note ${svc.ratingAvg.toFixed(1)} sur 5, ${svc.totalReviews} avis`}>
            {ratingLabel(svc.ratingAvg, svc.totalReviews)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{svc.description}</p>
          <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
              {price != null ? `dès ${formatEurGuest(price)}` : 'Sur devis'}
            </span>
            {price != null && <span className="h-8 w-8 shrink-0" aria-hidden="true" />}
          </div>
        </div>
      </button>
      {price != null && (
        <div className="absolute bottom-3.5 right-3.5 z-10">
          <AddButton added={added} onClick={onAdd} label={`Ajouter ${svc.name} au panier`} />
        </div>
      )}
    </motion.div>
  );
}

/** Carte « Sélection de l'hôte » — bordure ambre, fond ambré.
 *  a11y : bouton d'ouverture + « + » en frère (pas d'imbrication). */
function HostPickCard({ svc, addedKey, onOpen, onAdd }: {
  svc: GuestService;
  addedKey: string | null;
  onOpen: () => void;
  onAdd: (e: React.MouseEvent) => void;
}) {
  const price = svc.offers[0]?.unitPrice ?? svc.unitPrice;
  const added = addedKey === `host:${svc.id}`;
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="relative text-left bg-card border border-amber-200 dark:border-amber-500/30 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Voir ${svc.name}`}
        className="block w-full text-left cursor-pointer"
      >
        <ServiceCover emoji={svc.emoji} categoryLabel={svc.categoryLabel} imageUrl={svc.imageUrl} alt={svc.name} className="h-24" emojiClassName="text-4xl" />
        <div className="p-3">
          <p className="text-xs font-bold text-card-foreground truncate">{svc.name}</p>
          <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">{svc.categoryLabel}</p>
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5" aria-label={`Note ${svc.ratingAvg.toFixed(1)} sur 5, ${svc.totalReviews} avis`}>
            {ratingLabel(svc.ratingAvg, svc.totalReviews)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {price != null ? `dès ${formatEurGuest(price)}` : 'Sur devis'}
            </span>
            {price != null && <span className="h-8 w-8 shrink-0" aria-hidden="true" />}
          </div>
        </div>
      </button>
      {price != null && (
        <div className="absolute bottom-3 right-3 z-10">
          <AddButton added={added} onClick={onAdd} label={`Ajouter ${svc.name} au panier`} />
        </div>
      )}
    </motion.div>
  );
}

/** Carte compacte de la grille « Tous les services » (2 colonnes).
 *  a11y : bouton d'ouverture + « + » en frère (pas d'imbrication). */
function CompactCard({ svc, addedKey, onOpen, onAdd }: {
  svc: GuestService;
  addedKey: string | null;
  onOpen: () => void;
  onAdd: (e: React.MouseEvent) => void;
}) {
  const orderable = svc.offers.length > 0 || svc.unitPrice != null;
  const price = svc.offers[0]?.unitPrice ?? svc.unitPrice;
  const added = addedKey === `grid:${svc.id}`;
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="relative text-left bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:border-amber-500/40 transition-colors"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Voir ${svc.name}`}
        className="block w-full text-left cursor-pointer"
      >
        <ServiceCover emoji={svc.emoji} categoryLabel={svc.categoryLabel} imageUrl={svc.imageUrl} alt={svc.name} className="h-24" emojiClassName="text-4xl" />
        <div className="p-3">
          <p className="text-xs font-bold text-card-foreground truncate">{svc.name}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5 truncate">
            {svc.categoryLabel}
          </p>
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5" aria-label={`Note ${svc.ratingAvg.toFixed(1)} sur 5, ${svc.totalReviews} avis`}>
            {ratingLabel(svc.ratingAvg, svc.totalReviews)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={`text-xs font-bold ${orderable ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
              {orderable ? (price != null ? `dès ${formatEurGuest(price)}` : 'Sur devis') : svc.priceLabel}
            </span>
            {orderable && price != null && <span className="h-8 w-8 shrink-0" aria-hidden="true" />}
          </div>
        </div>
      </button>
      {orderable && price != null && (
        <div className="absolute bottom-3 right-3 z-10">
          <AddButton added={added} onClick={onAdd} label={`Ajouter ${svc.name} au panier`} />
        </div>
      )}
    </motion.div>
  );
}

/** Emoji qui « vole » du bouton + vers le panier flottant (layout libre). */
function FlyEmoji({ emoji, x, y, onDone }: {
  emoji: string;
  x: number;
  y: number;
  onDone: () => void;
}) {
  const targetX = typeof window !== 'undefined' ? window.innerWidth / 2 - x : 0;
  const targetY = typeof window !== 'undefined' ? window.innerHeight - 140 - y : 0;
  return (
    <motion.span
      className="fixed z-[70] pointer-events-none text-3xl select-none"
      style={{ left: x - 16, top: y - 16 }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{ x: targetX, y: targetY, scale: 0.35, opacity: 0.2 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={onDone}
      aria-hidden="true"
    >
      {emoji}
    </motion.span>
  );
}

// =============================================================
// Ligne compacte de suivi de commande — avec paiement in-app (17.6)
// V4.11 : affiche le créneau choisi (orderDeliveryLabel).
// =============================================================
function OrderChip({ order, slug, bookingId, online, onChanged }: {
  order: GuestOrder;
  slug: string;
  bookingId: string | null;
  online: boolean;
  onChanged: () => void;
}) {
  const meta = GUEST_ORDER_STATUS_META[order.status as GuestOrderStatus] ?? GUEST_ORDER_STATUS_META.PENDING;
  const payMeta = GUEST_PAYMENT_STATUS_META[(order.paymentStatus as GuestPaymentStatus) ?? 'UNPAID'] ?? GUEST_PAYMENT_STATUS_META.UNPAID;
  const items = Array.isArray(order.items) ? (order.items as { name: string; qty: number }[]) : [];
  const summary = items.map((it) => `${it.qty}× ${it.name}`).join(', ') || 'Commande';
  const delivery = orderDeliveryLabel(order);

  // Paiement à finaliser : UNPAID/FAILED sur une commande non annulée
  const payPending =
    (order.paymentStatus === 'UNPAID' || order.paymentStatus === 'FAILED') &&
    order.status !== 'CANCELLED';

  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const pay = () => {
    if (paying || !online) {
      if (!online) setPayError('Hors-ligne : reconnectez-vous au Wi-Fi pour payer.');
      return;
    }
    setPaying(true);
    setPayError('');
    // ÉTAPE 17.6 — le montant n'est JAMAIS envoyé : le serveur facture
    // order.totalAmount. Stripe réel → redirection Checkout ; démo → PAID.
    fetch(`/api/public/service-orders/${encodeURIComponent(order.id)}/pay?slug=${encodeURIComponent(slug)}${bookingId ? `&b=${encodeURIComponent(bookingId)}` : ''}`, {
      method: 'POST',
    })
      .then(async (res) => {
        const j = await res.json().catch(() => null);
        if (j?.ok && j.mode === 'stripe' && j.url) {
          window.location.assign(j.url); // retour ?paid= confirmé par webhook
          return;
        }
        if (!j?.ok) {
          setPayError(j?.message || 'Le paiement a échoué. Réessayez dans un instant.');
          setPaying(false);
          return;
        }
        setPaying(false);
        onChanged();
      })
      .catch(() => {
        setPayError('Connexion impossible. Vérifiez votre réseau.');
        setPaying(false);
      });
  };

  return (
    <li className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-card-foreground truncate">
            {order.provider.businessName}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">{summary}</p>
          {delivery && (
            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
              📅 Livraison&nbsp;: {delivery}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.className}`}>
            {meta.emoji} {meta.label}
          </span>
          {payPending ? (
            <button
              type="button"
              onClick={pay}
              disabled={paying}
              aria-label={`Payer ${formatEurGuest(order.totalAmount)} pour ${order.provider.businessName}`}
              className="mt-1 inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-accent text-accent-foreground text-[11px] font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer"
            >
              {paying ? 'Paiement…' : `💳 Payer · ${formatEurGuest(order.totalAmount)}`}
            </button>
          ) : (
            <p className="text-[11px] font-bold text-card-foreground mt-0.5">
              {order.paymentStatus === 'PAID' && <span className={payMeta.className + ' font-bold'}>💳 Payée · </span>}
              {formatEurGuest(order.totalAmount)}
            </p>
          )}
        </div>
      </div>
      {payError && (
        <p className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-300" role="alert">
          {payError}
        </p>
      )}
    </li>
  );
}

// =============================================================
// Fiche détail — bottom sheet premium (cover gradient, formules,
// quantité) → « Ajouter au panier » (V4.11 : plus de commande directe).
// =============================================================
function ServiceSheet({ service, contact, propertyName, online, addedKey, onAdd, onClose }: {
  service: GuestService;
  contact: GuestPayload['guest']['contact'];
  propertyName: string;
  online: boolean;
  addedKey: string | null;
  onAdd: (svc: GuestService, opts: { offer?: GuestServiceOffer; event?: React.MouseEvent; qty?: number; silentKey?: string }) => void;
  onClose: () => void;
}) {
  const hasOffers = service.offers.length > 0;
  const [qty, setQty] = useState(1);
  const [offerId, setOfferId] = useState<string>(service.offers[0]?.id ?? '');

  const selectedOffer = service.offers.find((o) => o.id === offerId) ?? service.offers[0] ?? null;
  const orderable = hasOffers || service.unitPrice != null;
  const unitPrice = hasOffers ? selectedOffer?.unitPrice ?? 0 : (service.unitPrice as number);
  const unitLabel = hasOffers ? selectedOffer?.unit || 'prestation' : 'prestation';
  const total = orderable ? unitPrice * qty : 0;
  const added = addedKey === `sheet:${service.id}:${offerId || 'std'}`;

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
        className="relative w-full max-w-lg rounded-t-3xl bg-card border-t border-x border-border overflow-hidden max-h-[85vh] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        {/* Cover gradient + poignée */}
        <div className="relative">
          <ServiceCover emoji={service.emoji} categoryLabel={service.categoryLabel} imageUrl={service.imageUrl} alt={service.name} className="h-32" emojiClassName="text-6xl" />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/35 to-transparent" aria-hidden="true" />
          <div className="absolute top-2.5 left-0 right-0 mx-auto h-1.5 w-12 rounded-full bg-white/70" aria-hidden="true" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-black/40 text-white text-sm font-bold backdrop-blur-sm hover:bg-black/55 cursor-pointer"
          >
            ✕
          </button>
          <span className="absolute bottom-2.5 right-2.5 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md">
            ✓ Partenaire vérifié
          </span>
        </div>

        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-serif text-xl font-bold text-card-foreground">{service.name}</h2>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">
                {service.categoryLabel}
              </p>
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1" aria-label={`Note ${service.ratingAvg.toFixed(1)} sur 5, ${service.totalReviews} avis`}>
                {ratingLabel(service.ratingAvg, service.totalReviews)}
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/30">
              {service.priceLabel}
            </span>
          </div>

          <p className="mt-3 text-sm text-card-foreground/90 leading-relaxed">{service.description}</p>

          {orderable ? (
            <>
              {/* Sélecteur de formule (catalogue fin) */}
              {hasOffers && (
                <fieldset className="mt-4" disabled={false}>
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
                              ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                              : 'border-border bg-card hover:bg-secondary/60'
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                                  active ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground/40 bg-transparent'
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
                          {/* v4.23 « hub réel » — vignette photo de la formule */}
                          {o.imageUrl && (
                            <img
                              src={o.imageUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-11 w-11 rounded-lg object-cover shrink-0 border border-border"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <span className="shrink-0 text-right">
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{formatEurGuest(o.unitPrice)}</span>
                            <span className="block text-[10px] text-muted-foreground">/ {o.unit}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {/* Quantité + total */}
              <div className="mt-4 rounded-xl bg-secondary border border-border p-3.5 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground font-medium shrink-0">
                  {formatEurGuest(unitPrice)} / {unitLabel}
                </span>
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
                <span className="shrink-0 text-sm font-bold text-amber-600 dark:text-amber-400">
                  Total&nbsp;: {formatEurGuest(total)}
                </span>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={(e) => {
                  onAdd(service, {
                    offer: hasOffers ? selectedOffer ?? undefined : undefined,
                    qty,
                    event: e,
                    silentKey: `sheet:${service.id}:${(hasOffers ? selectedOffer?.id : 'std') || 'std'}`,
                  });
                  onClose();
                }}
                className={`mt-4 w-full h-12 rounded-xl font-bold text-sm text-white shadow-lg transition-all cursor-pointer ${
                  added
                    ? 'bg-emerald-500 shadow-emerald-500/25'
                    : 'bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/25 hover:opacity-95'
                }`}
              >
                {added ? '✓ Ajouté au panier' : `🛒 Ajouter au panier — ${formatEurGuest(total)}`}
              </motion.button>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Vous finaliserez le créneau et le paiement au checkout.
              </p>
            </>
          ) : (
            <>
              <div className="mt-4 rounded-xl bg-secondary border border-border p-3.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Tarif</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{service.priceLabel}</span>
              </div>
              {contact.email ? (
                <button
                  type="button"
                  onClick={emailFallback}
                  className="mt-4 w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-sm hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
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

          {!online && orderable && (
            <p className="mt-2.5 text-center text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              📴 Ajout possible hors-ligne — le checkout exige le Wi-Fi.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

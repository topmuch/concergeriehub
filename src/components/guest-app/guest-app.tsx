'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TabHome } from './tab-home';
import { TabGuide } from './tab-guide';
import { TabServices } from './tab-services';
import { TabHelp } from './tab-help';
import { GUEST_TABS, type GuestPayload, type GuestTab } from './types';

// =============================================================
// ÉTAPE 16 (V3) — App Invitée "app-like" (PWA sans téléchargement)
// • Bottom navigation bar (🏠 📖 🥐 🚨) style iOS/Android
// • Transitions horizontales Framer Motion (direction-aware)
// • Dark mode automatique (via GuestScope + prefers-color-scheme)
// • Bannière hors-ligne + données en cache (Service Worker)
// • Personnalisation via ?b=<bookingId> (mémorisée localement)
// ÉTAPE 17.6 — payFlash (retour Stripe ?paid= / ?paycancel=)
// =============================================================

const TAB_ORDER: GuestTab[] = ['home', 'guide', 'services', 'help'];

/** Retour de paiement Stripe Checkout (ÉTAPE 17.6). */
export interface PayFlash {
  type: 'paid' | 'cancelled';
  orderId?: string;
}

export function GuestApp({ slug, initialBookingId, payFlash }: { slug: string; initialBookingId?: string; payFlash?: PayFlash }) {
  const [payload, setPayload] = useState<GuestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [retryTick, setRetryTick] = useState(0);
  const [tab, setTab] = useState<GuestTab>('home');
  const [direction, setDirection] = useState(1);
  const [online, setOnline] = useState(true);
  const [bookingId, setBookingId] = useState<string | undefined>(initialBookingId);
  const bookingIdRef = useRef<string | undefined>(initialBookingId);

  const storageKey = `ch-guest-booking-${slug}`;

  // ÉTAPE 17.6 — retour Stripe : nettoie ?paid= / ?paycancel= de l'URL
  // (le bandeau reste affiché 8 s via TabServices, mais un refresh
  // complet ne rejoue PAS le flash — le webhook a déjà confirmé).
  useEffect(() => {
    if (!payFlash) return;
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('paid');
        u.searchParams.delete('paycancel');
        window.history.replaceState(null, '', u.toString());
      } catch {
        /* URL non nettoyable — flash sans conséquence */
      }
    }
  }, [payFlash]);

  // ── Chargement du payload (avec booking mémorisé) ──
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        let b = bookingIdRef.current;
        if (!b && typeof window !== 'undefined') {
          b = window.localStorage.getItem(storageKey) || undefined;
          bookingIdRef.current = b;
        }
        const qs = new URLSearchParams({ slug });
        if (b) qs.set('b', b);
        const res = await fetch(`/api/public/guest-app?${qs.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.message || 'Cette app est introuvable.');
          setLoading(false);
          return;
        }
        // Mémorise le booking validé par l'API → les prochaines
        // visites restent personnalisées (hors-ligne inclus).
        if (b && json.guest?.booking) {
          setBookingId(b);
          try {
            window.localStorage.setItem(storageKey, b);
          } catch {
            /* stockage indisponible — sans conséquence */
          }
        }
        setPayload(json as GuestPayload);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError('Impossible de charger l’app. Vérifiez votre connexion.');
        setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [slug, storageKey, retryTick]);

  // ── Statut réseau (bannière hors-ligne) ──
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const navigate = useCallback(
    (next: GuestTab) => {
      setTab((current) => {
        if (current === next) return current;
        setDirection(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(current) ? 1 : -1);
        try {
          navigator.vibrate?.(8); // feedback haptique léger (mobiles)
        } catch {
          /* silencieux */
        }
        return next;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [],
  );

  const retry = () => {
    setLoading(true);
    setError('');
    setRetryTick((t) => t + 1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ── En-tête compact ── */}
      <header
        className="sticky top-0 z-40 bg-background/85 backdrop-blur border-b border-border pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 px-4"
        role="banner"
      >
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <span className="text-xl select-none" aria-hidden="true">🗝️</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground leading-none">
              Conciergerie Hub
            </p>
            <p className="text-sm font-bold text-card-foreground truncate mt-0.5">
              {payload?.property.name ?? 'Votre séjour'}
            </p>
          </div>
          {!online && (
            <span
              className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-secondary text-muted-foreground border border-border"
              role="status"
              title="Contenu consultable grâce au cache hors-ligne"
            >
              📴 Hors-ligne
            </span>
          )}
        </div>
      </header>

      {/* ── Contenu ── */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 pt-4 pb-32" role="main">
        {loading && <LoadingState />}

        {!loading && error && (
          <div className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center mt-8" role="alert">
            <span className="text-5xl select-none" aria-hidden="true">🔌</span>
            <h1 className="mt-4 text-lg font-bold text-card-foreground">App indisponible</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-5 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        )}

        {!loading && payload && (
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={tab}
              custom={direction}
              initial={{ opacity: 0, x: 32 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -32 * direction }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              {tab === 'home' && <TabHome payload={payload} onNavigate={navigate} />}
              {tab === 'guide' && (
                <TabGuide guidebook={payload.guest.guidebook} houseRules={payload.guest.houseRules} />
              )}
              {tab === 'services' && (
                <TabServices
                  slug={slug}
                  services={payload.guest.services}
                  contact={payload.guest.contact}
                  propertyName={payload.property.name}
                  booking={payload.guest.booking}
                  bookingId={payload.guest.booking ? bookingId ?? null : null}
                  online={online}
                  payFlash={payFlash}
                />
              )}
              {tab === 'help' && (
                <TabHelp
                  slug={slug}
                  contact={payload.guest.contact}
                  propertyName={payload.property.name}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* ── Bottom navigation bar ── */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 px-2"
        role="navigation"
        aria-label="Navigation principale"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4">
          {GUEST_TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-1.5 rounded-xl min-h-[48px] transition-colors cursor-pointer ${
                  active ? 'text-accent' : 'text-muted-foreground hover:text-card-foreground'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="guest-tab-indicator"
                    className="absolute -top-1.5 h-0.5 w-8 rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="text-xl leading-none select-none" aria-hidden="true">
                  {t.emoji}
                </span>
                <span className={`text-[10px] font-semibold ${active ? 'font-bold' : ''}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4 mt-2" aria-busy="true" aria-label="Chargement de l'app">
      <div className="h-28 rounded-2xl bg-card border border-border animate-pulse" />
      <div className="h-24 rounded-2xl bg-card border border-border animate-pulse" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
        <div className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
        <div className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
      </div>
      <p className="text-center text-xs text-muted-foreground">Chargement de votre séjour…</p>
    </div>
  );
}

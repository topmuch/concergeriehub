'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// =============================================================
// PREMIUM « CONCIERGERIE 5 ÉTOILES » (V5) — 2.3 BOUCLIER D'AVIS
// (Review Shield) — carte « ⭐ Comment s'est passé votre séjour ? »
//
// DESIGN PREMIUM « LUXE TECH » (V4.10) — étoiles animées :
//   • étoiles SVG en outline par défaut (fine, élégante)
//   • au survol de la n-ième étoile, les n premières se remplissent
//     avec un stagger de 50 ms + rebond ressort
//   • remplissage en gradient or (amber → jaune doux)
//   • explosion de sparkles dorées au clic (auto-nettoyée)
//
// Double branche après le choix des étoiles :
//   • 4-5 ★ → « Merci infiniment ! » + bouton vers l'annonce
//     (reviewUrl Airbnb/Booking configurée par l'hôte)
//   • 1-3 ★ → « Nous sommes désolés… » + formulaire PRIVÉ
//     → POST /api/public/hub/[slug]/private-feedback
//     → sauvegarde PrivateFeedback + 🚨 ALERTE CRITIQUE hôte
//       (Email + Push immédiats, Étape 3.4)
//
// TRAÇABILITÉ (Étape 3.2) : `token` (lien SMS/email du matin du
// départ — /app/hub/[slug]/guest/feedback?token=…) ou `bookingId`
// (Hub classique ?b=) sont envoyés au POST et validés SERVEUR →
// le retour privé est rattaché au séjour (PrivateFeedback.bookingId).
//
// Le retour est mémorisé localement (localStorage par slug) : la
// carte se replie après envoi — on ne redemande jamais deux fois.
// =============================================================

type ShieldState = 'pick' | 'thanks' | 'sorry' | 'sending' | 'sent' | 'error' | 'done';

const STAR_PATH =
  'M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.1 1.13-6.57L2.45 9.44l6.6-.96L12 2.5z';

/** Sparkles dorées : angles déterministes (i/8 du cercle) — zéro aléatoire au rendu. */
const SPARKS = Array.from({ length: 8 }, (_, i) => ({
  angle: (i / 8) * Math.PI * 2,
  distance: 20 + (i % 3) * 6,
  size: 3 + (i % 2),
}));

export function ReviewShieldCard({
  slug,
  propertyName,
  reviewUrl,
  guestName,
  token = null,
  bookingId = null,
}: {
  slug: string;
  propertyName: string;
  reviewUrl: string | null;
  guestName: string | null;
  /** Token du lien automatisé (matin du départ) — validé serveur. */
  token?: string | null;
  /** Séjour lié (Hub classique ?b=) — re-validé serveur. */
  bookingId?: string | null;
}) {
  const storageKey = `ch-review-shield-${slug}`;
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [branch, setBranch] = useState<Exclude<ShieldState, 'pick'>>('thanks');
  const [comment, setComment] = useState('');
  const [picked, setPicked] = useState(false);
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState<{ star: number; id: number } | null>(null);
  const hydrated = useRef(false);

  // Replie la carte si l'invité a déjà répondu (hydration-safe)
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (!alive || hydrated.current) return;
      hydrated.current = true;
      try {
        if (window.localStorage.getItem(storageKey) === 'done') setDone(true);
      } catch {
        /* stockage indisponible — sans conséquence */
      }
    })();
    return () => {
      alive = false;
    };
  }, [storageKey]);

  const pickStars = (n: number) => {
    setStars(n);
    setBranch(n >= 4 ? 'thanks' : 'sorry');
    setPicked(true);
    // Sparkles dorées — event-driven, nettoyage auto.
    const burstId = Date.now() % 100000;
    setBurst({ star: n, id: burstId });
    setTimeout(() => setBurst(null), 750);
  };

  const submitPrivate = async () => {
    setBranch('sending');
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/private-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars, comment, guestName, token, bookingId }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setBranch('error');
        setError(json?.error || 'Envoi impossible. Réessayez dans un instant.');
        return;
      }
      markDone();
      setBranch('sent');
    } catch {
      setBranch('error');
      setError('Envoi impossible. Vérifiez votre connexion puis réessayez.');
    }
  };

  const [error, setError] = useState('');

  const markDone = () => {
    try {
      window.localStorage.setItem(storageKey, 'done');
    } catch {
      /* sans conséquence */
    }
  };

  if (done || (picked && branch === 'sent')) {
    return (
      <section
        aria-label="Retour sur votre séjour"
        className="bg-card border border-emerald-500/30 rounded-2xl shadow-sm p-5 text-center"
      >
        <p className="text-2xl select-none" aria-hidden="true">💫</p>
        <p className="mt-1 text-sm font-bold text-card-foreground">Merci pour votre retour&nbsp;!</p>
        <p className="text-xs text-muted-foreground mt-1">
          {branch === 'thanks'
            ? null
            : 'Votre hôte a bien été prévenu — il reviendra vers vous rapidement.'}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Comment s'est passé votre séjour ?"
      className="bg-card border border-border rounded-2xl shadow-sm p-5 relative overflow-hidden"
    >
      {/* Dégradé or partagé par les 5 étoiles SVG (1 seule définition) */}
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="lux-gold-star" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="55%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#fcd34d" />
          </linearGradient>
        </defs>
      </svg>

      {!picked ? (
        <>
          <h2 className="font-serif! text-lg font-bold text-card-foreground text-center tracking-tight">
            ⭐ Comment s&apos;est passé votre séjour&nbsp;?
          </h2>
          <p className="text-xs text-muted-foreground mt-1 text-center">
            Votre avis compte énormément pour {propertyName}.
          </p>
          <div
            className="mt-4 flex items-center justify-center gap-1.5"
            role="radiogroup"
            aria-label="Notez votre séjour de 1 à 5 étoiles"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n, i) => {
              const active = n <= (hover || stars);
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                  onClick={() => pickStars(n)}
                  onMouseEnter={() => setHover(n)}
                  onFocus={() => setHover(n)}
                  onBlur={() => setHover(0)}
                  className="relative p-1.5 cursor-pointer select-none touch-manipulation"
                >
                  <motion.svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    animate={
                      active
                        ? { scale: 1.15, y: -2 }
                        : { scale: 1, y: 0 }
                    }
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 16,
                      delay: active ? i * 0.05 : 0, // stagger 50 ms
                    }}
                    className="drop-shadow-[0_2px_8px_rgba(245,158,11,0.35)]"
                  >
                    <path
                      d={STAR_PATH}
                      fill={active ? 'url(#lux-gold-star)' : 'none'}
                      stroke={active ? '#f59e0b' : 'currentColor'}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      className={active ? '' : 'text-muted-foreground/60'}
                    />
                  </motion.svg>

                  {/* Sparkles dorées au clic */}
                  {burst?.star === n &&
                    SPARKS.map((s, k) => (
                      <motion.span
                        key={`${burst.id}-${k}`}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-amber-300"
                        style={{ width: s.size, height: s.size }}
                        initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                        animate={{
                          x: Math.cos(s.angle) * s.distance,
                          y: Math.sin(s.angle) * s.distance - 8,
                          opacity: 0,
                          scale: 0.3,
                        }}
                        transition={{ duration: 0.65, ease: 'easeOut' }}
                      />
                    ))}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/80" aria-hidden="true">
            {stars >= 4 || hover >= 4
              ? '✨ Merci du fond du cœur…'
              : hover > 0 || stars > 0
                ? 'Quelque chose à nous dire ? Votre hôte vous écoute.'
                : 'Touchez une étoile'}
          </p>
        </>
      ) : branch === 'thanks' ? (
        <div className="text-center">
          <p className="text-3xl select-none" aria-hidden="true">🎉</p>
          <h2 className="font-serif! mt-2 text-lg font-bold text-card-foreground tracking-tight">
            Merci infiniment&nbsp;!
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Ravi(e) que votre séjour vous plaise&nbsp;! Un avis public nous aide énormément —
            c&apos;est le meilleur merci pour votre hôte.
          </p>
          {reviewUrl ? (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={markDone}
              className="font-serif! mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-5 text-amber-950 font-bold text-sm shadow-[0_6px_24px_rgba(245,158,11,0.35)] hover:shadow-[0_10px_32px_rgba(245,158,11,0.5)] hover:-translate-y-0.5 active:scale-[0.98] transition-all"
            >
              ⭐ Laisser un avis public
            </a>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              🙏 Toute l&apos;équipe vous remercie et vous souhaite un excellent séjour.
            </p>
          )}
          {reviewUrl && (
            <button
              type="button"
              onClick={markDone}
              className="mt-3 block mx-auto text-xs font-semibold text-muted-foreground hover:text-card-foreground underline underline-offset-2 cursor-pointer"
            >
              Plus tard
            </button>
          )}
        </div>
      ) : branch === 'sending' ? (
        <div className="py-6 text-center" aria-busy="true" role="status">
          <p className="text-sm font-semibold text-card-foreground">⏳ Envoi à votre hôte…</p>
        </div>
      ) : branch === 'error' ? (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-center" role="alert">
          <p className="text-sm font-bold text-destructive">Envoi impossible</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <button
            type="button"
            onClick={() => setBranch('sorry')}
            className="mt-2.5 h-10 px-4 rounded-xl bg-card border border-border text-sm font-semibold text-card-foreground hover:bg-secondary cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      ) : (
        <div>
          <h2 className="font-serif! text-lg font-bold text-card-foreground text-center tracking-tight">
            😔 Nous sommes désolés d&apos;apprendre cela…
          </h2>
          <p className="text-xs text-muted-foreground mt-1.5 text-center leading-relaxed">
            Dites-nous ce qui n&apos;a pas été à la hauteur&nbsp;: votre hôte est prévenu
            immédiatement et pourra corriger le tir pour la suite de votre séjour.
          </p>
          <label className="sr-only" htmlFor={`shield-comment-${slug}`}>
            Votre message privé pour votre hôte
          </label>
          <textarea
            id={`shield-comment-${slug}`}
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 2000))}
            placeholder="Ex : le chauffe-eau ne fonctionnait pas et le Wi-Fi coupait souvent…"
            rows={4}
            className="mt-3 w-full rounded-xl border border-border bg-secondary px-3.5 py-3 text-sm text-card-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
          />
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              🔒 Message 100&nbsp;% privé — jamais publié.
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {comment.length}/2000
            </span>
          </div>
          <button
            type="button"
            onClick={submitPrivate}
            disabled={comment.trim().length < 3}
            className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Envoyer à votre hôte
          </button>
        </div>
      )}
    </section>
  );
}

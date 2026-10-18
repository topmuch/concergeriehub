'use client';

import { useEffect, useMemo, useState } from 'react';
import { geoDirectionsUrl } from '@/lib/concierge';

// =============================================================
// v4.61 « OÙ SORTIR CE SOIR ? » — module événements TEMPS RÉEL
// autour du logement, intégré en tête de l'onglet 🗺️ Quartier.
//
//   • Sources agrégées côté serveur (/api/public/events?slug=) :
//     Ticketmaster · Eventbrite · Bandsintown — cache 1 h ;
//   • Filtres par catégorie (chips, comptes — même pattern que la
//     Carte Secrète), groupage par jour (Aujourd'hui, Demain…) ;
//   • Message d'accueil selon l'heure de l'appareil de l'invité ;
//   • Actions : « 📍 Y aller » (Apple/Google Maps natif) et
//     « Réserver ↗ » vers la billetterie quand disponible ;
//   • Dégradation élégante : non configuré → carte d'attente ;
//     démo-hub → programmation d'exemple libellée « démo ».
// =============================================================

type EventCategory = 'concert' | 'expo' | 'market' | 'rooftop' | 'show' | 'other';

interface HubEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  lat: number | null;
  lng: number | null;
  category: EventCategory;
  image: string | null;
  url: string | null;
  price: string | null;
  source: 'ticketmaster' | 'eventbrite' | 'bandsintown' | 'paris' | 'demo';
}

interface EventsData {
  ok: boolean;
  configured: boolean;
  events: HubEvent[];
  demo?: boolean;
}

const CATEGORY_META: Record<EventCategory, { emoji: string; label: string }> = {
  concert: { emoji: '🎵', label: 'Concerts' },
  expo: { emoji: '🎨', label: 'Expos' },
  market: { emoji: '🛍️', label: 'Marchés' },
  rooftop: { emoji: '🍹', label: 'Rooftops' },
  show: { emoji: '🎭', label: 'Spectacles' },
  other: { emoji: '✨', label: 'Autres' },
};

/** Message d'accueil selon l'heure locale de l'invité. */
function greetingOf(now: Date): string {
  const h = now.getHours();
  if (h >= 6 && h < 12) return '🌅 Voici ce qui bouge autour de vous ce matin';
  if (h >= 12 && h < 18) return '☀️ Des idées pour cet après-midi ?';
  if (h >= 18 && h < 22) return '🌙 Où sortir ce soir ?';
  return '🌃 Envie d’une sortie nocturne ?';
}

/** « Aujourd'hui », « Demain », sinon « sam. 14 février ». */
function dayLabel(dateStr: string, today: Date): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(date) - startOf(today)) / 86_400_000);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

export function EventsTonight({ slug }: { slug: string }) {
  const [data, setData] = useState<EventsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/public/events?slug=${encodeURIComponent(slug)}`);
        const json = (await res.json()) as EventsData;
        if (cancelled) return;
        setFailed(false);
        setData({ ok: Boolean(json?.ok), configured: Boolean(json?.configured), events: Array.isArray(json?.events) ? json.events : [], demo: json?.demo });
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Échec réseau : on n'encombre pas le Quartier — silencieux.
  if (failed) return null;

  // Chargement : squelette compact (neutre, jamais vert).
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-busy="true" aria-label="Chargement des événements">
        <div className="h-5 w-40 rounded-md bg-black/[0.07] animate-pulse" />
        <div className="mt-3 h-4 w-64 max-w-full rounded-md bg-black/[0.07] animate-pulse" />
        <div className="mt-5 space-y-3">
          <div className="h-24 rounded-2xl bg-black/[0.05] animate-pulse" />
          <div className="h-24 rounded-2xl bg-black/[0.05] animate-pulse" />
        </div>
      </div>
    );
  }

  const events = data?.events ?? [];
  const hasEvents = data?.ok && events.length > 0;

  // Non configuré / pas de coordonnées / aucune source : état d'attente.
  if (!hasEvents) {
    if (data?.ok && data.configured && events.length === 0) {
      return (
        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 text-center mt-2" role="status">
          <span className="text-3xl select-none" aria-hidden="true">🗓️</span>
          <h2 className="mt-2 text-sm font-bold text-card-foreground">Aucun événement dans les 7 prochains jours</h2>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Autour du logement, tout est calme pour le moment. Revenez très vite, la programmation bouge chaque jour !
          </p>
        </div>
      );
    }
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm p-6 text-center mt-2" role="status">
        <span className="text-3xl select-none" aria-hidden="true">🎉</span>
        <h2 className="mt-2 text-sm font-bold text-card-foreground">Les sorties du quartier arrivent bientôt</h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Votre hôte prépare la programmation des événements autour du logement — concerts, expos, marchés et bons plans du soir.
        </p>
      </div>
    );
  }

  return <EventsTonightLoaded events={events} demo={data?.demo === true} />;
}

function EventsTonightLoaded({ events, demo }: { events: HubEvent[]; demo: boolean }) {
  const [filter, setFilter] = useState<EventCategory | 'all'>('all');
  const today = useMemo(() => new Date(), []);
  const greeting = useMemo(() => greetingOf(today), [today]);

  // Compteurs par catégorie (uniquement celles réellement présentes).
  const counts = useMemo(() => {
    const map = new Map<EventCategory, number>();
    for (const e of events) map.set(e.category, (map.get(e.category) ?? 0) + 1);
    return map;
  }, [events]);

  const filtered = events.filter((e) => filter === 'all' || e.category === filter);

  // Groupage par jour (ordre chronologique déjà garanti par l'API).
  const groups = useMemo(() => {
    const map = new Map<string, HubEvent[]>();
    for (const e of filtered) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <section aria-label="Où sortir ce soir — événements autour du logement" className="space-y-3">
      {/* ── Bandeau d'en-tête (ton accent, compatible white-label) ── */}
      <div className="relative overflow-hidden rounded-2xl bg-accent px-5 py-5 text-white shadow-sm">
        <span aria-hidden="true" className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
        <span aria-hidden="true" className="absolute right-10 bottom-[-30px] h-20 w-20 rounded-full bg-white/10" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">
            🎉 Événements temps réel
            {demo && (
              <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide normal-case">
                Exemple de démo
              </span>
            )}
          </p>
          <h2 className="mt-1 text-lg font-bold leading-tight">Où sortir ce soir&nbsp;?</h2>
          <p className="mt-0.5 text-xs text-white/85" aria-live="polite">{greeting}</p>
          <p className="mt-2 text-[11px] text-white/75">
            {events.length} événement{events.length > 1 ? 's' : ''} autour du logement dans les 7 prochains jours
          </p>
        </div>
      </div>

      {/* ── Filtres par catégorie — chips (pattern Carte Secrète) ── */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les événements par catégorie">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`🎟️ Tous (${events.length})`} />
        {(Object.keys(CATEGORY_META) as EventCategory[])
          .filter((c) => counts.has(c))
          .map((c) => (
            <FilterChip
              key={c}
              active={filter === c}
              onClick={() => setFilter(c)}
              label={`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label} (${counts.get(c)})`}
            />
          ))}
      </div>

      {/* ── Liste groupée par jour ── */}
      {groups.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4" role="status">
          Aucun événement dans cette catégorie pour le moment.
        </p>
      ) : (
        groups.map(([date, dayEvents]) => (
          <div key={date} className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-1">
              📅 {dayLabel(date, today)}
            </h3>
            <ul className="space-y-3">
              {dayEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 px-3.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-card-foreground border-border hover:border-accent hover:bg-accent/5'
      }`}
    >
      {label}
    </button>
  );
}

function EventCard({ event }: { event: HubEvent }) {
  const meta = CATEGORY_META[event.category] ?? CATEGORY_META.other;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(event.image) && !imgFailed;
  const directions = event.lat !== null && event.lng !== null ? geoDirectionsUrl(event.lat, event.lng) : null;

  return (
    <li className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {showImage && (
        <img
          src={event.image as string}
          alt={event.title}
          loading="lazy"
          decoding="async"
          className="h-36 w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-lg leading-none"
              aria-hidden="true"
            >
              {meta.emoji}
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-card-foreground leading-snug">{event.title}</h4>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
                {meta.label}
                {event.venue && <span className="font-normal normal-case tracking-normal"> · {event.venue}</span>}
              </p>
            </div>
          </div>
          {event.price && (
            <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">
              {event.price}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-semibold">🕐 {event.time || 'Horaire à confirmer'}</span>
          {event.address && <span className="truncate">📍 {event.address}</span>}
        </div>

        {event.description && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{event.description}</p>
        )}

        <div className="mt-3.5 flex gap-2.5">
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
            >
              🎟️ Réserver
              <span aria-hidden="true" className="opacity-80">↗</span>
            </a>
          )}
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl border border-border bg-card text-sm font-semibold text-card-foreground hover:border-accent hover:bg-accent/5 active:scale-[0.98] transition-all ${event.url ? '' : 'flex-1'}`}
            >
              📍 Y aller
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { geoDirectionsUrl, spotCategoryMeta, SPOT_CATEGORY_META, type GuestSpot, type GuestSpotCategory } from '@/lib/concierge';
import { HUB_VISUALS } from '@/lib/hub-visuals';
import { PhotoBand } from './photo-band';
import { EventsTonight } from './events-tonight';

// =============================================================
// DIGITAL CONCIERGE (V4.1) — ÉTAPE 3.4 : onglet 🗺️ Quartier
// « 🤫 La Carte Secrète de l'Hôte » : adresses perso filtrables
// (🍔 Food · 🍹 Bars · 🛒 Courses · 🏃 Sport) + bouton « 📍 Y aller »
// (Apple Maps sur iPhone, Google Maps ailleurs — app native).
// v4.25 « HUB RÉEL » — en-tête avec VRAIE photo (terrasse de
// café du quartier) ; repli emoji si échec de chargement.
// v4.61 « OÙ SORTIR CE SOIR ? » — le module événements temps réel
// (events-tonight.tsx) s'affiche EN TÊTE de l'onglet, au-dessus de
// la Carte Secrète, y compris quand aucune adresse n'est configurée.
// WP-VISUAL — RECHERCHE DANS LE QUARTIER :
//   • champ de recherche (type=search) + bouton « 🔍 Rechercher »
//     au-dessus des chips : filtre en DIRECT les adresses (nom +
//     adresse + note de l'hôte, insensible à la casse ET aux accents) ;
//   • 0 résultat → état vide amical « Aucun lieu ne correspond à “…” »
//     + bouton « Effacer la recherche » ;
//   • sous la liste : « 🔎 Rechercher autour du logement » ouvre
//     Google Maps (query courant ou « points of interest ») centré sur
//     le logement — coords du bien non transmises à cet onglet →
//     repli = 1re bonne adresse de l'hôte (même quartier).
// =============================================================

type Filter = 'all' | GuestSpotCategory;

/** WP-VISUAL — normalise une chaîne pour la recherche : minuscules +
 *  accents retirés (NFD) — « café » ≡ « cafe », « Crème » ≡ « creme ». */
function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function TabLocal({ spots, slug }: { spots: GuestSpot[]; slug: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  // WP-VISUAL — recherche libre sur les bonnes adresses
  const [query, setQuery] = useState('');

  // Compteurs par catégorie (uniquement celles réellement configurées)
  const counts = useMemo(() => {
    const map = new Map<GuestSpotCategory, number>();
    for (const s of spots) map.set(s.category, (map.get(s.category) ?? 0) + 1);
    return map;
  }, [spots]);

  // WP-VISUAL — liste filtrée par catégorie (chips) ET recherche libre
  // (nom + adresse + note de l'hôte, insensible casse/accents).
  const q = normalizeSearch(query);
  const matchesQuery = (s: GuestSpot): boolean =>
    !q
    || normalizeSearch(s.name).includes(q)
    || (s.address ? normalizeSearch(s.address).includes(q) : false)
    || (s.hostNote ? normalizeSearch(s.hostNote).includes(q) : false);

  const visible = spots
    .filter((s) => filter === 'all' || s.category === filter)
    .filter(matchesQuery)
    .sort((a, b) => a.name.localeCompare(b.name));

  // WP-VISUAL — centre de la recherche Google Maps « autour du
  // logement » : les coords du bien (payload.property.latitude/longitude)
  // ne sont pas transmises à cet onglet → repli = 1re bonne adresse
  // de l'hôte, située dans le même quartier (guard runtime défensif).
  const centerLat = spots[0]?.lat;
  const centerLng = spots[0]?.lng;
  const hasCenter = typeof centerLat === 'number' && Number.isFinite(centerLat)
    && typeof centerLng === 'number' && Number.isFinite(centerLng);
  const aroundUrl = hasCenter
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q ? query.trim() : 'points of interest')}&center=${centerLat},${centerLng}`
    : null;

  if (spots.length === 0) {
    return (
      <div className="mt-2 space-y-4">
        {/* v4.61 — « Où sortir ce soir ? » reste visible même sans bonnes adresses */}
        <EventsTonight slug={slug} />
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden text-center" role="status">
          <PhotoBand
            src={HUB_VISUALS.spots}
            emoji="🤫"
            alt="Terrasse de café du quartier — bonnes adresses"
            className="h-28"
          />
          <div className="p-8 pt-5">
            <h1 className="text-lg font-bold text-card-foreground">La Carte Secrète de l'Hôte</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Votre hôte prépare ses meilleures adresses : restaurants, bars, courses et balades du quartier.
              Revenez très vite !
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-4">
      {/* v4.61 — « Où sortir ce soir ? » : événements temps réel autour du logement */}
      <EventsTonight slug={slug} />

      {/* Titre du module — VRAIE PHOTO (v4.25 « hub réel ») */}
      <section
        aria-label="Carte secrète"
        className="rounded-2xl shadow-sm overflow-hidden border border-border"
      >
        <PhotoBand
          src={HUB_VISUALS.spots}
          emoji="🤫"
          alt="Terrasse de café du quartier — bonnes adresses"
          className="h-28"
        >
          <div className="p-5">
            <h1 className="text-lg font-bold text-white leading-tight drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              🤫 La Carte Secrète de l'Hôte
            </h1>
            <p className="mt-1 text-xs text-white/85 leading-relaxed drop-shadow-sm">
              {spots.length} adresse{spots.length > 1 ? 's' : ''} testée{spots.length > 1 ? 's' : ''} et approuvée{spots.length > 1 ? 's' : ''} par votre hôte.
            </p>
          </div>
        </PhotoBand>

        {/* WP-VISUAL — Recherche + filtres — chips */}
        <div className="bg-card p-4 pt-3">
          {/* Recherche libre — filtre les adresses en direct (nom + adresse + note hôte) */}
          <form
            role="search"
            aria-label="Rechercher une adresse du quartier"
            onSubmit={(e) => {
              // Filtrage déjà en direct à la saisie → on referme juste
              // le clavier mobile après un appui sur « Rechercher ».
              e.preventDefault();
              (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Restaurant, boulangerie, parc…"
              aria-label="Rechercher une adresse"
              enterKeyHint="search"
              className="min-w-0 flex-1 min-h-11 rounded-xl bg-secondary border border-border px-3.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066EF]/60"
            />
            <button
              type="submit"
              className="shrink-0 min-h-11 px-4 rounded-xl bg-[#0066EF] hover:bg-[#0052C4] text-white text-sm font-bold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066EF]"
            >
              🔍 Rechercher
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`🗺️ Tous (${spots.length})`} />
            {(Object.keys(SPOT_CATEGORY_META) as GuestSpotCategory[])
              .filter((c) => counts.has(c))
              .map((c) => (
                <FilterChip
                  key={c}
                  active={filter === c}
                  onClick={() => setFilter(c)}
                  label={`${SPOT_CATEGORY_META[c].emoji} ${SPOT_CATEGORY_META[c].label} (${counts.get(c)})`}
                />
              ))}
          </div>
        </div>
      </section>

      {/* Liste des lieux — filtrée par catégorie (chips) + recherche libre */}
      {visible.length === 0 ? (
        q ? (
          <div className="bg-card border border-border rounded-2xl shadow-sm p-6 text-center" role="status">
            <span className="text-3xl select-none" aria-hidden="true">🔍</span>
            <p className="mt-2 text-sm font-bold text-card-foreground leading-snug">
              Aucun lieu ne correspond à “{query.trim()}”
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              Essayez un autre mot-clé (ex. « boulangerie », « parc ») ou changez de catégorie —
              vous pouvez aussi élargir la recherche autour du logement ci-dessous.
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-4 min-h-11 px-4 rounded-xl bg-secondary border border-border text-sm font-semibold text-card-foreground hover:border-accent transition-colors cursor-pointer"
            >
              ✕ Effacer la recherche
            </button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-6" role="status">
            Aucune adresse dans cette catégorie pour le moment.
          </p>
        )
      ) : (
        <ul className="space-y-3">
          {visible.map((spot) => (
            <SpotCard key={spot.id} spot={spot} />
          ))}
        </ul>
      )}

      {/* WP-VISUAL — Élargir : Google Maps autour du logement (query
          courant, sinon « points of interest »), centré sur le bien. */}
      {aroundUrl && (
        <a
          href={aroundUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouvrir la recherche dans Google Maps autour du logement"
          className="flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl bg-secondary border border-border text-sm font-semibold text-card-foreground hover:border-accent hover:bg-accent/5 transition-colors"
        >
          🔎 {q ? `Rechercher « ${query.trim()} » autour du logement` : 'Rechercher autour du logement'}
          <span aria-hidden="true" className="opacity-80">↗</span>
        </a>
      )}
    </div>
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

function SpotCard({ spot }: { spot: GuestSpot }) {
  const meta = spotCategoryMeta(spot.category);
  const href = geoDirectionsUrl(spot.lat, spot.lng);

  return (
    <li className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none select-none shrink-0 mt-0.5" aria-hidden="true">
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-card-foreground leading-snug">{spot.name}</h2>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {meta.label}
            {spot.address && <span className="font-normal normal-case tracking-normal"> · {spot.address}</span>}
          </p>
          {spot.hostNote && (
            <div className="mt-2.5 rounded-xl bg-accent/5 border border-accent/30 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-accent">💬 Note de l'hôte</p>
              <p className="mt-0.5 text-sm text-card-foreground leading-relaxed">{spot.hostNote}</p>
            </div>
          )}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center justify-center gap-1.5 h-10 px-4 w-full rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
          >
            📍 Y aller
            <span aria-hidden="true" className="opacity-80">↗</span>
          </a>
        </div>
      </div>
    </li>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { geoDirectionsUrl } from '@/lib/concierge';

// =============================================================
// 8 AMÉLIORATIONS (PHASE 1) — 1.4 PHARMACIE DE GARDE AUTOMATIQUE
// Carte de l'onglet 🆘 SOS : trouve AUTOMATIQUEMENT la pharmacie la
// plus proche du logement (Geoapify/OSM via le proxy serveur
// /api/public/nearby-pharmacy) et propose Itinéraire (app GPS native)
// + Appeler (si numéro connu). 
// Cache sessionStorage 1 h par slug → zéro latence au 2e affichage
// et volume de requêtes minimal. Repli élégant : aucun blocage si
// l'API est indisponible (message discret, jamais de crash).
// =============================================================

interface NearbyPharmacy {
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lon: number;
  distanceKm: number;
}

const CACHE_TTL_MS = 3_600_000; // 1 h

interface CacheShape {
  at: number;
  pharmacy: NearbyPharmacy | null;
}

function readCache(key: string): NearbyPharmacy | null | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheShape;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return undefined;
    return parsed.pharmacy;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, pharmacy: NearbyPharmacy | null): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), pharmacy } satisfies CacheShape));
  } catch {
    /* stockage indisponible — sans conséquence */
  }
}

/** "1,2 km" — format FR, 1 décimale. */
function formatDistance(km: number): string {
  return km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
}

export function NearbyPharmacyCard({
  slug,
  propertyLat,
  propertyLng,
}: {
  slug: string;
  propertyLat: number | null;
  propertyLng: number | null;
}) {
  const [pharmacy, setPharmacy] = useState<NearbyPharmacy | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');

  const hasCoords = typeof propertyLat === 'number' && Number.isFinite(propertyLat)
    && typeof propertyLng === 'number' && Number.isFinite(propertyLng);

  useEffect(() => {
    if (!hasCoords) return;

    let cancelled = false;
    const key = `ch-nearby-pharmacy-${slug}`;

    (async () => {
      // Cache session d'abord (instantané, hors-ligne inclus).
      const cached = readCache(key);
      if (cached !== undefined) {
        setPharmacy(cached);
        setState(cached ? 'ready' : 'none');
        return;
      }

      try {
        const res = await fetch(`/api/public/nearby-pharmacy?slug=${encodeURIComponent(slug)}`);
        if (!res.ok || cancelled) {
          if (!cancelled) setState('error');
          return;
        }
        const json = (await res.json()) as {
          ok?: boolean;
          reason?: 'not_found' | 'no_coords' | 'none_found' | 'provider_error';
          pharmacy?: NearbyPharmacy | null;
        };
        if (cancelled) return;
        if (json.ok && json.pharmacy) {
          setPharmacy(json.pharmacy);
          writeCache(key, json.pharmacy);
          setState('ready');
        } else if (json.reason === 'provider_error') {
          // Panne fournisseur — PAS mis en cache : nouvel essai au prochain affichage.
          setState('error');
        } else {
          writeCache(key, null);
          setState('none');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, hasCoords]);

  // Pas de coordonnées sur le bien → la carte automatique ne s'affiche pas
  // (la pharmacie configurée manuellement par l'hôte reste visible, elle).
  if (!hasCoords) return null;

  return (
    <section
      aria-label="Pharmacie la plus proche"
      className="bg-card border border-border rounded-2xl shadow-sm p-5"
    >
      <div className="flex items-center gap-3 mb-1">
        <div className="text-3xl leading-none select-none" aria-hidden="true">💊</div>
        <div className="min-w-0">
          <h2 className="font-serif! text-xl font-bold text-card-foreground leading-tight">Pharmacie de garde</h2>
          <p className="text-muted-foreground text-sm">La plus proche de vous</p>
        </div>
      </div>

      {/* v4.68 — CLARTÉ ORIGINE : l'invité ne savait pas d'où venait cette
          adresse. On indique explicitement que c'est une suggestion
          automatique basée sur la position du logement (OpenStreetMap). */}
      <p className="text-[11px] leading-snug text-muted-foreground/80">
        Suggérée automatiquement d'après la position du logement — votre hôte n'a pas sélectionné cette adresse.
      </p>

      {state === 'loading' && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-4" role="status">
          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-border border-t-accent animate-spin" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Recherche de la pharmacie la plus proche…</p>
        </div>
      )}

      {state === 'ready' && pharmacy && (
        <>
          <p className="mt-3 text-card-foreground font-semibold">{pharmacy.name}</p>
          {pharmacy.address && <p className="text-muted-foreground text-sm mt-0.5">{pharmacy.address}</p>}
          <div className="mt-3 grid gap-2">
            <a
              href={geoDirectionsUrl(pharmacy.lat, pharmacy.lon)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl
                         flex items-center justify-center gap-2 transition-colors"
            >
              🧭 Itinéraire ({formatDistance(pharmacy.distanceKm)})
              <span aria-hidden="true" className="opacity-70">↗</span>
            </a>
            {pharmacy.phone && (
              <a
                href={`tel:${pharmacy.phone.replace(/\s+/g, '')}`}
                className="w-full bg-secondary border border-border text-card-foreground font-semibold py-3 rounded-xl
                           flex items-center justify-center gap-2 hover:bg-accent/10 transition-colors"
              >
                📞 Appeler la pharmacie
              </a>
            )}
          </div>
          {pharmacy.phone && (
            <p className="mt-2 text-[11px] text-muted-foreground text-center" aria-hidden="false">
              {pharmacy.phone}
            </p>
          )}
        </>
      )}

      {state === 'none' && (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Aucune pharmacie trouvée dans un rayon de 5 km. En France, appelez le&nbsp;
            <a href="tel:3237" className="font-bold text-card-foreground underline decoration-dotted">3237</a>&nbsp;
            (pharmacies de garde, 24 h/24).
          </p>
        </div>
      )}

      {state === 'error' && (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-secondary/60 px-4 py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Information momentanément indisponible. En cas d&apos;urgence médicale, appelez le&nbsp;
            <a href="tel:15" className="font-bold text-card-foreground underline decoration-dotted">15</a>.
          </p>
        </div>
      )}
    </section>
  );
}

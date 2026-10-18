'use client';

// =============================================================
// AddressAutocomplete — CHAMP ADRESSE AVEC AUTOCOMPLÉTION (v4.43)
//
// L'hôte tape les premières lettres de son adresse : les suggestions
// apparaissent (Google Places si une clé API est configurée sur le
// serveur, sinon OpenStreetMap/Nominatim — gratuit, sans clé).
//
// À la SÉLECTION d'une suggestion :
//   • l'adresse textuelle COMPLÈTE est remise dans le champ ;
//   • la latitude/longitude EXACTES sont renvoyées au formulaire
//     (onSelect) pour être stockées en base avec l'adresse.
//
// Utilisé par : AddPropertyWizard + EditPropertyDialog
// (/airbnb/properties). Backoff : si le fournisseur est injoignable,
// la saisie manuelle reste possible (aucun blocage).
// =============================================================
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlacePick {
  label: string;
  lat: number | null;
  lng: number | null;
}

interface Suggestion extends PlacePick {
  placeId: string | null;
  source: 'google' | 'osm';
}

export function AddressAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder,
  invalid,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  /** Appelé quand l'hôte choisit une suggestion : adresse complète + lat/lng. */
  onSelect: (pick: PlacePick) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const autoId = useId();
  const inputId = id ?? `addr-${autoId}`;
  const listId = `${inputId}-list`;

  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Fermeture au clic extérieur.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  const search = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/places?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        setItems([]);
        setOpen(false);
        return;
      }
      const json = (await res.json()) as { items?: Suggestion[] };
      const next = Array.isArray(json.items) ? json.items : [];
      setItems(next);
      setOpen(next.length > 0);
      setHighlight(next.length > 0 ? 0 : -1);
    } catch {
      // Requête annulée ou réseau indisponible → saisie manuelle OK.
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (v: string) => {
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = v.trim();
    if (q.length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => void search(q), 300);
  };

  const pickItem = (s: Suggestion) => {
    onChange(s.label);
    setOpen(false);
    setItems([]);
    onSelect({ label: s.label, lat: s.lat, lng: s.lng });
    // Google : l'autocomplétion ne donne pas les coordonnées → résolution
    // immédiate via Place Details (côté serveur).
    if (s.placeId) {
      fetch(`/api/airbnb/places/details?placeId=${encodeURIComponent(s.placeId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { label?: string; lat?: number; lng?: number } | null) => {
          if (j && typeof j.lat === 'number' && typeof j.lng === 'number') {
            if (j.label) onChange(j.label);
            onSelect({ label: j.label ?? s.label, lat: j.lat, lng: j.lng });
          }
        })
        .catch(() => undefined);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => {
            if (items.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || items.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => (h + 1) % items.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => (h - 1 + items.length) % items.length);
            } else if (e.key === 'Enter' && highlight >= 0) {
              e.preventDefault();
              pickItem(items[highlight]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder ?? '12 Rue de la Paix, 75002 Paris'}
          autoComplete="off"
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            invalid && 'border-rose-400 focus-visible:ring-rose-300',
          )}
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
            aria-hidden="true"
          />
        )}
      </div>

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions d'adresse"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg custom-scrollbar"
        >
          {items.map((s, i) => (
            <li key={`${s.source}-${s.label}-${i}`} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown (avant le blur) pour ne pas perdre la sélection.
                  e.preventDefault();
                  pickItem(s);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm',
                  i === highlight ? 'bg-slate-100' : 'bg-white hover:bg-slate-50',
                )}
              >
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate text-slate-800">{s.label}</span>
                  {s.lat != null && s.lng != null && (
                    <span className="block text-[11px] text-slate-400">
                      📍 {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
            Coordonnées GPS remplies automatiquement — ou continuez la saisie manuelle.
          </li>
        </ul>
      )}
    </div>
  );
}

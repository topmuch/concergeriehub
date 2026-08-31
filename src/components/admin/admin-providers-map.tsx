'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap, useMapEvents } from 'react-leaflet';
import { PROVIDER_CATEGORY_META, providerCategoryMeta } from '@/lib/b2b';
import 'leaflet/dist/leaflet.css';

// =============================================================
// AdminProvidersMap — ÉTAPE 9.2 : carte interactive Leaflet.
//  - Marqueurs emoji (un par prestataire, icône selon catégorie)
//  - Cercles de rayon d'action (serviceRadiusKm)
//  - Mode "placement" : un clic sur la carte renvoie les coords
//    au formulaire (onMapClick).
// Rendu 100 % client (import dynamique ssr:false côté parent).
// =============================================================

export interface MapProvider {
  id: string;
  businessName: string;
  category: string;
  audience: string;
  latitude: number;
  longitude: number;
  serviceRadiusKm: number;
  isActive: boolean;
}

export interface MapDraftPosition {
  latitude: number;
  longitude: number;
}

interface AdminProvidersMapProps {
  providers: MapProvider[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  placingMode?: boolean;
  draftPosition?: MapDraftPosition | null;
  draftRadiusKm?: number;
}

const PARIS_CENTER: [number, number] = [48.8566, 2.3522];

/** Icône emoji en pastille blanche (contour sombre si sélectionné). */
function emojiIcon(emoji: string, selected: boolean, inactive: boolean): L.DivIcon {
  return L.divIcon({
    className: 'admin-provider-marker',
    html: `<div style="
      width:34px;height:34px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:${selected ? '#0f172a' : '#ffffff'};
      border:2px solid ${selected ? '#0f172a' : inactive ? '#e2e8f0' : '#cbd5e1'};
      box-shadow:0 2px 6px rgba(15,23,42,.25);
      font-size:16px;line-height:1;${inactive ? 'opacity:.45;grayscale:1;' : ''}
    ">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

/** Pastille du brouillon (position en cours de placement). */
function draftIcon(): L.DivIcon {
  return L.divIcon({
    className: 'admin-provider-marker',
    html: `<div style="
      width:30px;height:30px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:#10b981;border:3px solid #ffffff;
      box-shadow:0 0 0 6px rgba(16,185,129,.25),0 2px 8px rgba(15,23,42,.3);
      font-size:13px;line-height:1;
    ">📍</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/** Recadre la carte sur tous les marqueurs au premier chargement. */
function FitAll({ providers }: { providers: MapProvider[] }) {
  const map = useMap();
  useEffect(() => {
    if (providers.length === 0) return;
    const bounds = L.latLngBounds(providers.map((p) => [p.latitude, p.longitude] as [number, number]));
    map.fitBounds(bounds.pad(0.15), { animate: false });
  }, []);
  return null;
}

/** Recentre sur un prestataire sélectionné depuis la liste. */
function FocusProvider({ target }: { target: MapProvider | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView([target.latitude, target.longitude], Math.max(map.getZoom(), 13), { animate: true });
  }, [target, map]);
  return null;
}

/** Clic carte → coordonnées (mode placement du formulaire). */
function ClickCatcher({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AdminProvidersMap({
  providers,
  selectedId,
  onSelect,
  onMapClick,
  placingMode = false,
  draftPosition = null,
  draftRadiusKm = 10,
}: AdminProvidersMapProps) {
  const target = providers.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="relative h-[420px] w-full rounded-xl overflow-hidden border border-slate-200 z-0">
      <MapContainer
        center={PARIS_CENTER}
        zoom={11}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
        aria-label="Carte des prestataires"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitAll providers={providers} />
        <FocusProvider target={target} />
        <ClickCatcher onMapClick={onMapClick} />

        {/* Rayon d'action (sous les marqueurs) */}
        {providers.map((p) =>
          p.id === selectedId ? (
            <Circle
              key={`circle-${p.id}`}
              center={[p.latitude, p.longitude]}
              radius={p.serviceRadiusKm * 1000}
              pathOptions={{ color: '#0f172a', fillColor: '#0f172a', fillOpacity: 0.06, weight: 1.5, dashArray: '6 6' }}
            />
          ) : null,
        )}

        {/* Rayon du brouillon en cours de placement */}
        {placingMode && draftPosition && (
          <Circle
            key="circle-draft"
            center={[draftPosition.latitude, draftPosition.longitude]}
            radius={draftRadiusKm * 1000}
            pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.08, weight: 1.5, dashArray: '6 6' }}
          />
        )}

        {/* Marqueurs prestataires */}
        {providers.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={emojiIcon(categoryEmoji(p.category), p.id === selectedId, !p.isActive)}
            eventHandlers={{ click: () => onSelect(p.id) }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <strong>{p.businessName}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#475569' }}>
                  {categoryLabel(p.category)} · {p.audience === 'OWNER_SERVICE' ? '🔧 Propriétaire' : '🥂 Invité'}
                  <br />
                  Rayon {p.serviceRadiusKm} km {!p.isActive && '· ⛔ Inactif'}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Position en cours de placement */}
        {placingMode && draftPosition && (
          <Marker position={[draftPosition.latitude, draftPosition.longitude]} icon={draftIcon()} />
        )}
      </MapContainer>

      {/* Bandeau mode placement */}
      {placingMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-slate-900 text-white text-xs font-semibold px-3.5 py-2 rounded-full shadow-lg whitespace-nowrap">
          📍 Cliquez sur la carte pour positionner le prestataire
        </div>
      )}
    </div>
  );
}

// --- helpers catégorie ---
function categoryEmoji(category: string): string {
  return PROVIDER_CATEGORY_META[category]?.emoji ?? '🛠️';
}
function categoryLabel(category: string): string {
  return providerCategoryMeta(category).label;
}

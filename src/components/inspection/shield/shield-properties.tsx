'use client';

// =============================================================
// BOUCLIER V2 — MES BIENS (onglet 5/8).
// Liste des logements onboardés (API /api/shield/properties
// existante) : adresse, ville, référence d'onboarding, compteurs
// zones / appareils / sessions, dernière activité. FLUX A :
// bouton « Onboarder un bien » → wizard 3 étapes existant
// (/onboarding/wizard) ; « Bibliothèque » → onglet Bouclier.
// =============================================================
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Camera,
  Loader2,
  MapPin,
  Plus,
} from 'lucide-react';
import { fetchJson, formatDate, GhostButton, RedButton, ShieldCard } from './shield-ui';

interface ShieldPropertyRow {
  id: string;
  propertyName: string;
  propertyAddress: string;
  city: string;
  ownerName: string;
  onboardingRef: string;
  onboardedAt: string;
  /** Format APLATI de l'API existante (/api/shield/properties). */
  devicesCount: number;
  zonesCount: number;
  sessionsCount: number;
  lastSessionAt: string | null;
}

interface PropertiesResponse {
  properties: ShieldPropertyRow[];
  subscription?: { plan: string; status: string; endDate: string } | null;
}

export function ShieldProperties() {
  const [data, setData] = useState<PropertiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<PropertiesResponse>('/api/shield/properties')
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Mes biens</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data === null ? 'Chargement…' : `${data.properties.length} logement${data.properties.length > 1 ? 's' : ''} sous protection Bouclier`}
          </p>
        </div>
        <a href="/onboarding/wizard">
          <RedButton>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Onboarder un bien
          </RedButton>
        </a>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {data === null ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a]" aria-label="Chargement" />
        </div>
      ) : data.properties.length === 0 ? (
        <ShieldCard className="p-8 text-center sm:p-12">
          <Building2 className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Aucun bien onboardé</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            L'onboarding (FLUX A) se fait une seule fois : type de logement, pièces et
            équipements réels, photos de référence. Ensuite chaque check-in / check-out
            compare automatiquement avec cette bibliothèque.
          </p>
          <a href="/onboarding/wizard" className="mt-5 inline-block">
            <RedButton>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Commencer l'onboarding (5 min)
            </RedButton>
          </a>
        </ShieldCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.properties.map((p) => {
            const last = p.lastSessionAt;
            return (
              <ShieldCard key={p.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1e3a8a]/10 text-[#1e3a8a]"
                  >
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-500">
                    {p.onboardingRef}
                  </span>
                </div>
                <h2 className="mt-3 text-base font-bold tracking-tight text-slate-900">{p.propertyName}</h2>
                <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {p.propertyAddress}, {p.city}
                  </span>
                </p>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 px-2 py-2.5">
                    <dt className="text-[11px] font-medium text-slate-500">Zones</dt>
                    <dd className="text-lg font-bold text-slate-900">{p.zonesCount}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2.5">
                    <dt className="text-[11px] font-medium text-slate-500">Appareils</dt>
                    <dd className="text-lg font-bold text-slate-900">{p.devicesCount}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2.5">
                    <dt className="text-[11px] font-medium text-slate-500">Sessions</dt>
                    <dd className="text-lg font-bold text-slate-900">{p.sessionsCount}</dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-slate-400">
                  Onboardé le {formatDate(p.onboardedAt)}
                  {last ? ` · Dernière session le ${formatDate(last)}` : ' · Aucune session encore'}
                </p>

                <div className="mt-auto flex items-center gap-2 pt-4">
                  <Link href={`/inspection/bouclier?property=${p.id}`} className="flex-1">
                    <GhostButton className="w-full">
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      Bibliothèque
                    </GhostButton>
                  </Link>
                  <Link href="/inspection/menage" className="flex-1">
                    <RedButton className="w-full">
                      Nouveau séjour
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </RedButton>
                  </Link>
                </div>
              </ShieldCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

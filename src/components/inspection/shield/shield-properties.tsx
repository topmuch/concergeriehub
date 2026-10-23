'use client';

// =============================================================
// BOUCLIER V2 — MES BIENS (onglet 5/8).
// v4.167 (Problèmes 1 & 2) : badge de statut du bien en haut à
// droite (« Protégé » / « Onboarding partiel »), icônes Lucide sur
// les 3 compteurs et ligne « Prochain séjour » (1er A_VENIR).
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
  CalendarClock,
  Camera,
  ClipboardList,
  DoorOpen,
  Loader2,
  MapPin,
  Plug,
  Plus,
} from 'lucide-react';
import { fetchJson, formatDate, formatDateTime, GhostButton, RedButton, ShieldCard } from './shield-ui';

interface ShieldPropertyRow {
  id: string;
  propertyName: string;
  propertyAddress: string;
  city: string;
  ownerName: string;
  onboardingRef: string;
  onboardedAt: string;
  /** v4.167 — COMPLETED = bibliothèque verrouillée · PENDING_PHOTOS = en attente des photos de référence. */
  onboardingStatus: 'COMPLETED' | 'PENDING_PHOTOS';
  /** Format APLATI de l'API existante (/api/shield/properties). */
  devicesCount: number;
  zonesCount: number;
  sessionsCount: number;
  lastSessionAt: string | null;
  /** v4.167 — 1er séjour planifié du bien (check-in ou check-out). */
  nextVisit: {
    type: 'CHECK_IN' | 'CHECK_OUT';
    guestName: string | null;
    scheduledDate: string;
  } | null;
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
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="luxe-tile bg-gradient-to-br from-[#055492] to-[#2f6fed] text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="luxe-header-title">Mes biens</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {data === null ? 'Chargement…' : `${data.properties.length} logement${data.properties.length > 1 ? 's' : ''} sous protection Inventaire`}
            </p>
          </div>
        </div>
        <a href="/onboarding/wizard">
          <RedButton>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Onboarder un bien
          </RedButton>
        </a>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {data === null ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#055492] dark:text-[#1173c7]" aria-label="Chargement" />
        </div>
      ) : data.properties.length === 0 ? (
        <ShieldCard className="p-8 text-center sm:p-12">
          <Building2 className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Aucun bien onboardé</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
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
            const isProtected = p.onboardingStatus === 'COMPLETED';
            return (
              <ShieldCard key={p.id} className="flex flex-col p-5 transition-shadow hover:shadow-lg">
                {/* ── En-tête : icône bien + badge de statut (v4.167, Problème 1) ── */}
                <div className="flex items-start justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#055492] to-[#2f6fed] text-white shadow-md"
                  >
                    <Building2 className="h-5 w-5" />
                  </span>
                  {isProtected ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Protégé
                    </span>
                  ) : (
                    <span
                      title="En attente des photos de référence de l'équipe"
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300"
                    >
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      Onboarding partiel
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">{p.propertyName}</h2>
                <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {p.propertyAddress}, {p.city}
                  </span>
                </p>

                {/* ── Compteurs avec icônes (v4.167, Problème 2) ── */}
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 px-2 py-2.5 dark:bg-[#091024]">
                    <dt className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <DoorOpen className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      Zones
                    </dt>
                    <dd className="text-lg font-bold text-slate-900 dark:text-white">{p.zonesCount}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2.5 dark:bg-[#091024]">
                    <dt className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <Plug className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      Appareils
                    </dt>
                    <dd className="text-lg font-bold text-slate-900 dark:text-white">{p.devicesCount}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2.5 dark:bg-[#091024]">
                    <dt className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <ClipboardList className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      Sessions
                    </dt>
                    <dd className="text-lg font-bold text-slate-900 dark:text-white">{p.sessionsCount}</dd>
                  </div>
                </dl>

                {/* ── Prochain séjour planifié (v4.167) ── */}
                {p.nextVisit && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-[#dceaf5] bg-[#f0f7fc]/60 px-3 py-2 text-xs text-slate-600 dark:border-[#2f6fed]/30 dark:bg-[#2f6fed]/10 dark:text-slate-300">
                    <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#055492] dark:text-[#8fb8dc]" aria-hidden="true" />
                    <span>
                      Prochain {p.nextVisit.type === 'CHECK_IN' ? 'check-in' : 'check-out'} :{' '}
                      {p.nextVisit.guestName ?? 'Invité'} — {formatDateTime(p.nextVisit.scheduledDate)}
                    </span>
                  </p>
                )}

                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                  <span>
                    Onboardé le {formatDate(p.onboardedAt)}
                    {last ? ` · Dernière session le ${formatDate(last)}` : ' · Aucune session encore'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-[#22305a] dark:text-slate-300">
                    {p.onboardingRef}
                  </span>
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

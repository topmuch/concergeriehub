'use client';

// =============================================================
// BOUCLIER V2 — BOUCLIER (onglet 7/8) : la « Bibliothèque de
// Référence » (master prompt §3) — photos des zones fantômes et
// des appareils VERROUILLÉES lors de l'onboarding, réutilisées à
// chaque check-in / check-out (mode fantôme + comparaison).
// Données : /api/shield/properties/[id] (zones + devices + hash).
// =============================================================
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Fingerprint,
  Loader2,
  Lock,
  ShieldCheck,
  Tv,
} from 'lucide-react';
import {
  fetchJson,
  formatDate,
  GhostButton,
  ShieldCard,
} from './shield-ui';

interface PropertyLight {
  id: string;
  propertyName: string;
  city: string;
  onboardingRef: string;
}

interface Detail {
  property: { id: string; propertyName: string; propertyAddress: string; city: string; onboardingRef: string; onboardedAt: string };
  zones: { id: string; name: string; referencePhoto: string; sortOrder: number }[];
  devices: {
    id: string;
    name: string;
    kind: string;
    referenceCode: string;
    referenceHash: string;
    referencePhoto: string;
    referenceDate: string;
  }[];
}

export function ShieldLibrary({ initialPropertyId }: { initialPropertyId?: string }) {
  const [list, setList] = useState<PropertyLight[] | null>(null);
  const [selected, setSelected] = useState<string>(initialPropertyId ?? '');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<{ properties: PropertyLight[] }>('/api/shield/properties')
      .then((d) => {
        setList(d.properties);
        if (!initialPropertyId && d.properties.length > 0) setSelected(d.properties[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, [initialPropertyId]);

  // Détail du bien sélectionné — le loader s'affiche tant que le
  // détail rendu ne correspond PAS au bien sélectionné (aucun
  // setState synchrone dans l'effet, garde anti-course d'appels).
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    fetchJson<Detail>(`/api/shield/properties/${selected}`)
      .then((d) => {
        if (alive) {
          setDetail(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Bouclier
            <span className="inline-flex items-center gap-1 rounded-full bg-[#1e3a8a]/10 px-2.5 py-1 text-xs font-semibold text-[#1e3a8a]">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Bibliothèque verrouillée
            </span>
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Photos de référence capturées à l'onboarding — angles fantômes et appareils re-photographiés à chaque séjour.
          </p>
        </div>
        {list && list.length > 0 && (
          <label className="w-full sm:w-72">
            <span className="sr-only">Choisir un bien</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#1e3a8a] focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 dark:border-slate-200 dark:bg-white dark:text-slate-900"
            >
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.propertyName} · {p.city}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {list === null ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a]" aria-label="Chargement" />
        </div>
      ) : list.length === 0 ? (
        <ShieldCard className="p-8 text-center sm:p-12">
          <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Aucune bibliothèque</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            La bibliothèque de référence se crée pendant l'onboarding d'un bien
            (1 photo par pièce, 1 photo par appareil, hash SHA-256 d'intégrité).
          </p>
          <a href="/onboarding/wizard" className="mt-5 inline-block">
            <GhostButton>Onboarder un bien</GhostButton>
          </a>
        </ShieldCard>
      ) : detail === null || detail.property.id !== selected ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a]" aria-label="Chargement" />
        </div>
      ) : (
        <>
          {/* ── Zones fantômes ── */}
          <section aria-label="Zones de référence">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Zones fantômes ({detail.zones.length}) — angles de référence
            </h2>
            {detail.zones.length === 0 ? (
              <ShieldCard className="p-6 text-center text-sm text-slate-500">
                Aucune zone — cet onboarding n'a capturé que des appareils.
              </ShieldCard>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {detail.zones.map((z) => (
                  <ShieldCard key={z.id} className="overflow-hidden">
                    <div className="relative aspect-[4/3] bg-slate-100">
                      <img
                        src={z.referencePhoto}
                        alt={`Référence ${z.name}`}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#1e3a8a]/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                        Référence
                      </span>
                    </div>
                    <p className="px-3 py-2 text-xs font-semibold text-slate-800">{z.name}</p>
                  </ShieldCard>
                ))}
              </div>
            )}
          </section>

          {/* ── Appareils (hash + code) ── */}
          <section aria-label="Appareils de référence">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Appareils photographiés ({detail.devices.length}) — hash d'intégrité
            </h2>
            {detail.devices.length === 0 ? (
              <ShieldCard className="p-6 text-center text-sm text-slate-500">
                Aucun appareil dans la bibliothèque de ce bien.
              </ShieldCard>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {detail.devices.map((d) => (
                  <ShieldCard key={d.id} className="flex gap-3 p-4">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      <img
                        src={d.referencePhoto}
                        alt={`Référence ${d.name}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        <Tv className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {d.name}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-[#C41E3A]">
                        <Fingerprint className="h-3 w-3" aria-hidden="true" />
                        {d.referenceCode}
                      </p>
                      <p className="mt-1 break-all font-mono text-[10px] leading-tight text-slate-400">
                        SHA-256 {d.referenceHash.slice(0, 24)}…
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Réf. du {formatDate(d.referenceDate)}
                      </p>
                    </div>
                  </ShieldCard>
                ))}
              </div>
            )}
          </section>

          {/* ── Légal ── */}
          <ShieldCard className="p-4 text-xs leading-relaxed text-slate-500">
            <p className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <span>
                <strong className="text-slate-700">{detail.property.propertyName}</strong> —{' '}
                {detail.property.propertyAddress}, {detail.property.city} · Bibliothèque{' '}
                {detail.property.onboardingRef} créée le {formatDate(detail.property.onboardedAt)}.
                Mentions légales PDF : « Photo de référence du jour de capture — réutilisée et
                re-validée par l'agent lors de chaque session (vidéo walkthrough hachée SHA-256) ».
              </span>
            </p>
          </ShieldCard>
        </>
      )}
    </div>
  );
}

'use client';

// =============================================================
// BOUCLIER V2 — Page « Badges de confiance » (v4.160, onglet
// sous FAQ dans la sidebar). Liste les logements onboardés de
// l'abonnement (GET /api/shield/properties) ; un clic ouvre la
// modal MarketingBadgesModal (3 badges Sécurité / Propreté /
// Technologie) : export PNG HD (html2canvas scale 3) + code HTML
// autonome, QR de vérification pointant /verify/<id logement>.
// v4.159 a étendu la page publique /verify aux IDs ShieldProperty
// → les badges fonctionnent pour TOUS les biens du Bouclier.
// Un seul logement → la modal s'ouvre directement à l'arrivée.
// =============================================================
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Award, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { MarketingBadgesModal } from '@/components/airbnb/host/marketing-badges-modal';
import { fetchJson, ShieldCard } from './shield-ui';

interface ShieldPropertyLite {
  id: string;
  propertyName: string;
  propertyAddress: string;
  city: string;
  onboardingRef: string;
}

const BADGE_LEGEND = [
  { label: 'Sécurité', detail: '« Caution protégée par RoomScan » — bleu', dot: '#1e3a8a' },
  { label: 'Propreté', detail: '« Ménage certifié & photographié » — vert', dot: '#16a34a' },
  { label: 'Technologie', detail: '« État des lieux vidéo & hash SHA256 » — rouge', dot: '#C41E3A' },
] as const;

export function ShieldBadgesContent() {
  const [properties, setProperties] = useState<ShieldPropertyLite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<ShieldPropertyLite | null>(null);

  useEffect(() => {
    fetchJson<{ properties: ShieldPropertyLite[] }>('/api/shield/properties')
      .then((d) => {
        const list = d.properties ?? [];
        setProperties(list);
        // Un seul logement onboardé → ouverture directe de la modal.
        if (list.length === 1) setTarget(list[0]);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* ── En-tête ── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C41E3A]">Marketing</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Badges de confiance
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Affichez vos badges sur vos annonces, votre site ou vos réseaux — chaque visiteur peut
          scanner le QR pour vérifier votre logement.
        </p>
      </div>

      {/* ── Légende des 3 badges ── */}
      <ShieldCard className="p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-900">Les 3 badges disponibles</p>
        <ul className="mt-3 space-y-2">
          {BADGE_LEGEND.map((b) => (
            <li key={b.label} className="flex items-center gap-2.5 text-sm text-slate-600">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: b.dot }}
              />
              <span className="font-semibold text-slate-800">{b.label}</span>
              <span aria-hidden="true">—</span>
              <span className="min-w-0">{b.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Chaque badge se télécharge en <strong>PNG haute définition</strong> et en{' '}
          <strong>code HTML</strong> prêt à coller (styles inclus, autonome).
        </p>
      </ShieldCard>

      {/* ── Erreur API ── */}
      {error && (
        <ShieldCard className="flex items-center gap-3 p-4 text-sm text-red-700" role="alert">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {error}
        </ShieldCard>
      )}

      {/* ── Chargement ── */}
      {!properties && !error && (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a] dark:text-[#3b82f6]" aria-label="Chargement" />
        </div>
      )}

      {/* ── Aucun logement → repiquer vers l'onboarding ── */}
      {properties && properties.length === 0 && (
        <ShieldCard className="p-8 text-center">
          <Award className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <p className="mt-3 text-sm text-slate-600">
            Onboarder votre premier bien pour générer vos badges de confiance.
          </p>
          <Link
            href="/inspection/biens"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#C41E3A] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#a01830]"
          >
            Onboarder un bien
          </Link>
        </ShieldCard>
      )}

      {/* ── Sélecteur de logement (2+) ── */}
      {properties && properties.length > 1 && (
        <section aria-label="Choisir le logement">
          <p className="mb-2 text-sm font-semibold text-slate-900">
            Choisir le logement ({properties.length})
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {properties.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setTarget(p)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm dark:bg-[#0d1530]/90 dark:border-[#22305a] transition-colors hover:border-[#C41E3A]/40 hover:bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E3A]"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#C41E3A]/10 text-[#C41E3A]"
                  >
                    <Award className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {p.propertyName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {p.city} · {p.onboardingRef}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="ml-auto size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Aide contextuelle (sous le sélecteur) ── */}
      {properties && properties.length > 1 && (
        <ShieldCard className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1e3a8a]" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-slate-500">
            Le QR de chaque badge affiche la page publique de vérification du logement : statut
            Inventaire, référence d&apos;onboarding et derniers contrôles photo/vidéo — aucune donnée
            sensible (adresse exacte, coordonnées) n&apos;est jamais exposée.
          </p>
        </ShieldCard>
      )}

      {/* ── Modal badges (PNG HD + HTML, QR /verify) ── */}
      <MarketingBadgesModal
        propertyId={target?.id ?? ''}
        propertyName={target?.propertyName ?? ''}
        open={target !== null}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

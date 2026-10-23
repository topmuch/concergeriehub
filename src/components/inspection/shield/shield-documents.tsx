'use client';

// =============================================================
// BOUCLIER V2 — DOCUMENTS (onglet 6/8).
// v4.167 (Problèmes 6, 7, 8) : barre de recherche + filtres
// (type / bien / mois), date de création complète « Généré le… »
// et badges Anomalie / Caution sécurisée sur les rapports.
// Archive de tous les PDF générés (master prompt §4) :
//   · Certificats d'ONBOARDING par bien (bibliothèque verrouillée)
//     → /api/shield/pdf/onboarding/[id] ;
//   · Rapports de SESSION certifiés (check-in / check-out)
//     → /api/shield/pdf/session/[id].
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  FileDown,
  FileText,
  Loader2,
  LogIn,
  LogOut,
  Search,
  SearchX,
} from 'lucide-react';
import {
  AnomalyBadge,
  DepositChip,
  fetchJson,
  formatDate,
  formatDateTimeFull,
  GhostButton,
  ShieldCard,
} from './shield-ui';

interface PropertyRow {
  id: string;
  propertyName: string;
  city: string;
  onboardingRef: string;
  onboardedAt: string;
}

interface SessionRow {
  id: string;
  type: 'CHECK_IN' | 'CHECK_OUT';
  guestName: string | null;
  completedAt: string;
  sessionRef: string;
  /** v4.167 — nb de zones « À nettoyer » / « Dégradation » du rapport. */
  anomalies: number;
  /** v4.167 — caution sécurisée (null si non applicable). */
  depositAmount: number | null;
  property: { id: string; propertyName: string };
}

type TypeFilter = 'TOUS' | 'CHECK_IN' | 'CHECK_OUT' | 'ONB';

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'TOUS', label: 'Tous' },
  { value: 'CHECK_IN', label: 'Check-in' },
  { value: 'CHECK_OUT', label: 'Check-out' },
  { value: 'ONB', label: 'ONB' },
];

/** Design system « Luxe Bleuté » — recherche + filtres (v5.0). */
const searchClass = 'luxe-input w-full pl-9 pr-3';

/** Même style que les selects de shield-visits.tsx (v5.0). */
const selectClass = 'luxe-select px-3 pr-8';

/** Clé de mois « YYYY-MM » (completedAt des rapports / onboardedAt des certificats). */
function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** « 2026-10 » → « octobre 2026 ». */
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export function ShieldDocuments() {
  const [properties, setProperties] = useState<PropertyRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ── Filtres (v4.167, Problèmes 6 & 7) ──
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('TOUS');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  useEffect(() => {
    fetchJson<{ properties: PropertyRow[] }>('/api/shield/properties')
      .then((d) => setProperties(d.properties))
      .catch((e: Error) => setError(e.message));
    fetchJson<{ sessions: SessionRow[] }>('/api/shield/sessions?status=TERMINE&take=100')
      .then((d) => setSessions(d.sessions))
      .catch((e: Error) => setError(e.message));
  }, []);

  const resetFilters = () => {
    setQuery('');
    setTypeFilter('TOUS');
    setPropertyFilter('');
    setMonthFilter('');
  };

  /** Mois présents dans les données (certificats + rapports), du plus récent, max 12. */
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    if (properties) for (const p of properties) set.add(monthKey(p.onboardedAt));
    if (sessions) for (const s of sessions) set.add(monthKey(s.completedAt));
    return Array.from(set).sort((a, b) => b.localeCompare(a)).slice(0, 12);
  }, [properties, sessions]);

  const certificates = useMemo(() => {
    if (!properties) return [];
    const q = query.trim().toLowerCase();
    return properties.filter((p) => {
      if (q && !p.propertyName.toLowerCase().includes(q) && !p.onboardingRef.toLowerCase().includes(q)) return false;
      if (propertyFilter && p.id !== propertyFilter) return false;
      if (monthFilter && monthKey(p.onboardedAt) !== monthFilter) return false;
      return true;
    });
  }, [properties, query, propertyFilter, monthFilter]);

  const reports = useMemo(() => {
    if (!sessions) return [];
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (typeFilter === 'CHECK_IN' && s.type !== 'CHECK_IN') return false;
      if (typeFilter === 'CHECK_OUT' && s.type !== 'CHECK_OUT') return false;
      if (
        q &&
        !(s.guestName ?? '').toLowerCase().includes(q) &&
        !s.property.propertyName.toLowerCase().includes(q) &&
        !s.sessionRef.toLowerCase().includes(q)
      )
        return false;
      if (propertyFilter && s.property.id !== propertyFilter) return false;
      if (monthFilter && monthKey(s.completedAt) !== monthFilter) return false;
      return true;
    });
  }, [sessions, typeFilter, query, propertyFilter, monthFilter]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      </div>
    );
  }

  const loading = properties === null || sessions === null;
  const hasActiveFilters = query.trim() !== '' || typeFilter !== 'TOUS' || propertyFilter !== '' || monthFilter !== '';
  // Sémantique du filtre type : ONB → uniquement les certificats ;
  // CHECK_IN / CHECK_OUT → uniquement la section rapports filtrée.
  const showCertificates = typeFilter === 'TOUS' || typeFilter === 'ONB';
  const showReports = typeFilter === 'TOUS' || typeFilter === 'CHECK_IN' || typeFilter === 'CHECK_OUT';
  const noneVisible = (!showCertificates || certificates.length === 0) && (!showReports || reports.length === 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="luxe-header-title">Documents</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Archive de tous vos PDF certifiés — certificats d'onboarding et rapports de séjour.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#055492] dark:text-[#1173c7]" aria-label="Chargement" />
        </div>
      ) : (
        <>
          {/* ── Barre de recherche + filtres (v4.167, Problèmes 6 & 7) ── */}
          <ShieldCard className="space-y-3 p-4">
            <label htmlFor="doc-search" className="relative block w-full sm:max-w-sm">
              <span className="sr-only">Rechercher un document</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="doc-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Invité, bien, référence…"
                className={searchClass}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Filtrer par type de document" className="flex flex-wrap items-center gap-2">
                {TYPE_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setTypeFilter(f.value)}
                    aria-pressed={typeFilter === f.value}
                    className="luxe-chip"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2 sm:flex-none">
                <label htmlFor="doc-property" className="sr-only">
                  Filtrer par bien
                </label>
                <select
                  id="doc-property"
                  value={propertyFilter}
                  onChange={(e) => setPropertyFilter(e.target.value)}
                  className={`${selectClass} min-w-[9.5rem] flex-1 sm:flex-none`}
                >
                  <option value="">Tous les biens</option>
                  {properties!.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.propertyName} · {p.city}
                    </option>
                  ))}
                </select>
                <label htmlFor="doc-month" className="sr-only">
                  Filtrer par mois
                </label>
                <select
                  id="doc-month"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className={`${selectClass} min-w-[9.5rem] flex-1 sm:flex-none`}
                >
                  <option value="">Tous les mois</option>
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </ShieldCard>

          {noneVisible ? (
            /* ── 0 résultat avec filtres actifs (v4.167) ── */
            <ShieldCard className="p-6 text-center sm:p-8">
              <SearchX className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                Aucun document ne correspond à vos filtres.
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Élargissez la recherche, le type, le bien ou le mois pour retrouver un document.
              </p>
              <GhostButton className="mt-4" onClick={resetFilters}>
                Réinitialiser
              </GhostButton>
            </ShieldCard>
          ) : (
            <>
              {/* ── Certificats d'onboarding ── */}
              {showCertificates && (
                <section aria-label="Certificats d'onboarding">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Certificats d'onboarding ({certificates.length})
                  </h2>
                  {certificates.length === 0 ? (
                    <ShieldCard className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      {hasActiveFilters
                        ? 'Aucun certificat ne correspond à vos filtres.'
                        : 'Aucun certificat — onboarder un bien pour générer le premier.'}
                    </ShieldCard>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {certificates.map((p) => (
                        <ShieldCard key={p.id} className="flex items-center gap-3 p-4 transition-shadow hover:shadow-lg">
                          <span
                            aria-hidden="true"
                            className="luxe-tile bg-gradient-to-br from-[#055492] to-[#2f6fed] text-white"
                          >
                            <Building2 className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{p.propertyName}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {p.onboardingRef} · onboardé le {formatDate(p.onboardedAt)}
                            </p>
                          </div>
                          <a
                            href={`/api/shield/pdf/onboarding/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Ouvrir le PDF du certificat d'onboarding de ${p.propertyName}`}
                          >
                            <GhostButton>
                              <FileDown className="h-4 w-4" aria-hidden="true" />
                              PDF
                            </GhostButton>
                          </a>
                        </ShieldCard>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Rapports de séjour ── */}
              {showReports && (
                <section aria-label="Rapports de séjour">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Rapports de séjour ({reports.length})
                  </h2>
                  {reports.length === 0 ? (
                    <ShieldCard className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      {hasActiveFilters
                        ? 'Aucun rapport ne correspond à vos filtres.'
                        : 'Aucun rapport — les PDF apparaissent dès le premier check-in / check-out validé.'}
                    </ShieldCard>
                  ) : (
                    <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1 shield-scrollbar">
                      {reports.map((s) => (
                        <ShieldCard key={s.id} className="flex flex-wrap items-center gap-3 p-4 transition-shadow hover:shadow-lg">
                          <span
                            aria-hidden="true"
                            className={`luxe-tile ${
                              s.type === 'CHECK_IN'
                                ? 'bg-gradient-to-br from-[#2f6fed] to-[#04467a] text-white'
                                : 'bg-gradient-to-br from-[#ef2f5b] to-[#C41E3A] text-white'
                            }`}
                          >
                            {s.type === 'CHECK_IN' ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {s.type === 'CHECK_IN' ? 'Check-in' : 'Check-out'} — {s.guestName ?? 'Invité'}
                            </p>
                            {/* v4.167, Problème 8 — date de création complète */}
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {s.property.propertyName} · Généré le {formatDateTimeFull(s.completedAt)} ·{' '}
                              <span className="font-mono">{s.sessionRef}</span>
                            </p>
                            {(s.anomalies > 0 || s.depositAmount != null) && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <AnomalyBadge count={s.anomalies} />
                                <DepositChip amount={s.depositAmount} />
                              </div>
                            )}
                          </div>
                          <a
                            href={`/api/shield/pdf/session/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Ouvrir le PDF du rapport de séjour ${s.sessionRef}`}
                          >
                            <GhostButton>
                              <FileText className="h-4 w-4" aria-hidden="true" />
                              Ouvrir le PDF
                            </GhostButton>
                          </a>
                        </ShieldCard>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { cn } from '@/lib/utils';

// =============================================================
// CoachContent — PHASE 4 « COACH ROOMSCAN » (v5.5)
// Page dédiée /airbnb/dashboard/coach — trois onglets :
//   1. Recommandations : actives (actions Traité / Passer) +
//      historique 90 j (includeResolved) avec filtres type/statut.
//   2. Analytics : impact mensuel (CoachAnalytics 12 mois) —
//      joyaux KPI + graphique recharts généré vs traité.
//   3. Préférences : canaux de notification, briefing email
//      (fréquence + heure), types d'insights suivis.
// Design « SAPHIR LUXE » — ZÉRO icône, typographie et points.
// =============================================================

interface InsightRow {
  id: string;
  propertyId: string;
  type: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  title: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
  isResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  expiresAt: string | null;
}

interface MonthBucket {
  year: number;
  month: number;
  label: string;
  insightsGenerated: number;
  insightsResolved: number;
  insightsDismissed: number;
  estimatedRevenue: number;
  disputesAvoided: number;
  adoptionRate: number;
}

interface Preferences {
  enableCriticalPush: boolean;
  enableCriticalEmail: boolean;
  enableCriticalSMS: boolean;
  enableRevenueEmail: boolean;
  enableRevenuePush: boolean;
  enableQualityEmail: boolean;
  enableQualityDashboard: boolean;
  enableEducational: boolean;
  reportFrequency: string;
  reportTime: string;
  enabledInsightTypes: string[];
}

const PRIORITY_META: Record<InsightRow['priority'], { label: string; dot: string; ink: string }> = {
  CRITICAL: { label: 'Urgent', dot: '#f07d6a', ink: 'text-[#ffab92]' },
  HIGH: { label: 'Important', dot: '#e9c47c', ink: 'text-[#e9c47c]' },
  MEDIUM: { label: 'À noter', dot: '#5c8af0', ink: 'text-[#a9c4ff]' },
  LOW: { label: 'Info', dot: '#8fa0c2', ink: 'text-[#8fa0c2]' },
};

const TYPE_LABELS: Record<string, string> = {
  STOCK: 'Stock',
  REVENUE: 'Revenu',
  REVIEW: 'Avis',
  UPSELL: 'Upsell',
  OPERATION: 'Opération',
  QUALITY: 'Qualité',
  BEHAVIOR: 'Comportement',
};
const ALL_TYPES = Object.keys(TYPE_LABELS);

const STATUS_FILTERS = [
  { key: 'active', label: 'Actives' },
  { key: 'history', label: 'Historique' },
  { key: 'all', label: 'Tout' },
] as const;

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtDateTime = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const DEFAULT_PREFS: Preferences = {
  enableCriticalPush: true,
  enableCriticalEmail: true,
  enableCriticalSMS: false,
  enableRevenueEmail: true,
  enableRevenuePush: false,
  enableQualityEmail: true,
  enableQualityDashboard: true,
  enableEducational: true,
  reportFrequency: 'daily',
  reportTime: '07:00',
  enabledInsightTypes: [...ALL_TYPES],
};

export function CoachContent() {
  const { selectedId, selectedProperty, properties, propertiesLoading } = useHostContext();

  const [tab, setTab] = useState<'insights' | 'analytics' | 'preferences'>('insights');

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- En-tête ---------- */}
      <header className="lux-card p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="lux-eyebrow">Coach Roomscan · Assistant IA</p>
            <h1 className="lux-display mt-1 text-2xl font-semibold text-white sm:text-3xl">
              Votre coach IA
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8fa0c2]">
              {selectedProperty ? (
                <>
                  L&apos;assistant surveille{' '}
                  <span className="font-semibold text-white">{selectedProperty.name}</span> et
                  apprend de chaque séjour : urgences, opportunités de revenu, qualité perçue.
                </>
              ) : (
                <>
                  L&apos;assistant surveille tous vos biens et apprend de chaque séjour : urgences,
                  opportunités de revenu, qualité perçue.
                </>
              )}
            </p>
          </div>
          <Link
            href="/airbnb/dashboard"
            className="lux-btn-ghost h-9 shrink-0 px-4 text-xs"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </header>

      {/* ---------- Onglets ---------- */}
      <div
        className="flex w-full max-w-xl rounded-full border border-white/10 bg-white/[0.04] p-1"
        role="tablist"
        aria-label="Sections du Coach"
      >
        {(
          [
            { key: 'insights', label: 'Recommandations' },
            { key: 'analytics', label: 'Analytics' },
            { key: 'preferences', label: 'Préférences' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'min-h-[38px] flex-1 rounded-full px-4 text-xs font-semibold transition-colors',
              tab === t.key
                ? 'bg-white/10 text-white ring-1 ring-[#5c8af0]/35'
                : 'text-[#8fa0c2] hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'insights' && (
        <InsightsTab selectedId={selectedId} properties={properties} propertiesLoading={propertiesLoading} />
      )}
      {tab === 'analytics' && (
        <AnalyticsTab selectedId={selectedId} propertiesLoading={propertiesLoading} />
      )}
      {tab === 'preferences' && <PreferencesTab />}
    </div>
  );
}

// =============================================================
// ONGLET 1 — RECOMMANDATIONS (actives + historique)
// =============================================================

function InsightsTab({
  selectedId,
  properties,
  propertiesLoading,
}: {
  selectedId: string;
  properties: { id: string; name: string }[];
  propertiesLoading: boolean;
}) {
  const [active, setActive] = useState<InsightRow[]>([]);
  const [history, setHistory] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'history' | 'all'>('active');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/airbnb/insights?propertyId=${encodeURIComponent(selectedId)}&includeResolved=1`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { insights?: InsightRow[]; resolvedHistory?: InsightRow[] };
      setActive(json.insights ?? []);
      setHistory(json.resolvedHistory ?? []);
    } catch {
      setActive([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (propertiesLoading) return;
    void load();
  }, [propertiesLoading, load]);

  async function act(id: string, action: 'RESOLVED' | 'DISMISSED') {
    setBusyId(id);
    const previousActive = active;
    setActive((rows) => rows.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/airbnb/insights/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(action === 'RESOLVED' ? 'Marqué comme traité' : 'Recommandation passée');
      // L'insight rejoint l'historique (rechargement discret).
      void load();
    } catch {
      setActive(previousActive);
      toast.error("L'action n'a pas pu être enregistrée");
    } finally {
      setBusyId(null);
    }
  }

  function trackClick(id: string) {
    void fetch(`/api/airbnb/insights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'CLICKED' }),
    }).catch(() => undefined);
  }

  const propertyNameOf = (id: string) => properties.find((p) => p.id === id)?.name ?? null;

  const typeMatches = (rows: InsightRow[]) =>
    typeFilter === 'ALL' ? rows : rows.filter((r) => r.type === typeFilter);

  const activeShown = useMemo(() => typeMatches(active), [active, typeFilter]);
  const historyShown = useMemo(() => typeMatches(history), [history, typeFilter]);
  const showActive = status !== 'history';
  const showHistory = status !== 'active';

  return (
    <div className="flex flex-col gap-4">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex rounded-full border border-white/10 bg-white/[0.04] p-1"
          role="group"
          aria-label="Filtrer par statut"
        >
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={cn(
                'min-h-[34px] rounded-full px-4 text-[11px] font-semibold transition-colors',
                status === f.key ? 'bg-white/10 text-white' : 'text-[#8fa0c2] hover:text-white',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filtrer par type"
          className="h-10 rounded-full border border-white/12 bg-white/[0.04] px-4 text-xs text-white outline-none [&>option]:bg-[#0d1530]"
        >
          <option value="ALL">Tous les types</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="lux-btn-ghost ml-auto h-9 px-4 text-[11px] disabled:opacity-50"
        >
          Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-white/8 bg-white/[0.03] p-4"
              aria-hidden="true"
            >
              <div className="h-3.5 w-48 rounded bg-white/8" />
              <div className="mt-2.5 h-3 w-full rounded bg-white/6" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Actives */}
          {showActive && (
            <section aria-label="Recommandations actives" className="flex flex-col gap-2.5">
              <p className="lux-eyebrow">
                Actives · {activeShown.length}
              </p>
              {activeShown.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-8 text-center">
                  <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                  <p className="lux-display text-lg text-white">Tout est sous contrôle</p>
                  <p className="max-w-sm text-xs leading-relaxed text-[#8fa0c2]">
                    Aucune recommandation active pour ce filtre. Le coach vous préviendra dès qu&apos;une
                    urgence ou une opportunité se présentera.
                  </p>
                </div>
              ) : (
                activeShown.map((insight, i) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    index={i}
                    propertyName={propertyNameOf(insight.propertyId)}
                    busy={busyId === insight.id}
                    onAct={act}
                    onTrack={trackClick}
                  />
                ))
              )}
            </section>
          )}

          {/* Historique */}
          {showHistory && (
            <section aria-label="Historique des recommandations" className="flex flex-col gap-2.5">
              <p className="lux-eyebrow">Historique · 90 jours · {historyShown.length}</p>
              {historyShown.length === 0 ? (
                <div className="lux-empty rounded-2xl">
                  <p className="lux-display text-lg">Rien dans l&apos;historique</p>
                  <p className="mt-1 text-xs text-[#8fa0c2]">
                    Les recommandations traitées apparaîtront ici pendant 90 jours.
                  </p>
                </div>
              ) : (
                historyShown.map((insight, i) => (
                  <HistoryRow
                    key={insight.id}
                    insight={insight}
                    index={i}
                    propertyName={propertyNameOf(insight.propertyId)}
                  />
                ))
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Carte d'insight active — même langage visuel que le CoachWidget. */
function InsightCard({
  insight,
  index,
  propertyName,
  busy,
  onAct,
  onTrack,
}: {
  insight: InsightRow;
  index: number;
  propertyName: string | null;
  busy: boolean;
  onAct: (id: string, action: 'RESOLVED' | 'DISMISSED') => void;
  onTrack: (id: string) => void;
}) {
  const meta = PRIORITY_META[insight.priority] ?? PRIORITY_META.LOW;
  const critical = insight.priority === 'CRITICAL';
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 * index, duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border p-4 transition-colors',
        critical
          ? 'border-[#f07d6a]/30 bg-[#f07d6a]/[0.06]'
          : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="lux-dot shrink-0" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{insight.title}</p>
        <span className={cn('lux-chip shrink-0', meta.ink)}>{meta.label}</span>
        <span className="lux-chip shrink-0 text-[#8fa0c2]">{TYPE_LABELS[insight.type] ?? insight.type}</span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#8fa0c2]">{insight.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={insight.actionUrl}
          onClick={() => onTrack(insight.id)}
          className={cn(
            'inline-flex min-h-[36px] items-center rounded-full px-4 text-xs font-semibold transition-transform hover:-translate-y-px',
            critical
              ? 'bg-[#f07d6a]/15 text-[#ffab92] ring-1 ring-[#f07d6a]/35 hover:bg-[#f07d6a]/20'
              : 'lux-btn-gold h-9',
          )}
        >
          {insight.actionLabel} <span aria-hidden="true" className="ml-1.5">→</span>
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAct(insight.id, 'RESOLVED')}
          className="lux-btn-ghost h-8 px-3 text-[11px] disabled:opacity-50"
        >
          Traité
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAct(insight.id, 'DISMISSED')}
          className="h-8 px-2 text-[11px] font-medium text-[#8fa0c2] underline-offset-4 transition-colors hover:text-white hover:underline disabled:opacity-50"
        >
          Passer
        </button>
        {propertyName && (
          <span className="ml-auto hidden truncate text-[11px] text-[#8fa0c2]/70 sm:block">
            {propertyName}
          </span>
        )}
      </div>
    </motion.article>
  );
}

/** Ligne d'historique (traitée ou passée, 90 jours). */
function HistoryRow({
  insight,
  index,
  propertyName,
}: {
  insight: InsightRow;
  index: number;
  propertyName: string | null;
}) {
  const meta = PRIORITY_META[insight.priority] ?? PRIORITY_META.LOW;
  const closed = insight.resolvedAt ? new Date(insight.resolvedAt) : null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.02 * index, duration: 0.25 }}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3"
    >
      <span className="lux-dot shrink-0 opacity-60" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85">{insight.title}</p>
      <span className="lux-chip shrink-0 text-[#8fa0c2]">{TYPE_LABELS[insight.type] ?? insight.type}</span>
      {closed && (
        <span className="shrink-0 text-[11px] tabular-nums text-[#8fa0c2]/70">
          Clôturée le {fmtDate.format(closed)}
        </span>
      )}
      {propertyName && (
        <span className="hidden truncate text-[11px] text-[#8fa0c2]/60 sm:block">{propertyName}</span>
      )}
    </motion.div>
  );
}

// =============================================================
// ONGLET 2 — ANALYTICS (impact mensuel)
// =============================================================

function AnalyticsTab({
  selectedId,
  propertiesLoading,
}: {
  selectedId: string;
  propertiesLoading: boolean;
}) {
  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [summary, setSummary] = useState<{
    insightsGenerated: number;
    insightsResolved: number;
    insightsDismissed: number;
    estimatedRevenue: number;
    disputesAvoided: number;
    adoptionRate: number;
  } | null>(null);
  const [typeStats, setTypeStats] = useState<{ type: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (propertiesLoading) return;
    let cancelled = false;
    // setLoading initial = true (état de départ) — pas de setState
    // synchrone dans l'effet (règle react-hooks/set-state-in-effect).
    fetch('/api/airbnb/coach-analytics', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{
          months: MonthBucket[];
          summary: NonNullable<typeof summary>;
          typeStats: { type: string; count: number }[];
        }>;
      })
      .then((json) => {
        if (cancelled) return;
        setMonths(json.months ?? []);
        setSummary(json.summary ?? null);
        setTypeStats(json.typeStats ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setMonths([]);
          setSummary(null);
          setTypeStats([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertiesLoading, selectedId]);

  const chartData = months.map((m) => ({
    name: m.label,
    Générées: m.insightsGenerated,
    Traitées: m.insightsResolved,
  }));

  const maxType = typeStats[0]?.count ?? 1;

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <div className="h-3 w-24 rounded bg-white/8" />
              <div className="mt-3 h-8 w-16 rounded bg-white/8" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Joyaux KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiJewel
              eyebrow="Recommandations"
              value={String(summary?.insightsGenerated ?? 0)}
              hint="générées sur 12 mois"
              jewel="gold"
            />
            <KpiJewel
              eyebrow="Traitées"
              value={String(summary?.insightsResolved ?? 0)}
              hint={`vs ${summary?.insightsDismissed ?? 0} passées`}
              jewel="emerald"
            />
            <KpiJewel
              eyebrow="Taux d'adoption"
              value={`${Math.round((summary?.adoptionRate ?? 0) * 100)} %`}
              hint="traitées / clôturées"
              jewel="sapphire"
            />
            <KpiJewel
              eyebrow="Revenu estimé"
              value={`${(summary?.estimatedRevenue ?? 0).toFixed(0)} €`}
              hint={`${summary?.disputesAvoided ?? 0} litige${(summary?.disputesAvoided ?? 0) > 1 ? 's' : ''} évité${(summary?.disputesAvoided ?? 0) > 1 ? 's' : ''}`}
              jewel="violet"
            />
          </div>

          {/* Courbe 12 mois */}
          <section aria-label="Activité du coach sur 12 mois" className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Activité du coach</p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-white sm:text-xl">
              Recommandations générées et traitées — 12 mois
            </h2>
            <div className="mt-5 h-64 w-full">
              {chartData.some((d) => d.Générées > 0 || d.Traitées > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,170,214,0.14)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#8fa0c2', fontSize: 10.5 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#8fa0c2', fontSize: 10.5 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,170,214,0.06)' }}
                      contentStyle={{
                        background: '#0d1530',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12,
                        fontSize: 12,
                        color: '#ffffff',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#8fa0c2' }} />
                    <Bar dataKey="Générées" fill="#e9c47c" radius={[5, 5, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="Traitées" fill="#34d399" radius={[5, 5, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="lux-empty h-full rounded-2xl">
                  <p className="lux-display text-lg">Pas encore d&apos;historique</p>
                  <p className="mt-1 text-xs text-[#8fa0c2]">
                    Les compteurs se remplissent dès les premières recommandations du coach.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Répartition par type */}
          <section aria-label="Répartition par type" className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Ce que le coach voit</p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-white sm:text-xl">
              Répartition des détections — 90 jours
            </h2>
            {typeStats.length === 0 ? (
              <p className="mt-4 text-xs text-[#8fa0c2]">Aucune détection sur la période.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {typeStats.map((t) => (
                  <li key={t.type} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-[#8fa0c2]">
                      {TYPE_LABELS[t.type] ?? t.type}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/6">
                      <div
                        className="h-full rounded-full bg-[#5c8af0]/70"
                        style={{ width: `${Math.max(6, Math.round((t.count / maxType) * 100))}%` }}
                      />
                    </div>
                    <span className="lux-num w-8 shrink-0 text-right text-sm text-white">{t.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Joyau KPI (palette saphir, sans icône). */
function KpiJewel({
  eyebrow,
  value,
  hint,
  jewel,
}: {
  eyebrow: string;
  value: string;
  hint: string;
  jewel: 'gold' | 'emerald' | 'sapphire' | 'violet';
}) {
  return (
    <div className={cn('luxkpi rounded-2xl p-5', `luxkpi-${jewel}`)}>
      <p className="lux-eyebrow !text-[9.5px]">{eyebrow}</p>
      <p className="lux-num mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] opacity-75">{hint}</p>
    </div>
  );
}

// =============================================================
// ONGLET 3 — PRÉFÉRENCES
// =============================================================

function PreferencesTab() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/airbnb/coach-preferences', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: { preferences: Preferences }) => {
        if (!cancelled) setPrefs({ ...DEFAULT_PREFS, ...json.preferences });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/airbnb/coach-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Préférences enregistrées');
    } catch {
      toast.error("Les préférences n'ont pas pu être enregistrées");
    } finally {
      setSaving(false);
    }
  }

  const toggle = (key: keyof Preferences) => () =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const dirty = useMemo(() => {
    // Simple indicateur : toujours permis de sauvegarder.
    return true;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="lux-card p-6" aria-busy="true">
          <div className="h-3 w-40 rounded bg-white/8" />
          <div className="mt-4 h-10 w-full rounded bg-white/6" />
          <div className="mt-3 h-10 w-full rounded bg-white/6" />
        </div>
      ) : (
        <>
          {/* Urgences */}
          <section aria-label="Notifications d'urgence" className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Urgences détectées</p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-white">
              Quand le coach trouve un problème urgent
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#8fa0c2]">
              Conflit ménage / arrivée, rupture de stock, dégâts non traités, invité mécontent :
              soyez prévenu immédiatement, par les canaux de votre choix.
            </p>
            <div className="mt-4 flex flex-col gap-1">
              <PrefToggle
                label="Notification push (dans l'application)"
                checked={prefs.enableCriticalPush}
                onToggle={toggle('enableCriticalPush')}
              />
              <PrefToggle
                label="Email immédiat"
                checked={prefs.enableCriticalEmail}
                onToggle={toggle('enableCriticalEmail')}
              />
              <PrefToggle
                label="SMS (bientôt disponible)"
                checked={prefs.enableCriticalSMS}
                onToggle={toggle('enableCriticalSMS')}
              />
            </div>
          </section>

          {/* Revenus & Qualité */}
          <section aria-label="Opportunités et qualité" className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Opportunités & qualité</p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-white">
              Revenus, avis et conseils
            </h2>
            <div className="mt-4 flex flex-col gap-1">
              <PrefToggle
                label="Email pour les opportunités de revenu (upsell, late checkout)"
                checked={prefs.enableRevenueEmail}
                onToggle={toggle('enableRevenueEmail')}
              />
              <PrefToggle
                label="Push pour les opportunités de revenu"
                checked={prefs.enableRevenuePush}
                onToggle={toggle('enableRevenuePush')}
              />
              <PrefToggle
                label="Email pour les alertes qualité (avis négatifs, invités mécontents)"
                checked={prefs.enableQualityEmail}
                onToggle={toggle('enableQualityEmail')}
              />
              <PrefToggle
                label="Afficher les alertes qualité dans le tableau de bord"
                checked={prefs.enableQualityDashboard}
                onToggle={toggle('enableQualityDashboard')}
              />
              <PrefToggle
                label="Conseils éducatifs du coach (bonnes pratiques hôtes)"
                checked={prefs.enableEducational}
                onToggle={toggle('enableEducational')}
              />
            </div>
          </section>

          {/* Briefing email */}
          <section aria-label="Briefing email" className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Briefing email</p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-white">
              Votre résumé du matin
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#8fa0c2]">
              Chaque matin (ou chaque lundi), recevez le point complet de vos biens : urgences,
              recommandations actives et opportunités.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="coach-frequency"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#8fa0c2]"
                >
                  Fréquence
                </label>
                <select
                  id="coach-frequency"
                  value={prefs.reportFrequency}
                  onChange={(e) => setPrefs((p) => ({ ...p, reportFrequency: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white outline-none [&>option]:bg-[#0d1530]"
                >
                  <option value="daily">Quotidien</option>
                  <option value="weekly">Hebdomadaire (lundi)</option>
                  <option value="never">Jamais</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="coach-time"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#8fa0c2]"
                >
                  Heure d&apos;envoi
                </label>
                <input
                  id="coach-time"
                  type="time"
                  value={prefs.reportTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
                      setPrefs((p) => ({ ...p, reportTime: v }));
                    }
                  }}
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white outline-none"
                />
              </div>
            </div>
          </section>

          {/* Types d'insights */}
          <section aria-label="Types de détections suivies" className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Détections suivies</p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-white">
              Ce que le coach doit surveiller
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {ALL_TYPES.map((t) => {
                const enabled = prefs.enabledInsightTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={enabled}
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        enabledInsightTypes: enabled
                          ? p.enabledInsightTypes.filter((x) => x !== t)
                          : [...p.enabledInsightTypes, t],
                      }))
                    }
                    className={cn(
                      'lux-chip min-h-[36px] px-4 transition-colors',
                      enabled
                        ? 'bg-[#5c8af0]/12 text-[#a9c4ff] ring-1 ring-[#5c8af0]/30'
                        : 'text-[#8fa0c2] opacity-60',
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
            {prefs.enabledInsightTypes.length === 0 && (
              <p className="mt-3 text-xs text-[#ffab92]">
                Laissez au moins un type actif — sinon le coach restera silencieux.
              </p>
            )}
          </section>

          {/* Barre d'enregistrement */}
          <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-2xl border border-white/10 bg-[#0b1226]/95 px-4 py-3 backdrop-blur">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty || prefs.enabledInsightTypes.length === 0}
              className="lux-btn h-10 px-5 text-xs disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer mes préférences'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Ligne de préférence à bascule (sans icône — point + interrupteur). */
function PrefToggle({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="flex min-h-[48px] w-full items-center justify-between gap-4 rounded-xl px-2 text-left transition-colors hover:bg-white/[0.03]"
    >
      <span className="text-[13px] text-white/90">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked ? 'border-[#34d399]/40 bg-[#34d399]/25' : 'border-white/12 bg-white/6',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all',
            checked ? 'left-[22px] bg-[#34d399]' : 'left-0.5 bg-[#8fa0c2]',
          )}
          style={{ height: 18, width: 18 }}
        />
      </span>
    </button>
  );
}

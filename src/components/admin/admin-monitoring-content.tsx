'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

// =============================================================
// AdminMonitoringContent — « TOUR DE CONTRÔLE » (v5.6, Phase 3)
//
// Page superadmin /admin/monitoring — style « Tech & Premium »
// (Saphir Luxe, ZÉRO icône — typographie + points) :
//   • Statut global (badge dot) + contrôle immédiat manuel ;
//   • 4 KPI : Temps de réponse API, Uptime DB, Erreurs 500 (24 h),
//     Incidents actifs ;
//   • Courbe recharts : temps de réponse API & DB (24 h, tick 5 min) ;
//   • Barres recharts : erreurs 500 / paiements / emails en échec
//     par heure (24 h) ;
//   • Incidents actifs (sévérité, catégorie, titre, occurrences,
//     dernière détection, action « Marquer comme résolu ») ;
//   • Historique des 10 derniers crons (statut + durée).
// Auto-refresh 30 s (pattern hub) — mesure /api/health à la demande.
// =============================================================

interface HealthPayload {
  status: 'OK' | 'DEGRADED' | 'DOWN';
  checks: {
    db: { status: string; latencyMs: number; error?: string };
    stripe: { status: string; latencyMs: number | null; error?: string };
    smtp: { status: string; latencyMs: number | null; error?: string };
    disk: { usagePercent: number | null; error?: string };
  };
  totalMs: number;
}

interface MonitoringPayload {
  current: {
    metric: {
      id: string;
      timestamp: string;
      apiResponseTime: number;
      dbResponseTime: number;
      status: string;
      error500Count: number;
      failedPayments: number;
      failedEmails: number;
      diskUsagePercent: number | null;
    } | null;
    health: HealthPayload | null;
    activeIncidents: number;
  };
  kpis: {
    avgApiMs1h: number | null;
    avgDbMs1h: number | null;
    dbUptime24h: number | null;
    error500Count24h: number;
    failedPayments24h: number;
    failedEmails24h: number;
    activeIncidents: number;
    resolvedIncidentsTotal: number;
  };
  series: { time: string; api: number; db: number | null; status: string }[];
  hourly: { hour: string; errors: number; payments: number; emails: number }[];
  incidents: {
    id: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    category: string;
    title: string;
    description: string;
    occurrences: number;
    lastSeenAt: string;
    createdAt: string;
  }[];
  crons: {
    id: string;
    jobName: string;
    status: string;
    duration: number;
    errorMessage: string | null;
    executedAt: string;
  }[];
}

const REFRESH_MS = 30_000;

const SEVERITY_META: Record<string, { label: string; dot: string; ink: string }> = {
  CRITICAL: { label: 'Critique', dot: '#f07d6a', ink: 'text-[#ffab92]' },
  WARNING: { label: 'Avertissement', dot: '#e9c47c', ink: 'text-[#e9c47c]' },
  INFO: { label: 'Info', dot: '#5c8af0', ink: 'text-[#a9c4ff]' },
};

const CATEGORY_LABELS: Record<string, string> = {
  SERVER: 'Serveur',
  DATABASE: 'Base de données',
  PAYMENT: 'Paiements',
  EMAIL: 'Emails',
  PREDICTIVE: 'Prédictif',
};

const CRON_STATUS_META: Record<string, { label: string; dot: string }> = {
  SUCCESS: { label: 'Succès', dot: '#34d399' },
  FAILED: { label: 'Échec', dot: '#f07d6a' },
  TIMEOUT: { label: 'Timeout', dot: '#e9c47c' },
};

const fmtHour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtDayHour = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function AdminMonitoringContent() {
  const [data, setData] = useState<MonitoringPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickBusy, setTickBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // rechargement manuel/auto
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/monitoring', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MonitoringPayload;
      if (mounted.current) setData(json);
    } catch {
      if (mounted.current) setData(null);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const interval = setInterval(() => {
      if (mounted.current) {
        setTick((t) => t + 1);
        void load();
      }
    }, REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [load, tick]);

  /** Contrôle immédiat : lance un tick complet (métrique + détection). */
  async function runTick() {
    setTickBusy(true);
    try {
      const res = await fetch('/api/admin/monitoring-tick', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { anomalies?: unknown[]; newIncidents?: unknown[] };
      const count = Array.isArray(json.newIncidents) ? json.newIncidents.length : 0;
      toast.success(
        count > 0
          ? `Contrôle terminé — ${count} nouvel${count > 1 ? 'aux' : ''} incident${count > 1 ? 's' : ''} signalé${count > 1 ? 's' : ''}`
          : 'Contrôle terminé — aucune nouvelle anomalie',
      );
      await load();
    } catch {
      toast.error("Le contrôle n'a pas pu être lancé");
    } finally {
      setTickBusy(false);
    }
  }

  async function resolveIncident(id: string) {
    setResolvingId(id);
    const previous = data;
    // Retrait optimiste.
    setData((d) =>
      d
        ? {
            ...d,
            incidents: d.incidents.filter((i) => i.id !== id),
            kpis: { ...d.kpis, activeIncidents: Math.max(0, d.kpis.activeIncidents - 1) },
            current: { ...d.current, activeIncidents: Math.max(0, d.current.activeIncidents - 1) },
          }
        : d,
    );
    try {
      const res = await fetch('/api/admin/monitoring', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId: id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Incident marqué comme résolu');
      await load();
    } catch {
      setData(previous ?? null);
      toast.error("L'incident n'a pas pu être résolu");
    } finally {
      setResolvingId(null);
    }
  }

  const health = data?.current.health ?? null;
  const globalStatus: 'OK' | 'DEGRADED' | 'DOWN' | 'UNKNOWN' = health
    ? health.status
    : data?.current.metric?.status === 'DOWN'
      ? 'DOWN'
      : data
        ? 'OK'
        : 'UNKNOWN';
  const hasIncidents = (data?.kpis.activeIncidents ?? 0) > 0;

  const seriesChart = (data?.series ?? []).map((p) => ({
    time: fmtHour.format(new Date(p.time)),
    api: p.api,
    db: p.db,
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- En-tête + statut global ---------- */}
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="lux-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="lux-eyebrow">Superadmin · Surveillance 100 % maison</p>
            <h1 className="lux-display mt-1 text-2xl font-semibold text-white sm:text-3xl">
              Tour de Contrôle
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'inline-flex min-h-[40px] items-center gap-2.5 rounded-full px-4 text-sm font-semibold',
                  globalStatus === 'OK' && !hasIncidents && 'bg-[#34d399]/12 text-[#34d399] ring-1 ring-[#34d399]/30',
                  (globalStatus === 'DEGRADED' || (globalStatus === 'OK' && hasIncidents)) &&
                    'bg-[#e9c47c]/12 text-[#e9c47c] ring-1 ring-[#e9c47c]/30',
                  globalStatus === 'DOWN' && 'bg-[#f07d6a]/12 text-[#ffab92] ring-1 ring-[#f07d6a]/35',
                  globalStatus === 'UNKNOWN' && 'bg-white/6 text-[#8fa0c2] ring-1 ring-white/12',
                )}
              >
                <span
                  className="lux-dot"
                  style={{
                    backgroundColor:
                      globalStatus === 'DOWN'
                        ? '#f07d6a'
                        : globalStatus === 'DEGRADED' || hasIncidents
                          ? '#e9c47c'
                          : globalStatus === 'OK'
                            ? '#34d399'
                            : '#8fa0c2',
                  }}
                  aria-hidden="true"
                />
                {globalStatus === 'OK' && !hasIncidents && 'Tous les systèmes sont opérationnels'}
                {globalStatus === 'OK' && hasIncidents && 'Opérationnel — incidents à traiter'}
                {globalStatus === 'DEGRADED' && 'Service dégradé'}
                {globalStatus === 'DOWN' && 'Service indisponible'}
                {globalStatus === 'UNKNOWN' && 'Mesure en cours…'}
              </span>
              {data?.current.metric && (
                <span className="text-[11px] text-[#8fa0c2]">
                  Dernier tick {fmtDayHour.format(new Date(data.current.metric.timestamp))}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="lux-btn-ghost h-9 px-4 text-[11px] disabled:opacity-50"
            >
              Actualiser
            </button>
            <button
              type="button"
              onClick={() => void runTick()}
              disabled={tickBusy}
              className="lux-btn h-9 px-4 text-[11px] disabled:opacity-50"
            >
              {tickBusy ? 'Contrôle en cours…' : 'Contrôle immédiat'}
            </button>
          </div>
        </div>

        {/* Vérifications externes (rapport frais) */}
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <CheckChip label="Base de données" check={health?.checks.db ? { status: health.checks.db.status, latencyMs: health.checks.db.latencyMs } : null} good="up" />
          <CheckChip label="Stripe" check={health?.checks.stripe ?? null} good="up" allowNotConfigured />
          <CheckChip label="SMTP" check={health?.checks.smtp ?? null} good="up" allowNotConfigured />
          <CheckChip
            label="Disque"
            check={health?.checks.disk.usagePercent != null ? { status: 'up', latencyMs: health.checks.disk.usagePercent } : null}
            good="up"
            suffix={health?.checks.disk.usagePercent != null ? ` — ${health.checks.disk.usagePercent} %` : undefined}
          />
        </div>
      </motion.header>

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <div className="h-3 w-24 rounded bg-white/8" />
              <div className="mt-3 h-8 w-16 rounded bg-white/8" />
            </div>
          ))}
        </div>
      ) : !data ? (
        <div className="lux-card lux-empty p-8 text-center">
          <p className="lux-display text-lg">Impossible de charger la surveillance</p>
          <p className="mt-1 text-xs text-[#8fa0c2]">
            Vérifiez votre connexion puis réessayez avec « Actualiser ».
          </p>
        </div>
      ) : (
        <>
          {/* ---------- 4 KPI ---------- */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiTile
              eyebrow="Temps de réponse API"
              value={data.kpis.avgApiMs1h != null ? `${data.kpis.avgApiMs1h} ms` : '—'}
              hint="moyenne 1 h · /api/health"
              dot="#5c8af0"
            />
            <KpiTile
              eyebrow="Uptime base de données"
              value={data.kpis.dbUptime24h != null ? `${Math.round(data.kpis.dbUptime24h * 100)} %` : '—'}
              hint={
                data.kpis.avgDbMs1h != null ? `ping moyen 1 h · ${data.kpis.avgDbMs1h} ms` : 'fenêtre 24 h'
              }
              dot="#34d399"
            />
            <KpiTile
              eyebrow="Erreurs 500 · 24 h"
              value={String(data.kpis.error500Count24h)}
              hint={`${data.kpis.failedPayments24h} paiement${data.kpis.failedPayments24h > 1 ? 's' : ''} · ${data.kpis.failedEmails24h} email${data.kpis.failedEmails24h > 1 ? 's' : ''} en échec`}
              dot={data.kpis.error500Count24h > 10 ? '#f07d6a' : '#e9c47c'}
            />
            <KpiTile
              eyebrow="Incidents actifs"
              value={String(data.kpis.activeIncidents)}
              hint={`${data.kpis.resolvedIncidentsTotal} résolu${data.kpis.resolvedIncidentsTotal > 1 ? 's' : ''} au total`}
              dot={data.kpis.activeIncidents > 0 ? '#f07d6a' : '#34d399'}
            />
          </div>

          {/* ---------- Graphiques ---------- */}
          <div className="grid gap-4 xl:grid-cols-2">
            <section aria-label="Temps de réponse sur 24 h" className="lux-card p-5 sm:p-6">
              <p className="lux-eyebrow">Latences · 24 h</p>
              <h2 className="lux-display mt-1 text-lg font-semibold text-white">
                Temps de réponse API et DB
              </h2>
              <div className="mt-4 h-64 w-full">
                {seriesChart.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={seriesChart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,170,214,0.14)" vertical={false} />
                      <XAxis
                        dataKey="time"
                        tick={{ fill: '#8fa0c2', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                      />
                      <YAxis
                        tick={{ fill: '#8fa0c2', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        unit=" ms"
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#0d1530',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 12,
                          fontSize: 12,
                          color: '#ffffff',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#8fa0c2' }} />
                      <Line
                        type="monotone"
                        dataKey="api"
                        name="API (ms)"
                        stroke="#5c8af0"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="db"
                        name="DB (ms)"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty
                    title="Pas encore de données"
                    hint="Le scheduler interne exécute le tick automatiquement toutes les 5 minutes (v4.98) — le cron externe /api/admin/monitoring-tick devient optionnel. Un « Contrôle immédiat » reste disponible à tout moment."
                  />
                )}
              </div>
            </section>

            <section aria-label="Erreurs et échecs par heure" className="lux-card p-5 sm:p-6">
              <p className="lux-eyebrow">Santé métier · 24 h</p>
              <h2 className="lux-display mt-1 text-lg font-semibold text-white">
                Erreurs 500, paiements et emails en échec
              </h2>
              <div className="mt-4 h-64 w-full">
                {data.hourly.some((h) => h.errors > 0 || h.payments > 0 || h.emails > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.hourly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,170,214,0.14)" vertical={false} />
                      <XAxis
                        dataKey="hour"
                        tick={{ fill: '#8fa0c2', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={16}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: '#8fa0c2', fontSize: 10 }}
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
                      <Bar dataKey="errors" name="Erreurs 500" fill="#f07d6a" radius={[4, 4, 0, 0]} maxBarSize={16} />
                      <Bar dataKey="payments" name="Paiements" fill="#e9c47c" radius={[4, 4, 0, 0]} maxBarSize={16} />
                      <Bar dataKey="emails" name="Emails" fill="#5c8af0" radius={[4, 4, 0, 0]} maxBarSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty
                    title="Aucun incident métier"
                    hint="Aucune erreur 500, aucun paiement ni email en échec sur les dernières 24 h."
                  />
                )}
              </div>
            </section>
          </div>

          {/* ---------- Incidents actifs ---------- */}
          <section aria-label="Incidents actifs" className="lux-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-4 sm:px-6">
              <div>
                <p className="lux-eyebrow">Détection & prédictif</p>
                <h2 className="lux-display mt-1 text-lg font-semibold text-white">
                  Incidents actifs · {data.incidents.length}
                </h2>
              </div>
              <span className="text-[11px] text-[#8fa0c2]">
                Un même problème récurrent est compté en occurrences — pas d&apos;alerte email en double.
              </span>
            </div>
            {data.incidents.length === 0 ? (
              <div className="lux-empty mx-5 mb-5 rounded-2xl sm:mx-6">
                <p className="lux-display text-lg">Aucun incident en cours</p>
                <p className="mt-1 text-xs text-[#8fa0c2]">
                  La détection prédictive surveille : latences, erreurs, paiements, emails, disque et crons.
                </p>
              </div>
            ) : (
              <div className="lux-scroll max-h-[480px] overflow-y-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 z-10 bg-[#0d1530]">
                    <tr className="lux-eyebrow !text-[9.5px] text-[#8fa0c2]">
                      <th className="px-5 py-3 font-medium sm:px-6">Sévérité</th>
                      <th className="px-4 py-3 font-medium">Catégorie</th>
                      <th className="px-4 py-3 font-medium">Incident</th>
                      <th className="hidden px-4 py-3 font-medium md:table-cell">Occurrences</th>
                      <th className="hidden px-4 py-3 font-medium lg:table-cell">Dernière détection</th>
                      <th className="px-5 py-3 text-right font-medium sm:px-6">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {data.incidents.map((incident) => {
                      const meta = SEVERITY_META[incident.severity] ?? SEVERITY_META.INFO;
                      return (
                        <tr
                          key={incident.id}
                          className={cn(
                            'align-top transition-colors',
                            incident.severity === 'CRITICAL'
                              ? 'bg-[#f07d6a]/[0.04] hover:bg-[#f07d6a]/[0.07]'
                              : 'hover:bg-white/[0.04]',
                          )}
                        >
                          <td className="px-5 py-4 sm:px-6">
                            <span className={cn('lux-chip', meta.ink)}>
                              <span className="lux-dot" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-[#8fa0c2]">
                            {CATEGORY_LABELS[incident.category] ?? incident.category}
                          </td>
                          <td className="max-w-md px-4 py-4">
                            <p className="font-semibold text-white">{incident.title}</p>
                            <p className="mt-1 text-xs leading-relaxed text-[#8fa0c2]">
                              {incident.description}
                            </p>
                          </td>
                          <td className="hidden px-4 py-4 tabular-nums text-white md:table-cell">
                            {incident.occurrences}
                          </td>
                          <td className="hidden px-4 py-4 tabular-nums text-[#8fa0c2] lg:table-cell">
                            {fmtDayHour.format(new Date(incident.lastSeenAt))}
                          </td>
                          <td className="px-5 py-4 text-right sm:px-6">
                            <button
                              type="button"
                              disabled={resolvingId === incident.id}
                              onClick={() => void resolveIncident(incident.id)}
                              className="lux-btn-ghost h-8 px-3 text-[11px] disabled:opacity-50"
                            >
                              {resolvingId === incident.id ? 'Résolution…' : 'Marquer comme résolu'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---------- Historique des crons ---------- */}
          <section aria-label="Historique des cron jobs" className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Automatisations</p>
            <h2 className="lux-display mt-1 text-lg font-semibold text-white">
              Historique des cron jobs · 10 derniers
            </h2>
            {/* v4.98 — Statut du SCHEDULER INTERNE (l'app s'exécute elle-même
                ses ticks : le cron externe devient optionnel). */}
            <SchedulerStatusBanner crons={data.crons} />
            {data.crons.length === 0 ? (
              <div className="lux-empty mt-4 rounded-2xl">
                <p className="lux-display text-lg">Aucun cron journalisé</p>
                <p className="mt-1 text-xs text-[#8fa0c2]">
                  Les exécutions apparaissent ici dès le premier passage (tick de monitoring, automatisations, coach).
                </p>
              </div>
            ) : (
              <ul className="lux-scroll mt-4 flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                {data.crons.map((cron) => {
                  const meta = CRON_STATUS_META[cron.status] ?? {
                    label: cron.status,
                    dot: '#8fa0c2',
                  };
                  return (
                    <li
                      key={cron.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                    >
                      <span className="lux-dot shrink-0" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
                        {cron.jobName}
                      </span>
                      <span
                        className={cn(
                          'lux-chip shrink-0',
                          cron.status === 'SUCCESS' ? 'text-[#34d399]' : 'text-[#ffab92]',
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-[11px] text-[#8fa0c2]">
                        {cron.duration} ms
                      </span>
                      <span className="shrink-0 tabular-nums text-[11px] text-[#8fa0c2]/70">
                        {fmtDayHour.format(new Date(cron.executedAt))}
                      </span>
                      {cron.errorMessage && (
                        <span className="w-full truncate text-[11px] text-[#ffab92]/80">
                          {cron.errorMessage}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * v4.98 — Bannière « Scheduler interne » : l'application exécute
 * elle-même monitoring-tick (5 min), daily-automations (24 h),
 * coach-reports (1 h) et monitoring-cleanup (26 h) via son hook
 * d'instrumentation. Le cron externe devient OPTIONNEL.
 * Dérivée localement des 10 derniers CronLog : dernier tick de
 * monitoring < 10 min → actif (vert), sinon avertissement.
 */
function SchedulerStatusBanner({
  crons,
}: {
  crons: { jobName: string; status: string; executedAt: string }[];
}) {
  const lastTick = crons
    .filter((c) => c.jobName === 'monitoring-tick')
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())[0];

  const minutesAgo = lastTick
    ? Math.max(0, Math.round((Date.now() - new Date(lastTick.executedAt).getTime()) / 60_000))
    : null;
  const active = minutesAgo !== null && minutesAgo <= 10;

  const when =
    minutesAgo === null
      ? null
      : minutesAgo < 1
        ? "à l'instant"
        : minutesAgo < 60
          ? `il y a ${minutesAgo} min`
          : `il y a ${Math.floor(minutesAgo / 60)} h ${minutesAgo % 60} min`;

  return (
    <div
      role="status"
      className={cn(
        'mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3.5',
        active
          ? 'border-[#34d399]/25 bg-[#34d399]/[0.05]'
          : 'border-[#e9c47c]/25 bg-[#e9c47c]/[0.05]',
      )}
    >
      <span
        className="lux-dot shrink-0"
        style={{ backgroundColor: active ? '#34d399' : '#e9c47c' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-white">
          Scheduler interne {active ? 'actif' : 'en attente du premier tick'}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#8fa0c2]">
          {active
            ? `La plateforme exécute elle-même ses traitements automatisés (tick de monitoring ${when}). Le cron externe devient optionnel.`
            : "L'application exécute ses ticks toutes les 5 min après démarrage (warm-up 35 s). Si aucun tick n'apparaît, vérifiez les logs serveur."}
        </p>
      </div>
      <span
        className={cn(
          'lux-chip shrink-0',
          active ? 'text-[#34d399]' : 'text-[#e9c47c]',
        )}
      >
        {lastTick?.status === 'SUCCESS' || active ? 'v4.98' : 'warm-up'}
      </span>
    </div>
  );
}

/** Puce de vérification (DB / Stripe / SMTP / disque). */
function CheckChip({
  label,
  check,
  good,
  allowNotConfigured,
  suffix,
}: {
  label: string;
  check: { status: string; latencyMs: number | null } | null;
  good: string;
  allowNotConfigured?: boolean;
  suffix?: string;
}) {
  const status = check?.status ?? 'unknown';
  const ok = status === good;
  const muted = allowNotConfigured && status === 'not_configured';
  const down = !ok && !muted;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs',
        ok && 'border-white/8 bg-white/[0.03]',
        muted && 'border-white/8 bg-white/[0.02] opacity-60',
        down && 'border-[#f07d6a]/30 bg-[#f07d6a]/[0.06]',
      )}
    >
      <span
        className="lux-dot shrink-0"
        style={{ backgroundColor: ok ? '#34d399' : muted ? '#8fa0c2' : '#f07d6a' }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-white/90">{label}</span>
      <span className="shrink-0 tabular-nums text-[11px] text-[#8fa0c2]">
        {muted
          ? 'non configuré'
          : check?.latencyMs != null
            ? suffix ?? `${check.latencyMs} ms`
            : down
              ? 'échec'
              : '—'}
      </span>
    </div>
  );
}

/** Tuile KPI typographique (Saphir Luxe, sans fond coloré plein). */
function KpiTile({
  eyebrow,
  value,
  hint,
  dot,
}: {
  eyebrow: string;
  value: string;
  hint: string;
  dot: string;
}) {
  return (
    <div className="lux-card p-5">
      <div className="flex items-center gap-2">
        <span className="lux-dot shrink-0" style={{ backgroundColor: dot }} aria-hidden="true" />
        <p className="lux-eyebrow !text-[9.5px]">{eyebrow}</p>
      </div>
      <p className="lux-num mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-[#8fa0c2]">{hint}</p>
    </div>
  );
}

/** État vide pour les graphiques (zéro icône). */
function ChartEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="lux-empty flex h-full flex-col items-center justify-center rounded-2xl px-6 text-center">
      <p className="lux-display text-lg">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#8fa0c2]">{hint}</p>
    </div>
  );
}

'use client';

// =============================================================
// BOUCLIER V2 — TABLEAU DE BORD (onglet 1/8).
// Design calqué sur le visuel « dashboard premium » validé par le
// client (image de référence) : rangée de 5 cartes KPI à mini
// donuts, grande aire d'activité 14 jours + donut de répartition
// avec total central, 4 cartes gradient colorées à vague, barres
// empilées hebdo + timeline des prochains événements, tableau des
// derniers séjours. Données RÉELLES via /api/shield/stats.
// =============================================================
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  FileDown,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import {
  CardTitle,
  fetchJson,
  formatDateTime,
  GhostButton,
  MiniDonut,
  RedButton,
  ShieldCard,
  StatusBadge,
  WaveSvg,
} from './shield-ui';

interface StatsResponse {
  kpis: {
    properties: number;
    aVenir: number;
    enRetard: number;
    termine: number;
    checkInsTotal: number;
    checkOutsTotal: number;
    sessionsCeMois: number;
    tauxProtection: number;
  };
  repartition: { name: string; value: number; color: string }[];
  series14: { label: string; checkins: number; checkouts: number }[];
  weeks: { label: string; checkins: number; checkouts: number }[];
  upcoming: {
    id: string;
    type: string;
    guestName: string | null;
    scheduledDate: string;
    sessionRef: string;
    propertyName: string;
  }[];
  recent: {
    id: string;
    type: string;
    guestName: string | null;
    agentName: string;
    completedAt: string;
    sessionRef: string;
    shots: number;
    videoToken: string | null;
    propertyName: string;
  }[];
  subscription: { plan: string; status: string; endDate: string } | null;
}

/** KPI card blanche à mini donut (rangée 1 du design de référence). */
function KpiCard({
  title,
  value,
  label,
  percent,
  color,
}: {
  title: string;
  value: number;
  label: string;
  percent: number;
  color: string;
}) {
  return (
    <ShieldCard className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="relative">
          <MiniDonut percent={percent} color={color} />
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-700">
            {Math.round(percent)}%
          </span>
        </div>
        <div>
          <p className="text-2xl font-bold leading-none tracking-tight text-slate-900">
            {String(value).padStart(2, '0')}
          </p>
          <p className="mt-1 text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </ShieldCard>
  );
}

/** Carte gradient colorée à vague (rangée « Total Distance » de l'image). */
function GradientStat({
  value,
  label,
  gradient,
}: {
  value: number;
  label: string;
  gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl p-5 shadow-sm ${gradient}`}>
      <WaveSvg />
      <p className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {value.toLocaleString('fr-FR')}
      </p>
      <p className="relative mt-2 text-sm font-medium text-white/85">{label}</p>
    </div>
  );
}

const GRADIENTS = {
  bleu: 'bg-gradient-to-br from-[#2f6fed] to-[#1d4ed8]',
  rouge: 'bg-gradient-to-br from-[#d92049] to-[#8f1230]',
  orange: 'bg-gradient-to-br from-[#f97316] to-[#c2410c]',
  violet: 'bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]',
} as const;

export function ShieldDashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<StatsResponse>('/api/shield/stats')
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <ShieldCard className="mx-auto max-w-lg p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-700">{error}</p>
          <GhostButton className="mt-4" onClick={() => window.location.reload()}>
            Réessayer
          </GhostButton>
        </ShieldCard>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a8a]" aria-label="Chargement" />
      </div>
    );
  }

  const { kpis, repartition, series14, weeks, upcoming, recent, subscription } = stats;
  const totalSessions = repartition.reduce((acc, r) => acc + r.value, 0);
  const hasProperties = kpis.properties > 0;
  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.endDate).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Tableau de bord</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Vue d'ensemble de vos états des lieux certifiés —{' '}
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inspection/biens">
            <GhostButton>
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Mes biens
            </GhostButton>
          </Link>
          <Link href="/inspection/menage">
            <RedButton>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau Séjour
            </RedButton>
          </Link>
        </div>
      </div>

      {/* ── Bannière abonnement (état réel) ── */}
      {subscription && daysLeft !== null && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            daysLeft > 30
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span className="font-semibold">
            {subscription.status === 'active' ? 'Bouclier actif' : 'Bouclier inactif'}
          </span>
          <span>— formule {subscription.plan === 'edl_annual' ? '299 €/an' : subscription.plan}</span>
          <span aria-hidden="true">·</span>
          <span>
            {daysLeft} jour{daysLeft > 1 ? 's' : ''} de protection restant{daysLeft > 1 ? 's' : ''}
          </span>
          {daysLeft <= 30 && (
            <Link href="/edl/abonnement" className="ml-auto font-semibold underline underline-offset-2">
              Renouveler
            </Link>
          )}
        </div>
      )}

      {/* ── Rangée 1 : 5 cartes KPI à donuts (style image) ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          title="Biens protégés"
          value={kpis.properties}
          label="logements onboardés"
          percent={Math.min(100, kpis.properties * 25)}
          color="#2563eb"
        />
        <KpiCard
          title="À venir"
          value={kpis.aVenir}
          label="séjours planifiés"
          percent={totalSessions ? (kpis.aVenir / totalSessions) * 100 : 0}
          color="#f59e0b"
        />
        <KpiCard
          title="En retard"
          value={kpis.enRetard}
          label="action requise"
          percent={totalSessions ? (kpis.enRetard / totalSessions) * 100 : 0}
          color="#dc2626"
        />
        <KpiCard
          title="Terminés"
          value={kpis.termine}
          label="certificats émis"
          percent={totalSessions ? (kpis.termine / totalSessions) * 100 : 0}
          color="#059669"
        />
        <KpiCard
          title="Protection"
          value={kpis.tauxProtection}
          label="des séjours couverts"
          percent={kpis.tauxProtection}
          color="#8b5cf6"
        />
      </div>

      {/* ── Rangée 2 : aire 14 jours + donut répartition ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ShieldCard className="lg:col-span-2">
          <CardTitle
            right={
              <span className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#2f6fed]" />
                  Check-ins
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#d92049]" />
                  Check-outs
                </span>
              </span>
            }
          >
            Activité — 14 derniers jours
          </CardTitle>
          <div className="h-72 p-2 pr-4">
            {hasProperties ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series14} margin={{ top: 12, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCI" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2f6fed" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#2f6fed" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="gradCO" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d92049" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#d92049" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(value: number, name: string) => [value, name === 'checkins' ? 'Check-ins' : 'Check-outs']}
                  />
                  <Area type="monotone" dataKey="checkins" stroke="#2f6fed" strokeWidth={2} fill="url(#gradCI)" />
                  <Area type="monotone" dataKey="checkouts" stroke="#d92049" strokeWidth={2} fill="url(#gradCO)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="Aucune activité pour l'instant — onboarder un bien pour démarrer." />
            )}
          </div>
        </ShieldCard>

        <ShieldCard>
          <CardTitle>Répartition des séjours</CardTitle>
          <div className="relative h-72 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={repartition}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="85%"
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {repartition.map((r) => (
                    <Cell key={r.name} fill={r.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend iconType="circle" formatter={(value: string) => <span className="text-xs text-slate-600">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex -translate-y-4 flex-col items-center justify-center">
              <p className="text-3xl font-bold tracking-tight text-slate-900">{totalSessions}</p>
              <p className="text-xs text-slate-500">séjours</p>
            </div>
          </div>
        </ShieldCard>
      </div>

      {/* ── Rangée 3 : 4 cartes gradient (style image) ── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <GradientStat value={kpis.checkInsTotal} label="Check-ins certifiés" gradient={GRADIENTS.bleu} />
        <GradientStat value={kpis.checkOutsTotal} label="Check-outs certifiés" gradient={GRADIENTS.rouge} />
        <GradientStat value={kpis.sessionsCeMois} label="Sessions ce mois" gradient={GRADIENTS.orange} />
        <GradientStat value={kpis.properties} label="Biens sous Bouclier" gradient={GRADIENTS.violet} />
      </div>

      {/* ── Rangée 4 : barres hebdo + timeline prochains événements ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ShieldCard>
          <CardTitle>Volume hebdomadaire (8 semaines)</CardTitle>
          <div className="h-64 p-2 pr-4">
            {hasProperties ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeks} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(value: number, name: string) => [value, name === 'checkins' ? 'Check-ins' : 'Check-outs']}
                  />
                  <Bar dataKey="checkins" stackId="a" fill="#818cf8" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="checkouts" stackId="a" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="Les volumes hebdomadaires apparaîtront après vos premiers séjours." />
            )}
          </div>
        </ShieldCard>

        <ShieldCard>
          <CardTitle
            right={
              <Link href="/inspection/menage" className="text-xs font-semibold text-[#C41E3A] hover:underline">
                Tout voir
              </Link>
            }
          >
            Prochains événements
          </CardTitle>
          <div className="max-h-64 overflow-y-auto p-4 shield-scrollbar">
            {upcoming.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Aucun séjour planifié — créez un séjour dans « Ménage à faire ».
              </p>
            ) : (
              <ol className="relative space-y-5 border-l-2 border-slate-100 pl-5">
                {upcoming.map((s) => (
                  <li key={s.id} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${
                        s.type === 'CHECK_IN' ? 'bg-[#2f6fed]' : 'bg-[#d92049]'
                      }`}
                    />
                    <p className="text-sm font-semibold text-slate-900">
                      {s.type === 'CHECK_IN' ? 'Check-in' : 'Check-out'}
                      {s.guestName ? ` — ${s.guestName}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(s.scheduledDate)} · {s.propertyName}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">{s.sessionRef}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </ShieldCard>
      </div>

      {/* ── Rangée 5 : derniers séjours (tableau) ── */}
      <ShieldCard>
        <CardTitle
          right={
            <Link href="/inspection/check-ins" className="text-xs font-semibold text-[#C41E3A] hover:underline">
              Historique complet
            </Link>
          }
        >
          Derniers séjours certifiés
        </CardTitle>
        {recent.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="mt-3 text-sm text-slate-500">
              {hasProperties
                ? 'Aucun séjour terminé pour le moment.'
                : "Onboarder votre premier bien depuis l'onglet « Mes biens » pour démarrer."}
            </p>
            <Link href="/inspection/biens" className="mt-4 inline-block">
              <RedButton>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Onboarder un bien
              </RedButton>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Invité</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Bien</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Preuves</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.guestName ?? '—'}</p>
                      <p className="text-xs text-slate-400">{s.agentName}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.propertyName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          s.type === 'CHECK_IN' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {s.type === 'CHECK_IN' ? (
                          <LogIn className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <LogOut className="h-3 w-3" aria-hidden="true" />
                        )}
                        {s.type === 'CHECK_IN' ? 'Check-in' : 'Check-out'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(s.completedAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status="TERMINE" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {s.shots} photos
                        </span>
                        {s.videoToken && (
                          <a
                            href={`/shield/video/${s.videoToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Vidéo
                          </a>
                        )}
                        <a
                          href={`/api/shield/pdf/session/${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`PDF du séjour ${s.sessionRef}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ShieldCard>
    </div>
  );
}

/** Zone vide des graphiques (règle « zéro case vide » : message utile). */
function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="max-w-xs text-center text-sm text-slate-400">{message}</p>
    </div>
  );
}

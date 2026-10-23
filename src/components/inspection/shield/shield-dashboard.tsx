'use client';

// =============================================================
// BOUCLIER V2 — TABLEAU DE BORD (onglet 1/10).
// Design calqué sur le visuel « dashboard premium » validé par le
// client (image de référence) : rangée de 5 cartes KPI à mini
// donuts, grande aire d'activité 14 jours + donut de répartition
// avec total central, 4 cartes gradient colorées à vague, barres
// empilées hebdo + timeline des prochains événements, tableau des
// derniers séjours. Données RÉELLES via /api/shield/stats.
// v4.159 : rangée 6 « Aide & Marketing » — raccourcis Mode
// d'emploi / FAQ, Badges de confiance (modal + QR /verify) et
// carte QR d'installation PWA, tous DANS le dashboard.
// =============================================================
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
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
  Award,
  BookOpen,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleHelp,
  FileDown,
  Hourglass,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { MarketingBadgesModal } from '@/components/airbnb/host/marketing-badges-modal';
import { PwaInstallBanner } from '@/components/pwa/pwa-install-banner';
import {
  agentLabel,
  AnomalyBadge,
  CardTitle,
  DepositChip,
  fetchJson,
  formatDateTime,
  formatMoney,
  GhostButton,
  MiniDonut,
  PageHeader,
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
    cautionsCeMois: number;
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
    anomalies: number;
    depositAmount: number | null;
    videoToken: string | null;
    propertyName: string;
  }[];
  subscription: { plan: string; status: string; endDate: string } | null;
}

/** KPI card à mini donut (rangée 1 du design de référence). */
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
    <ShieldCard className="p-4 transition-shadow hover:shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="relative">
          <MiniDonut percent={percent} color={color} />
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-700 dark:text-slate-200">
            {Math.round(percent)}%
          </span>
        </div>
        <div>
          <p className="text-2xl font-bold leading-none tracking-tight text-slate-900 dark:text-white">
            {String(value).padStart(2, '0')}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</p>
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
  bleu: 'bg-gradient-to-br from-[#1173c7] via-[#2f6fed] to-[#04467a]',
  rouge: 'bg-gradient-to-br from-[#ef2f5b] via-[#d92049] to-[#8f1230]',
  orange: 'bg-gradient-to-br from-[#fb923c] via-[#f97316] to-[#c2410c]',
  violet: 'bg-gradient-to-br from-[#a78bfa] via-[#8b5cf6] to-[#6d28d9]',
} as const;

/** Bien Bouclier minimal pour le sélecteur de badges marketing. */
interface ShieldPropertyLite {
  id: string;
  propertyName: string;
  city: string;
}

export function ShieldDashboard() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // v5.0 — thème actif pour les graphiques Recharts (couleurs JS non
  // couvertes par les classes dark: de Tailwind).
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  // v4.159 — Aide & Marketing DANS le dashboard : logements Inventaire
  // (badges de confiance) + QR PWA + raccourcis Mode d'emploi / FAQ.
  const [shieldProperties, setShieldProperties] = useState<ShieldPropertyLite[] | null>(null);
  const [badgesTarget, setBadgesTarget] = useState<ShieldPropertyLite | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    fetchJson<StatsResponse>('/api/shield/stats')
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    fetchJson<{ properties: ShieldPropertyLite[] }>('/api/shield/properties')
      .then((d) => setShieldProperties(d.properties ?? []))
      .catch(() => setShieldProperties([]));
  }, []);

  /** Ouverture des badges : 1 bien → direct, plusieurs → sélecteur. */
  function openBadges() {
    const list = shieldProperties ?? [];
    if (list.length === 1) setBadgesTarget(list[0]);
    else if (list.length > 1) setChooserOpen(true);
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <ShieldCard className="mx-auto max-w-lg p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">{error}</p>
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
        <Loader2 className="h-8 w-8 animate-spin text-[#055492] dark:text-[#1173c7]" aria-label="Chargement" />
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
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" />}
        title="Tableau de bord"
        subtitle={
          <>Vue d&apos;ensemble de vos états des lieux certifiés —{' '}
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</>
        }
        actions={
          <>
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
          </>
        }
      />

      {/* ── Bannière abonnement (état réel) ── */}
      {subscription && daysLeft !== null && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            daysLeft > 30
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
          }`}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span className="font-semibold">
            {subscription.status === 'active' ? 'Inventaire actif' : 'Inventaire inactif'}
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
          color="#0a61b0"
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
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#22305a' : '#eef2f7'} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: isDark ? '#8faac0' : '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: isDark ? '#8faac0' : '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: isDark ? '1px solid #283a66' : '1px solid #e2e8f0',
                      fontSize: 12,
                      background: isDark ? 'rgba(13,21,48,0.96)' : '#ffffff',
                      color: isDark ? '#e2e8f0' : '#0f172a',
                    }}
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
                  contentStyle={{
                    borderRadius: 12,
                    border: isDark ? '1px solid #283a66' : '1px solid #e2e8f0',
                    fontSize: 12,
                    background: isDark ? 'rgba(13,21,48,0.96)' : '#ffffff',
                    color: isDark ? '#e2e8f0' : '#0f172a',
                  }}
                />
                <Legend iconType="circle" formatter={(value: string) => <span className="text-xs text-slate-600 dark:text-slate-300">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex -translate-y-4 flex-col items-center justify-center">
              <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{totalSessions}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">séjours</p>
            </div>
          </div>
        </ShieldCard>
      </div>

      {/* ── Rangée 3 : 4 cartes gradient (style image) ── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <GradientStat value={kpis.checkInsTotal} label="Check-ins certifiés" gradient={GRADIENTS.bleu} />
        <GradientStat value={kpis.checkOutsTotal} label="Check-outs certifiés" gradient={GRADIENTS.rouge} />
        <GradientStat value={kpis.sessionsCeMois} label="Sessions ce mois" gradient={GRADIENTS.orange} />
        <GradientStat value={kpis.properties} label="Biens sous Inventaire" gradient={GRADIENTS.violet} />
      </div>

      {/* ── Rangée 3-bis : widgets marketing interne (v4.167 — effet
          « wahou » demandé par le client : valeur constante de
          l'abonnement). « Temps gagné » ≈ 40 min économisées par
          session certifiée vs état des lieux papier. ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/10 dark:to-[#0d1530]">
          <WaveSvg />
          <div className="relative flex items-start gap-4">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Revenus protégés</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{formatMoney(kpis.cautionsCeMois)}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                de cautions sécurisées ce mois-ci grâce à RoomScan
              </p>
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm dark:border-violet-500/25 dark:from-violet-500/10 dark:to-[#0d1530]">
          <WaveSvg />
          <div className="relative flex items-start gap-4">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              <Hourglass className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Temps gagné</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {Math.round(kpis.sessionsCeMois * 40) / 60 > 0
                  ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format((kpis.sessionsCeMois * 40) / 60)
                  : 0}{' '}h
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                économisées ce mois-ci sur vos états des lieux
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Rangée 4 : barres hebdo + timeline prochains événements ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ShieldCard>
          <CardTitle>Volume hebdomadaire (8 semaines)</CardTitle>
          <div className="h-64 p-2 pr-4">
            {hasProperties ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeks} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#22305a' : '#eef2f7'} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: isDark ? '#8faac0' : '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: isDark ? '#8faac0' : '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: isDark ? '1px solid #283a66' : '1px solid #e2e8f0',
                      fontSize: 12,
                      background: isDark ? 'rgba(13,21,48,0.96)' : '#ffffff',
                      color: isDark ? '#e2e8f0' : '#0f172a',
                    }}
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
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucun séjour planifié — créez un séjour dans « Ménage à faire ».
              </p>
            ) : (
              <ol className="relative space-y-5 border-l-2 border-slate-100 pl-5 dark:border-[#22305a]">
                {upcoming.map((s) => (
                  <li key={s.id} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white dark:ring-[#0d1530] ${
                        s.type === 'CHECK_IN' ? 'bg-[#2f6fed]' : 'bg-[#d92049]'
                      }`}
                    />
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {s.type === 'CHECK_IN' ? 'Check-in' : 'Check-out'}
                      {s.guestName ? ` — ${s.guestName}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(s.scheduledDate)} · {s.propertyName}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">{s.sessionRef}</p>
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
            <CalendarClock className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
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
            <table className="luxe-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide dark:border-[#22305a]">
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
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{s.guestName ?? '—'}</p>
                      {/* v4.167 — agent honnête (fix Problème 9) */}
                      <p className={`text-xs ${s.agentName.trim() ? 'text-slate-400 dark:text-slate-500' : 'italic text-slate-300 dark:text-slate-600'}`}>
                        {agentLabel(s.agentName)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.propertyName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          s.type === 'CHECK_IN'
                            ? 'bg-[#f0f7fc] text-[#04467a] dark:bg-[#1173c7]/15 dark:text-[#8fb1cc]'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
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
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(s.completedAt)}</td>
                    <td className="px-4 py-3">
                      {/* v4.167 — statut réel + badge Anomalie (Problème 10) */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status="TERMINE" />
                        <AnomalyBadge count={s.anomalies} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {/* v4.167 — caution sécurisée (Problème 11) */}
                        <DepositChip amount={s.depositAmount} />
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-[#22305a] dark:text-slate-300">
                          {s.shots} photos
                        </span>
                        {s.videoToken && (
                          <a
                            href={`/shield/video/${s.videoToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#283a66] dark:text-slate-300 dark:hover:bg-[#13204a]"
                          >
                            Vidéo
                          </a>
                        )}
                        <a
                          href={`/api/shield/pdf/session/${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`PDF du séjour ${s.sessionRef}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-[#283a66] dark:text-slate-300 dark:hover:bg-[#13204a]"
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

      {/* ── Rangée 6 : Aide & Marketing (v4.159 — tout est désormais ici) ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/inspection/mode-demploi"
          aria-label="Ouvrir le mode d'emploi"
          className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-[#055492]/30 hover:bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#055492] dark:border-[#22305a] dark:bg-[#0d1530]/90 dark:hover:border-[#1173c7]/40 dark:hover:bg-[#13204a]"
        >
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#055492] to-[#2f6fed] text-white shadow-md"
          >
            <BookOpen className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">Mode d&apos;emploi</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Onboarding, séjours et certificats pas à pas
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600"
          />
        </Link>

        <Link
          href="/inspection/faq"
          aria-label="Ouvrir la FAQ"
          className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-[#055492]/30 hover:bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#055492] dark:border-[#22305a] dark:bg-[#0d1530]/90 dark:hover:border-[#1173c7]/40 dark:hover:bg-[#13204a]"
        >
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0369a1] text-white shadow-md"
          >
            <CircleHelp className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">FAQ</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Réponses aux questions fréquentes de l&apos;Inventaire
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600"
          />
        </Link>

        <button
          type="button"
          onClick={openBadges}
          disabled={!shieldProperties || shieldProperties.length === 0}
          aria-label="Ouvrir les badges de confiance"
          className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-[#C41E3A]/30 hover:bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C41E3A] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#22305a] dark:bg-[#0d1530]/90 dark:hover:border-[#C41E3A]/40 dark:hover:bg-[#13204a]"
        >
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ef2f5b] to-[#C41E3A] text-white shadow-md"
          >
            <Award className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">Badges de confiance</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {shieldProperties && shieldProperties.length > 0
                ? '3 visuels PNG + QR de vérification pour votre annonce'
                : 'Onboarder un bien pour activer vos badges'}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600"
          />
        </button>
      </div>

      {/* v4.159 — carte QR d'installation de l'app mobile (PWA) */}
      <PwaInstallBanner variant="qr-card" />

      {/* v4.159 — sélecteur de bien (badges) quand plusieurs logements */}
      {chooserOpen && shieldProperties && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 dark:bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-label="Choisir le logement pour les badges"
          onClick={() => setChooserOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:border dark:border-[#22305a] dark:bg-[#0d1530]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Badges de confiance — choisir le logement
              </h3>
              <button
                type="button"
                onClick={() => setChooserOpen(false)}
                aria-label="Fermer"
                className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <ul className="shield-scrollbar mt-4 max-h-72 space-y-2 overflow-y-auto">
              {shieldProperties.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChooserOpen(false);
                      setBadgesTarget(p);
                    }}
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left transition-colors hover:border-[#055492]/40 hover:bg-slate-50 dark:border-[#22305a] dark:hover:border-[#1173c7]/50 dark:hover:bg-[#13204a]"
                  >
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {p.propertyName}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{p.city}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* v4.159 — modal badges marketing (PNG HD + code HTML, QR /verify) */}
      <MarketingBadgesModal
        propertyId={badgesTarget?.id ?? ''}
        propertyName={badgesTarget?.propertyName ?? ''}
        open={badgesTarget !== null}
        onClose={() => setBadgesTarget(null)}
      />
    </div>
  );
}

/** Zone vide des graphiques (règle « zéro case vide » : message utile). */
function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="max-w-xs text-center text-sm text-slate-400 dark:text-slate-500">{message}</p>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { B2BCard } from '@/components/ui/b2b-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatEur } from '@/lib/b2b';

// =============================================================
// AdminDashboardContent — V2 : Dashboard Superadmin sidebar + KPIs.
//  - 8 cartes KPI (GMV, commission plateforme, MRR, hôtes, biens,
//    prestataires, séjours, commandes 30 j)
//  - 3 graphiques (tendance 30 j GMV + commission, donut statuts de
//    paiement, GMV par catégorie)
//  - Top prestataires, dernières commandes, activité, derniers hôtes
// Source : /api/admin/kpis (définitions métier inchangées).
// =============================================================

interface KpisData {
  stats: {
    totalHosts: number;
    activeHosts: number;
    newHosts30d: number;
    propertiesCount: number;
    activePropertiesCount: number;
    providersTotal: number;
    providersActive: number;
    providersOwner: number;
    providersGuest: number;
    bookingsActive: number;
    bookingsUpcoming: number;
    subscriptionsActive: number;
    mrrEur: number;
    gmvPaidEur: number;
    platformRevenueEur: number;
    hostEarningsEur: number;
    ordersTotal: number;
    ordersPaid: number;
    ordersUnpaid: number;
    ordersRefunded: number;
    ordersFailed: number;
    orders30d: number;
    gmv30dEur: number;
    avgOrderEur: number;
    scansTotal: number;
  };
  series: { date: string; gmv: number; commission: number }[];
  paymentDistribution: { key: string; count: number }[];
  categoryRevenue: { category: string; label: string; gmv: number; orders: number }[];
  providerRevenue: { name: string; gmv: number; orders: number }[];
  recentOrders: {
    id: string;
    guestName: string;
    providerName: string;
    providerCategory: string | null;
    itemName: string;
    totalAmount: number;
    commission: number;
    status: string;
    paymentStatus: string;
    createdAt: string;
    paidAt: string | null;
  }[];
  recentHosts: {
    id: string;
    fullName: string | null;
    email: string;
    selectedPlan: string | null;
    isActive: boolean;
    createdAt: string;
    propertyCount: number;
  }[];
  recentActivity: {
    id: string;
    actionType: string;
    createdAt: string;
    propertyName: string | null;
    userName: string | null;
    module: string | null;
  }[];
}

// ---------- Configs de charts (palette « Travl » : vert foncé + coral) ----------
const revenueConfig = {
  gmv: { label: 'GMV (achats invités)', color: '#165949' },
  commission: { label: 'Commission plateforme', color: '#EE4B35' },
} satisfies ChartConfig;

const paymentConfig = {
  PAID: { label: 'Payées', color: '#165949' },
  UNPAID: { label: 'Impayées', color: '#f59e0b' },
  REFUNDED: { label: 'Remboursées', color: '#EE4B35' },
  FAILED: { label: 'Échecs', color: '#94a3b8' },
} satisfies ChartConfig;

const categoryConfig = {
  gmv: { label: 'GMV', color: '#165949' },
} satisfies ChartConfig;

// ---------- Libellés / formats ----------
const PAYMENT_META: Record<string, { label: string; className: string }> = {
  PAID: { label: 'Payée', className: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  UNPAID: { label: 'Impayée', className: 'bg-amber-50 border-amber-200 text-amber-700' },
  REFUNDED: { label: 'Remboursée', className: 'bg-rose-50 border-rose-200 text-rose-700' },
  FAILED: { label: 'Échec', className: 'bg-slate-100 border-slate-200 text-slate-500' },
};

const ORDER_STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'En attente', className: 'bg-slate-100 border-slate-200 text-slate-600' },
  CONFIRMED: { label: 'Confirmée', className: 'bg-teal-50 border-teal-200 text-teal-700' },
  PREPARING: { label: 'En préparation', className: 'bg-amber-50 border-amber-200 text-amber-700' },
  DELIVERED: { label: 'Livrée', className: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  CANCELLED: { label: 'Annulée', className: 'bg-rose-50 border-rose-200 text-rose-700' },
};

function planLabel(plan: string | null): { label: string; className: string } {
  switch (plan) {
    case 'airbnb_solo':
      return { label: 'Solo', className: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
    case 'airbnb_pro':
      return { label: 'Pro', className: 'bg-slate-900 border-slate-900 text-white' };
    case 'agency':
      return { label: 'Agence', className: 'bg-amber-50 border-amber-200 text-amber-700' };
    default:
      return { label: 'Free', className: 'bg-slate-100 border-slate-200 text-slate-500' };
  }
}

const ACTION_META: Record<string, { emoji: string; label: string }> = {
  qr_created: { emoji: '➕', label: 'QR code créé' },
  qr_updated: { emoji: '✏️', label: 'QR code modifié' },
  wifi_updated: { emoji: '📶', label: 'Wi-Fi mis à jour' },
  guidebook_updated: { emoji: '📖', label: 'Guidebook mis à jour' },
  scan: { emoji: '📡', label: 'Scan de la plaque' },
  voice_received: { emoji: '🎙️', label: 'Message vocal reçu' },
  complaint: { emoji: '🚨', label: 'Réclamation voyageur' },
  service_ordered: { emoji: '🥐', label: 'Service commandé' },
  property_created: { emoji: '🏠', label: 'Bien ajouté' },
  host_login: { emoji: '🔑', label: 'Connexion hôte' },
};

function actionMeta(type: string) {
  return ACTION_META[type] ?? { emoji: '•', label: type };
}

const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtFullDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const fmtDateTime = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  );
}

function metaOf<T>(map: Record<string, T>, key: string, fallback: T): T {
  return map[key] ?? fallback;
}

// ---------- Carte KPI ----------
type ChipTone = 'emerald' | 'amber' | 'rose' | 'slate' | 'teal';

const CHIP_TONES: Record<ChipTone, string> = {
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  rose: 'bg-rose-50 border-rose-200 text-rose-700',
  slate: 'bg-slate-100 border-slate-200 text-slate-600',
  teal: 'bg-teal-50 border-teal-200 text-teal-700',
};

function KpiCard({
  label,
  value,
  emoji,
  chip,
  hint,
}: {
  label: string;
  value: string;
  emoji: string;
  chip?: { text: string; tone: ChipTone };
  hint?: string;
}) {
  // Style « Travl » : tuile icône coral à gauche, valeur + libellé à droite.
  return (
    <Card
      className="flex items-center gap-4 rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
      title={hint}
    >
      <span
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FDECE8] text-2xl leading-none select-none"
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2xl font-extrabold tabular-nums text-slate-900 sm:text-3xl">
          {value}
        </span>
        <span className="block truncate text-sm text-slate-500">{label}</span>
        {chip && (
          <span
            className={cn(
              'mt-1.5 inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border',
              CHIP_TONES[chip.tone],
            )}
          >
            {chip.text}
          </span>
        )}
      </span>
    </Card>
  );
}

// ---------- Composant principal ----------
export function AdminDashboardContent() {
  const [data, setData] = useState<KpisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [today, setToday] = useState('');

  useEffect(() => {
    // Après montage uniquement (évite tout écart d'hydratation)
    setToday(fmtFullDate.format(new Date()));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/kpis');
      if (!res.ok) throw new Error('http');
      setData((await res.json()) as KpisData);
    } catch {
      setError('Impossible de charger les statistiques. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ----- Loading -----
  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto w-full px-4 py-8 space-y-6" aria-busy="true" aria-label="Chargement">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  // ----- Erreur -----
  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto w-full px-4 py-16 flex justify-center">
        <B2BCard className="max-w-md w-full text-center">
          <p className="text-3xl" aria-hidden="true">😵</p>
          <p className="mt-2 font-semibold text-slate-900">Erreur de chargement</p>
          <p className="text-sm text-slate-600 mt-1">{error || 'Données indisponibles'}</p>
          <Button onClick={load} className="mt-4 bg-slate-900 hover:bg-slate-800 text-white">
            Réessayer
          </Button>
        </B2BCard>
      </div>
    );
  }

  const { stats, series, paymentDistribution, categoryRevenue, providerRevenue } = data;
  const refundRate =
    stats.ordersPaid + stats.ordersRefunded > 0
      ? Math.round((stats.ordersRefunded / (stats.ordersPaid + stats.ordersRefunded)) * 100)
      : 0;
  const maxProviderGmv = Math.max(...providerRevenue.map((p) => p.gmv), 1);
  const totalOrdersForDonut = paymentDistribution.reduce((acc, d) => acc + d.count, 0);

  return (
    <div className="max-w-7xl mx-auto w-full px-4 py-8 space-y-6">
      {/* ================= En-tête ================= */}
      <section aria-labelledby="admin-greeting" className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-greeting" className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Vue d&apos;ensemble 🛡️
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Santé de la plateforme Conciergerie Hub{today ? ` — ${today}` : ''}.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            load();
            toast.success('Statistiques actualisées');
          }}
          className="border-slate-300 text-slate-700 hover:bg-slate-100"
        >
          Actualiser
        </Button>
      </section>

      {/* ================= KPIs principaux ================= */}
      <section aria-label="KPIs financiers" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="GMV encaissée"
          value={formatEur(stats.gmvPaidEur)}
          emoji="💳"
          chip={{ text: `${formatEur(stats.gmv30dEur)} sur 30 j`, tone: 'teal' }}
          hint={`${stats.ordersPaid} commande${stats.ordersPaid > 1 ? 's' : ''} payée${stats.ordersPaid > 1 ? 's' : ''} · panier moyen ${formatEur(stats.avgOrderEur)}`}
        />
        <KpiCard
          label="Revenus plateforme"
          value={formatEur(stats.platformRevenueEur)}
          emoji="🏦"
          chip={{ text: 'Commission 15 %', tone: 'emerald' }}
          hint={`Part reversée aux hôtes : ${formatEur(stats.hostEarningsEur)}`}
        />
        <KpiCard
          label="MRR abonnements"
          value={formatEur(stats.mrrEur)}
          emoji="💰"
          chip={
            stats.subscriptionsActive > 0
              ? { text: `${stats.subscriptionsActive} abonnement${stats.subscriptionsActive > 1 ? 's' : ''} actif${stats.subscriptionsActive > 1 ? 's' : ''}`, tone: 'emerald' }
              : { text: 'Aucun abonnement', tone: 'amber' }
          }
          hint="Revenu mensuel récurrent normalisé"
        />
        <KpiCard
          label="Hôtes actifs"
          value={String(stats.activeHosts)}
          emoji="👩‍💻"
          chip={{ text: `${stats.totalHosts} inscrit${stats.totalHosts > 1 ? 's' : ''}`, tone: 'slate' }}
          hint={stats.newHosts30d > 0 ? `+${stats.newHosts30d} nouveau${stats.newHosts30d > 1 ? 'x' : ''} sur 30 jours` : 'Aucun nouveau hôte sur 30 jours'}
        />
      </section>

      {/* ================= KPIs secondaires ================= */}
      <section aria-label="KPIs opérationnels" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-200 bg-white shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">🏠 Biens actifs</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {stats.activePropertiesCount}
            <span className="text-sm font-semibold text-slate-400"> / {stats.propertiesCount}</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Biens équipés d&apos;une plaque QR</p>
        </Card>
        <Card className="p-4 border-slate-200 bg-white shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">🧹 Prestataires actifs</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {stats.providersActive}
            <span className="text-sm font-semibold text-slate-400"> / {stats.providersTotal}</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            🔧 {stats.providersOwner} owner · 🥂 {stats.providersGuest} guest
          </p>
        </Card>
        <Card className="p-4 border-slate-200 bg-white shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">📅 Séjours en cours</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {stats.bookingsActive}
            <span className="text-sm font-semibold text-slate-400"> + {stats.bookingsUpcoming} à venir</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Check-ins en cours et confirmés</p>
        </Card>
        <Card className="p-4 border-slate-200 bg-white shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">🛒 Commandes 30 j</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {stats.orders30d}
            <span className="text-sm font-semibold text-slate-400"> / {stats.ordersTotal}</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {stats.ordersRefunded} remboursée{stats.ordersRefunded > 1 ? 's' : ''} ({refundRate} %)
          </p>
        </Card>
      </section>

      {/* ================= Graphiques ================= */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ----- Tendance 30 j : GMV + commission ----- */}
        <Card className="p-6 border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Revenus des 30 derniers jours</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Volume acheté par les invités (GMV) et commission retenue par la plateforme
              </p>
            </div>
          </div>
          <ChartContainer config={revenueConfig} className="mt-4 h-72 w-full">
            <ComposedChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v: string) => fmtDay.format(new Date(`${v}T12:00:00`))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v: number) => `${Math.round(v)}€`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_p, payload) => {
                      const raw = payload?.[0]?.payload as { date?: string } | undefined;
                      return raw?.date ? fmtFullDate.format(new Date(`${raw.date}T12:00:00`)) : '';
                    }}
                  />
                }
              />
              <Bar dataKey="gmv" fill="var(--color-gmv)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Line
                dataKey="commission"
                type="monotone"
                stroke="var(--color-commission)"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        </Card>

        {/* ----- Donut statuts de paiement ----- */}
        <Card className="p-6 border-slate-200 bg-white shadow-sm">
          <p className="font-semibold text-slate-900">Statuts de paiement</p>
          <p className="text-xs text-slate-500 mt-0.5">Répartition des {totalOrdersForDonut} commandes</p>
          <div className="relative mt-4">
            <ChartContainer config={paymentConfig} className="h-56 w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="key" />} />
                <Pie
                  data={paymentDistribution}
                  dataKey="count"
                  nameKey="key"
                  innerRadius={58}
                  outerRadius={88}
                  strokeWidth={3}
                  paddingAngle={2}
                >
                  {paymentDistribution.map((entry) => (
                    <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{totalOrdersForDonut}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">commandes</p>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {paymentDistribution.map((d) => {
              const meta = metaOf(PAYMENT_META, d.key, { label: d.key, className: '' });
              if (d.count === 0) return null;
              return (
                <span
                  key={d.key}
                  className={cn(
                    'inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                    meta.className,
                  )}
                >
                  {meta.label} : {d.count}
                </span>
              );
            })}
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ----- GMV par catégorie ----- */}
        <Card className="p-6 border-slate-200 bg-white shadow-sm">
          <p className="font-semibold text-slate-900">GMV par catégorie</p>
          <p className="text-xs text-slate-500 mt-0.5">Chiffre d&apos;affaires invités par type de prestation</p>
          {categoryRevenue.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              Aucune commande payée pour le moment.
            </p>
          ) : (
            <ChartContainer config={categoryConfig} className="mt-4 h-64 w-full">
              <BarChart layout="vertical" data={categoryRevenue} margin={{ left: 8, right: 16, top: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v: number) => `${Math.round(v)}€`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={150}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="gmv" fill="var(--color-gmv)" radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ChartContainer>
          )}
        </Card>

        {/* ----- Top prestataires ----- */}
        <Card className="p-6 border-slate-200 bg-white shadow-sm">
          <p className="font-semibold text-slate-900">Top prestataires</p>
          <p className="text-xs text-slate-500 mt-0.5">Classement par GMV encaissée (commandes payées)</p>
          {providerRevenue.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              Aucune commande payée pour le moment.
            </p>
          ) : (
            <ul className="mt-4 space-y-3.5">
              {providerRevenue.map((p, i) => (
                <li key={p.name} className="group">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 min-w-0 font-medium text-slate-900">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                          i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-bold text-slate-900 tabular-nums">{formatEur(p.gmv)}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">{p.orders} cmd</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', i === 0 ? 'bg-emerald-500' : 'bg-slate-300')}
                      style={{ width: `${Math.max((p.gmv / maxProviderGmv) * 100, 6)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ================= Commandes + activité ================= */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ----- Dernières commandes ----- */}
        <Card className="p-6 border-slate-200 bg-white shadow-sm lg:col-span-2">
          <p className="font-semibold text-slate-900">Dernières commandes</p>
          <p className="text-xs text-slate-500 mt-0.5">Les 8 dernières commandes passées depuis les QR Hubs</p>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              Aucune commande pour le moment.
            </p>
          ) : (
            <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-slate-100">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-50 z-10">
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-400">Invité</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-400">Prestation</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-slate-400">Montant</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-slate-400">Commission</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-slate-400">Paiement</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-slate-400">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentOrders.map((o) => {
                    const pay = metaOf(PAYMENT_META, o.paymentStatus, {
                      label: o.paymentStatus,
                      className: 'bg-slate-100 border-slate-200 text-slate-500',
                    });
                    return (
                      <TableRow key={o.id} className="hover:bg-slate-50/60">
                        <TableCell className="font-medium text-slate-900 whitespace-nowrap">
                          {o.guestName}
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <p className="truncate text-slate-800">{o.itemName}</p>
                          <p className="truncate text-[11px] text-slate-400">{o.providerName}</p>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatEur(o.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-700 font-medium tabular-nums whitespace-nowrap">
                          {formatEur(o.commission)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('font-semibold', pay.className)}>
                            {pay.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-[11px] text-slate-400 whitespace-nowrap">
                          {fmtDateTime.format(new Date(o.createdAt))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* ----- Dernières activités ----- */}
        <Card className="p-6 border-slate-200 bg-white shadow-sm">
          <p className="font-semibold text-slate-900">Dernières activités</p>
          <p className="text-xs text-slate-500 mt-0.5">Flux d&apos;événements de la plateforme</p>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">
              Aucune activité enregistrée pour le moment.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 -mx-2 max-h-96 overflow-y-auto">
              {data.recentActivity.map((a) => {
                const meta = actionMeta(a.actionType);
                return (
                  <li key={a.id} className="flex items-start gap-3 px-2 py-3 hover:bg-slate-50/60 transition-colors rounded-lg">
                    <span className="text-lg leading-none mt-0.5 select-none" aria-hidden="true">
                      {meta.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {a.userName ?? 'Système'}
                        {a.propertyName ? ` · ${a.propertyName}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {fmtDateTime.format(new Date(a.createdAt))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {/* ================= Derniers hôtes ================= */}
      <section aria-label="Derniers hôtes inscrits">
        <B2BCard
          header={{
            emoji: '🆕',
            title: 'Derniers hôtes inscrits',
            subtitle: 'Les 6 comptes hôtes les plus récents',
          }}
          className="overflow-hidden"
        >
          {data.recentHosts.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Aucun hôte inscrit pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100 -mx-5 -mb-5 max-h-96 overflow-y-auto">
              {data.recentHosts.map((h) => {
                const plan = planLabel(h.selectedPlan);
                return (
                  <li key={h.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                    <span
                      aria-hidden="true"
                      className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center justify-center shrink-0"
                    >
                      {(h.fullName ?? h.email).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {h.fullName ?? 'Sans nom'}
                        {!h.isActive && (
                          <span className="ml-2 text-[11px] font-semibold text-red-600">· désactivé</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{h.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={cn('font-semibold', plan.className)} variant="outline">
                        {plan.label}
                      </Badge>
                      <span className="text-[11px] text-slate-400">
                        {h.propertyCount} bien{h.propertyCount > 1 ? 's' : ''} · {formatDay(h.createdAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </B2BCard>
      </section>

      {/* ================= Rappel règle d'or ================= */}
      <section aria-label="Règle de gestion des prestataires" className="pb-4">
        <B2BCard className="bg-emerald-50/60 border-emerald-200">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-xl leading-none select-none">🛡️</span>
            <div>
              <p className="text-sm font-semibold text-emerald-900">Règle d&apos;or — Prestataires</p>
              <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                Seul le Superadmin (vous) ajoute et géolocalise les prestataires. Les hôtes les consultent
                depuis leur dashboard, et les voyageurs découvrent les expériences via le QR Hub.
                Gestion complète : <span className="font-semibold">menu Prestataires</span> dans la barre latérale.
              </p>
            </div>
          </div>
        </B2BCard>
      </section>
    </div>
  );
}

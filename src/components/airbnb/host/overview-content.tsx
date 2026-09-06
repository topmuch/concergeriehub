'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  CalendarPlus,
  CreditCard,
  QrCode,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { KPICard } from '@/components/airbnb/host/kpi-card';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { useOverview, type ActivityItem } from '@/hooks/use-overview';
import { relativeFrTime } from '@/lib/automations';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// =============================================================
// OverviewContent — page « Vue d'ensemble » du Dashboard Client
// (spécification QRTags Pro)
//
// • 4 KPIs : 📱 Scans ce mois (delta) · 💰 Revenus Upselling
//   (commandes payées du mois) · ⭐ Note moyenne · 🏠 Propriétés actives
// • Graphique recharts : courbe d'activité 30 jours (scans + commandes)
// • Activité récente : flux unifié (scans, commandes, réservations,
//   messages invités) — données réelles
// • Actions rapides vers les modules fréquents
// • Bannière d'invitations d'équipe en attente
// =============================================================

const BRAND = '#E23F2B';
const EMERALD = '#059669';

const ACTIVITY_META: Record<ActivityItem['type'], { emoji: string; ring: string }> = {
  scan: { emoji: '📱', ring: 'bg-[#FEF1EF]' },
  order: { emoji: '💰', ring: 'bg-emerald-50' },
  booking: { emoji: '📅', ring: 'bg-violet-50' },
  message: { emoji: '🎙️', ring: 'bg-amber-50' },
};

const QUICK_ACTIONS = [
  { href: '/airbnb/properties?new=1', emoji: '🏠', label: 'Ajouter une propriété' },
  { href: '/airbnb/plates?new=1', emoji: '📱', label: 'Générer une plaque QR' },
  { href: '/airbnb/orders', emoji: '💰', label: 'Voir les commandes' },
  { href: '/airbnb/automations', emoji: '⚡', label: 'Automatisations' },
] as const;

function formatEur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export function OverviewContent() {
  const { userFirstName, invitations, properties, propertiesLoading } = useHostContext();
  const { data, loading, error, refetch } = useOverview();
  const stats = data?.stats ?? null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* suppressHydrationWarning : la salutation/date dépend de l'horloge locale,
              volontairement rendue à la volée (identique à l'instant T côté serveur et client). */}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" suppressHydrationWarning>
            {greeting(now)}, {userFirstName} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-600" suppressHydrationWarning>
            {data?.scope === 'single' && data.property
              ? <>Activité de <span className="font-semibold text-slate-900">{data.property.name}</span> · {longDateFr(now)}</>
              : <>Vue consolidée de vos {properties.length} propriétés · {longDateFr(now)}</>}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 border-slate-200 text-slate-700"
          onClick={() => {
            void refetch();
            toast.success('Données actualisées');
          }}
          disabled={loading}
          aria-label="Actualiser les données"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Actualiser
        </Button>
      </div>

      {/* ---------- Bannière invitations en attente ---------- */}
      {invitations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          role="status"
        >
          <span aria-hidden="true" className="text-xl">✉️</span>
          <p className="flex-1 text-sm text-amber-900">
            <span className="font-bold">
              {invitations.length === 1 ? 'Une invitation en attente' : `${invitations.length} invitations en attente`}
            </span>{' '}
            — {invitations[0].property.name} ({roleLabel(invitations[0].role)})
            {invitations.length > 1 && ' et d’autres…'}
          </p>
          <Link
            href="/airbnb/team"
            className="inline-flex h-8 items-center rounded-lg bg-amber-600 px-3 text-xs font-bold text-white transition-colors hover:bg-amber-700"
          >
            Gérer mes invitations
          </Link>
        </motion.div>
      )}

      {/* ---------- Erreur API ---------- */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* ---------- KPIs ---------- */}
      <section aria-label="Indicateurs clés" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          icon="📱"
          label="Scans ce mois"
          value={stats ? stats.scansThisMonth.toLocaleString('fr-FR') : '—'}
          delta={stats?.scansDelta ?? null}
          hint={stats?.lastScanAt ? `Dernier scan ${relativeFrTime(new Date(stats.lastScanAt))}` : 'Aucun scan pour l’instant'}
          loading={loading || propertiesLoading}
        />
        <KPICard
          icon="💰"
          label="Revenus Upselling"
          value={stats ? formatEur(stats.upsellingRevenue) : '—'}
          delta={stats?.ordersDelta ?? null}
          hint={stats ? `${stats.ordersThisMonth} commande${stats.ordersThisMonth > 1 ? 's' : ''} payée${stats.ordersThisMonth > 1 ? 's' : ''} ce mois` : undefined}
          loading={loading || propertiesLoading}
        />
        <KPICard
          icon="⭐"
          label="Note moyenne"
          value={stats?.avgRating != null ? `${stats.avgRating.toFixed(1).replace('.', ',')}/5` : '—'}
          hint={stats ? `${stats.reviewsCount} avis service${stats.reviewsCount > 1 ? 's' : ''}` : undefined}
          loading={loading || propertiesLoading}
        />
        <KPICard
          icon="🏠"
          label="Propriétés actives"
          value={stats ? `${stats.activeProperties}/${stats.propertiesCount}` : '—'}
          hint={data?.scope === 'single' ? 'Bien sélectionné' : 'Toutes propriétés confondues'}
          loading={loading || propertiesLoading}
        />
      </section>

      {/* ---------- Graphique + Activité ---------- */}
      <section aria-label="Activité et historique" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Graphique 30 jours */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">📈 Courbe d&apos;activité</h2>
              <p className="text-xs text-slate-500">Scans de plaques et commandes — 30 derniers jours</p>
            </div>
          </div>
          {loading || propertiesLoading ? (
            <Skeleton className="h-[280px] w-full rounded-lg" aria-hidden="true" />
          ) : (
            <div className="h-[280px] w-full" role="img" aria-label="Courbe d'activité des 30 derniers jours : scans et commandes par jour">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series ?? []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradScans" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={EMERALD} stopOpacity={0.24} />
                      <stop offset="100%" stopColor={EMERALD} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    yAxisId="scans"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="orders"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 12px rgb(0 0 0 / 0.06)',
                      fontSize: 13,
                    }}
                    formatter={(value: number | string, name: string) => [
                      String(value),
                      name === 'scans' ? 'Scans' : 'Commandes',
                    ]}
                  />
                  <Legend
                    formatter={(value: string) => (
                      <span className="text-xs font-semibold text-slate-600">
                        {value === 'scans' ? 'Scans de plaques' : 'Commandes invités'}
                      </span>
                    )}
                  />
                  <Area
                    yAxisId="scans"
                    type="monotone"
                    dataKey="scans"
                    stroke={BRAND}
                    strokeWidth={2.5}
                    fill="url(#gradScans)"
                    activeDot={{ r: 4, strokeWidth: 2 }}
                  />
                  <Area
                    yAxisId="orders"
                    type="monotone"
                    dataKey="orders"
                    stroke={EMERALD}
                    strokeWidth={2.5}
                    fill="url(#gradOrders)"
                    activeDot={{ r: 4, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Activité récente */}
        <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">🕒 Activité récente</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              {data?.activity.length ?? 0}
            </span>
          </div>
          {loading || propertiesLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" aria-hidden="true" />
              ))}
            </div>
          ) : (data?.activity.length ?? 0) === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="text-3xl" aria-hidden="true">🌿</span>
              <p className="text-sm text-slate-500">Aucune activité pour le moment.</p>
              <p className="text-xs text-slate-400">Scans, commandes et réservations apparaîtront ici.</p>
            </div>
          ) : (
            <ul className="flex max-h-[300px] flex-col gap-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {data?.activity.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base',
                      ACTIVITY_META[item.type].ring,
                    )}
                  >
                    {ACTIVITY_META[item.type].emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                    {item.detail && (
                      <p className="truncate text-xs text-slate-500">{item.detail}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {item.amount != null && (
                      <p className="text-sm font-bold text-emerald-700">{formatEur(item.amount)}</p>
                    )}
                    <time
                      dateTime={item.at}
                      className="text-[11px] text-slate-400"
                      title={new Date(item.at).toLocaleString('fr-FR')}
                    >
                      {relativeFrTime(new Date(item.at))}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- Actions rapides ---------- */}
      <section aria-label="Actions rapides">
        <h2 className="mb-3 text-base font-bold text-slate-900">⚡ Actions rapides</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action, i) => (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.25 }}
              whileHover={{ y: -3 }}
            >
              <Link
                href={action.href}
                className="group flex h-full flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-[#E23F2B]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40 sm:flex-row sm:items-center sm:gap-3"
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-100 transition-colors group-hover:bg-[#FEF1EF]"
                >
                  {action.emoji}
                </span>
                <span className="min-w-0 text-[13px] font-bold leading-tight text-slate-800 group-hover:text-slate-950 sm:text-sm">
                  {action.label}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- Modules actifs (aperçu QR) ---------- */}
      {!loading && data && data.modules.length > 0 && (
        <section aria-label="Modules du bien">
          <h2 className="mb-3 text-base font-bold text-slate-900">
            🧩 Modules {data.scope === 'single' && data.property ? `— ${data.property.name}` : '(toutes propriétés)'}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.modules.map((m) => (
              <div
                key={m.key}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span aria-hidden="true" className="text-2xl">{m.emoji}</span>
                <p className="mt-2 text-sm font-bold text-slate-900">{m.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{m.description}</p>
                <p className="mt-2 text-xs font-bold text-[#E23F2B]">
                  {m.qrCount} QR actif{m.qrCount > 1 ? 's' : ''}
                  {m.nearbyProviders != null && m.qrCount > 0 && (
                    <> · {m.nearbyProviders} prestataire{m.nearbyProviders > 1 ? 's' : ''} à proximité</>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function longDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function roleLabel(role: string): string {
  switch (role) {
    case 'OWNER': return 'propriétaire';
    case 'MANAGER': return 'manager';
    case 'CLEANER': return 'ménage';
    case 'MAINTENANCE': return 'maintenance';
    default: return role.toLowerCase();
  }
}

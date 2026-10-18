'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
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
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
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
// AdminDashboardContent — v5.2 « SAPHIR LUXE » : Dashboard Superadmin.
// Refonte design PROFONDE (demande client) : design simple, luxueux,
// professionnel, engageant · mode sombre BLEUTÉ · SANS ICÔNES.
//  - Les 6 KPI opérationnels plateforme (bloc lux de /api/admin/kpis)
//    en cartes « joyaux » multicolores : minibar, séjour & compte à
//    rebours, calendrier, ménage, départs tardifs, avis
//  - KPIs plateforme conservés (Utilisateurs, Hôtes actifs,
//    Propriétés, MRR + GMV, commission, plaques, prestataires,
//    séjours, commandes 30 j) — mêmes définitions métier
//  - 3 graphiques + GMV par catégorie + top prestataires conservés
//  - « Santé plateforme » + « Transactions récentes » + « Dernières
//    inscriptions » + « Règle d'or » conservés — redesignés uniquement.
// Source : /api/admin/kpis (définitions métier inchangées).
// =============================================================

// ---------- Palette graphique (saphir / teal sur nuit bleutée) ----------
const SAPPHIRE = '#5c8af0';
const TEAL = '#2dd4bf';

const revenueConfig = {
  gmv: { label: 'GMV (achats invités)', color: SAPPHIRE },
  commission: { label: 'Commission plateforme', color: TEAL },
} satisfies ChartConfig;

const paymentConfig = {
  PAID: { label: 'Payées', color: '#34d399' },
  UNPAID: { label: 'Impayées', color: '#fbbf24' },
  REFUNDED: { label: 'Remboursées', color: SAPPHIRE },
  FAILED: { label: 'Échecs', color: '#64748b' },
} satisfies ChartConfig;

const categoryConfig = {
  gmv: { label: 'GMV', color: SAPPHIRE },
} satisfies ChartConfig;

const signupConfig = {
  count: { label: 'Inscriptions', color: SAPPHIRE },
} satisfies ChartConfig;

const planConfig = {
  airbnb_solo: { label: 'Solo', color: '#2dd4bf' },
  airbnb_pro: { label: 'Pro', color: SAPPHIRE },
  agency: { label: 'Agence', color: '#e9c47c' },
  free: { label: 'Free', color: '#64748b' },
} satisfies ChartConfig;

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
    plaquesTotal: number;
    plaquesActive: number;
    plaquesInactive: number;
    plaquesLost: number;
  };
  series: { date: string; gmv: number; commission: number }[];
  hostSignupTrend: { date: string; count: number }[];
  planDistribution: { plan: string; count: number }[];
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
  recentActivations: {
    id: string;
    activationCode: string;
    hubSlug: string | null;
    userName: string | null;
    createdAt: string;
  }[];
  lux?: LuxBlock;
}

// ---------- Bloc « lux » : les 6 KPI opérationnels plateforme ----------
interface LuxBlock {
  minibar: { itemsMonth: number; revenueMonth: number; itemsTotal: number; revenueTotal: number; ordersTotal: number };
  stay: { kind: 'active' | 'upcoming'; guestName: string; propertyName: string; checkIn: string; checkOut: string } | null;
  calendar: { inProgress: number; upcoming: number };
  housekeeping: { done: number; scheduled: number };
  lateCheckouts: { upcoming: number; next: { guestName: string; propertyName: string; until: string | null } | null };
  reviews: { positive: number; neutral: number; negative: number };
}

// ---------- « Santé plateforme » : incidents réels (/api/admin/notifications) ----------
interface HealthItem {
  kind: string;
  emoji: string;
  title: string;
  detail: string;
  href: string;
  at: string;
}

/** Pastille colorée par type d'incident (remplace les emojis). */
const HEALTH_KIND_DOT: Record<string, string> = {
  email_failed: '#f07d6a',
  order_unpaid: '#fbbf24',
  sub_past_due: '#cdb6ff',
  plaque_lost: '#8fa0c2',
};
const HEALTH_KIND_LABEL: Record<string, string> = {
  email_failed: 'Emails',
  order_unpaid: 'Commandes',
  sub_past_due: 'Abonnements',
  plaque_lost: 'Plaques',
};

// ---------- Libellés (pastilles typographiques, sans icône) ----------
const PAYMENT_META: Record<string, { label: string; dot: string }> = {
  PAID: { label: 'Payée', dot: '#34d399' },
  UNPAID: { label: 'Impayée', dot: '#fbbf24' },
  REFUNDED: { label: 'Remboursée', dot: SAPPHIRE },
  FAILED: { label: 'Échec', dot: '#64748b' },
};

function planLabel(plan: string | null): string {
  switch (plan) {
    case 'airbnb_solo': return 'Solo';
    case 'airbnb_pro': return 'Pro';
    case 'agency': return 'Agence';
    default: return 'Free';
  }
}

/** Point coloré par type d'action du flux (remplace les emojis). */
const ACTION_DOT: Record<string, string> = {
  qr_created: SAPPHIRE,
  qr_updated: SAPPHIRE,
  wifi_updated: TEAL,
  guidebook_updated: '#e9c47c',
  scan: SAPPHIRE,
  voice_received: '#cdb6ff',
  complaint: '#f07d6a',
  service_ordered: '#86e9cb',
  property_created: '#5eead4',
  host_login: '#e9c47c',
};

function actionLabel(type: string): string {
  switch (type) {
    case 'qr_created': return 'QR code créé';
    case 'qr_updated': return 'QR code modifié';
    case 'wifi_updated': return 'Wi-Fi mis à jour';
    case 'guidebook_updated': return 'Guidebook mis à jour';
    case 'scan': return 'Scan de la plaque';
    case 'voice_received': return 'Message vocal reçu';
    case 'complaint': return 'Réclamation voyageur';
    case 'service_ordered': return 'Service commandé';
    case 'property_created': return 'Bien ajouté';
    case 'host_login': return 'Connexion hôte';
    default: return type;
  }
}

// ---------- Flux temps réel fusionné (activités + activations plaques) ----------
interface FeedItem {
  id: string;
  dot: string;
  label: string;
  who: string;
  detail: string | null;
  createdAt: string;
}

function buildFeed(data: KpisData): FeedItem[] {
  const activities: FeedItem[] = data.recentActivity.map((a) => ({
    id: a.id,
    dot: ACTION_DOT[a.actionType] ?? '#8fa0c2',
    label: actionLabel(a.actionType),
    who: a.userName ?? 'Système',
    detail: a.propertyName,
    createdAt: a.createdAt,
  }));
  const activations: FeedItem[] = data.recentActivations.map((a) => ({
    id: a.id,
    dot: '#e9c47c',
    label: 'Plaque activée',
    who: a.userName ?? 'Système',
    detail: `${a.activationCode}${a.hubSlug ? ` · /${a.hubSlug}` : ''}`,
    createdAt: a.createdAt,
  }));
  return [...activities, ...activations]
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
    .slice(0, 12);
}

const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtFullDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
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
const fmtDayHour = new Intl.DateTimeFormat('fr-FR', {
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

/** Compte à rebours lisible jusqu'à l'échéance (horloge locale). */
function countdownLabel(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return 'Échéance atteinte';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')}`;
  const j = Math.floor(h / 24);
  return `${j} j ${String(h % 24).padStart(2, '0')} h`;
}

// ---------- Actions rapides (routes console superadmin) ----------
const QUICK_ACTIONS: { href: string; label: string; dot: string }[] = [
  { href: '/admin/users', label: 'Clients', dot: SAPPHIRE },
  { href: '/admin/qr', label: 'Générer des QR', dot: '#2dd4bf' },
  { href: '/admin/emails', label: 'Emails', dot: '#cdb6ff' },
  { href: '/admin/providers', label: 'Prestataires', dot: '#e9c47c' },
];

// ---------- Carte KPI « joyau » (sans icône — le chiffre est le héros) ----------
function LuxKpiCard({
  tone,
  label,
  value,
  chip,
  hint,
  loading,
  index = 0,
  children,
}: {
  tone: 'gold' | 'sapphire' | 'violet' | 'emerald' | 'coral' | 'rose';
  label: string;
  value: string;
  chip?: string;
  hint?: string;
  loading?: boolean;
  index?: number;
  children?: ReactNode;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.35, ease: 'easeOut' }}
      className={cn('luxkpi', `luxkpi-${tone}`)}
      aria-label={label}
    >
      <div className="relative flex items-center justify-between gap-2">
        <span className="luxkpi-label">{label}</span>
        {chip && !loading && <span className="luxkpi-chip">{chip}</span>}
      </div>
      {loading ? (
        <div className="mt-3 h-9 w-28 animate-pulse rounded-lg bg-white/10" aria-hidden="true" />
      ) : (
        <p className="luxkpi-value mt-2.5 truncate text-[28px] leading-none sm:text-[32px]">{value}</p>
      )}
      {children}
      {hint && !loading && <p className="relative mt-2.5 truncate text-[12px] leading-snug opacity-80">{hint}</p>}
    </motion.article>
  );
}

/** Carte statistique typographique (KPIs plateforme — sobre, sans icône). */
function LuxStat({
  label,
  value,
  chip,
  hint,
  dot = SAPPHIRE,
  index = 0,
}: {
  label: string;
  value: ReactNode;
  chip?: string;
  hint?: string;
  dot?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 * index, duration: 0.3, ease: 'easeOut' }}
      className="lux-card lux-card-hover relative p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="lux-eyebrow">{label}</span>
        {chip && <span className="lux-chip !px-2 !py-0.5 !text-[10px]">{chip}</span>}
      </div>
      <p className="lux-num mt-2 truncate text-3xl leading-none text-white">{value}</p>
      {hint && <p className="mt-2 truncate text-[11.5px] text-[#8fa0c2]">{hint}</p>}
      <span className="lux-dot absolute right-4 top-4 opacity-70" style={{ backgroundColor: dot }} aria-hidden="true" />
    </motion.div>
  );
}

function LuxSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-2xl bg-white/8', className)} />;
}

// ---------- Composant principal ----------
export function AdminDashboardContent() {
  const [data, setData] = useState<KpisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [today, setToday] = useState('');
  // « Santé plateforme » — incidents réels agrégés
  const [health, setHealth] = useState<HealthItem[] | null>(null);
  const [healthState, setHealthState] = useState<'loading' | 'ok' | 'error'>('loading');
  // Horloge locale pour le compte à rebours du séjour (anti-hydratation)
  const [tick, setTick] = useState<Date | null>(null);

  useEffect(() => {
    // Après montage uniquement (évite tout écart d'hydratation)
    setToday(fmtFullDate.format(new Date()));
    setTick(new Date());
    const id = setInterval(() => setTick(new Date()), 60_000);
    return () => clearInterval(id);
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

  const loadHealth = useCallback(async () => {
    setHealthState('loading');
    try {
      const res = await fetch('/api/admin/notifications', { cache: 'no-store' });
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as { count: number; items: HealthItem[] };
      setHealth(Array.isArray(json.items) ? json.items : []);
      setHealthState('ok');
    } catch {
      setHealthState('error');
    }
  }, []);

  useEffect(() => {
    load();
    loadHealth();
  }, [load, loadHealth]);

  function refreshAll() {
    load();
    loadHealth();
    toast.success('Statistiques actualisées');
  }

  // ----- Loading -----
  if (loading && !data) {
    return (
      <div className="lux lux-bg min-h-full p-4 pb-10 sm:p-6">
        <div className="mx-auto w-full max-w-7xl space-y-6" aria-busy="true" aria-label="Chargement">
          <LuxSkeleton className="h-40 w-full rounded-3xl" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <LuxSkeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <LuxSkeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <LuxSkeleton className="h-80 rounded-2xl lg:col-span-2" />
            <LuxSkeleton className="h-80 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // ----- Erreur -----
  if (error || !data) {
    return (
      <div className="lux lux-bg min-h-full p-4 pb-10 sm:p-6">
        <div className="mx-auto flex w-full max-w-7xl justify-center px-0 py-16">
          <div className="lux-card w-full max-w-md p-8 text-center" role="alert">
            <span className="lux-dot mx-auto" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
            <p className="lux-display mt-3 text-xl text-white">Erreur de chargement</p>
            <p className="mt-1 text-sm text-[#8fa0c2]">{error || 'Données indisponibles'}</p>
            <button type="button" onClick={load} className="lux-btn mt-5">
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { stats, series, paymentDistribution, categoryRevenue, providerRevenue } = data;
  const lux = data.lux ?? null;
  const refundRate =
    stats.ordersPaid + stats.ordersRefunded > 0
      ? Math.round((stats.ordersRefunded / (stats.ordersPaid + stats.ordersRefunded)) * 100)
      : 0;
  const maxProviderGmv = Math.max(...providerRevenue.map((p) => p.gmv), 1);
  const totalOrdersForDonut = paymentDistribution.reduce((acc, d) => acc + d.count, 0);
  const feed = buildFeed(data);
  const activeHostsPct = stats.totalHosts > 0 ? Math.round((stats.activeHosts / stats.totalHosts) * 100) : 0;
  const totalLuxReviews = lux ? lux.reviews.positive + lux.reviews.neutral + lux.reviews.negative : 0;

  // Séjour + compte à rebours (KPI 2 plateforme)
  const stayCard = lux?.stay
    ? (() => {
        const s = lux.stay;
        const isActive = s.kind === 'active';
        const target = isActive ? new Date(s.checkOut) : new Date(s.checkIn);
        const cd = tick ? countdownLabel(target, tick) : null;
        return {
          chip: cd ? (isActive ? `Départ dans ${cd}` : `Entrée dans ${cd}`) : undefined,
          hint: `${isActive ? 'Séjour en cours' : 'Prochain séjour'} — ${s.guestName} · ${s.propertyName}`,
        };
      })()
    : null;

  return (
    <div className="lux lux-bg min-h-full p-4 pb-10 sm:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-7">
        {/* ================= Hero « LUXE AURA » coloré (v6.0) ================= */}
        <motion.section
          aria-labelledby="admin-greeting"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="lux-hero p-6 sm:p-8"
        >
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="lux-eyebrow" suppressHydrationWarning>
                Console superadmin
              </p>
              <h2 id="admin-greeting" className="lux-display mt-2 text-3xl font-semibold text-white sm:text-[38px]">
                Vue d&apos;ensemble
              </h2>
              <p className="mt-2 text-sm text-[#8fa0c2]" suppressHydrationWarning>
                Santé de la plateforme RoomScan{today ? ` — ${today}` : ''}.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3" aria-hidden="true">
              <div className="lux-rule hidden w-10 sm:block" />
              <span className="lux-display hidden text-2xl text-[#e9c47c] sm:block">R</span>
            </div>
          </div>
          <div className="relative mt-5 flex flex-wrap items-center gap-2.5">
            <span className="lux-chip">
              <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
              {stats.ordersPaid} commande{stats.ordersPaid > 1 ? 's' : ''} payée{stats.ordersPaid > 1 ? 's' : ''}
            </span>
            <span className="lux-chip">
              <span className="lux-dot" style={{ backgroundColor: SAPPHIRE }} aria-hidden="true" />
              {stats.activeHosts} hôte{stats.activeHosts > 1 ? 's' : ''} actif{stats.activeHosts > 1 ? 's' : ''}
            </span>
            <span className="lux-chip">
              <span className="lux-dot" style={{ backgroundColor: '#2dd4bf' }} aria-hidden="true" />
              {stats.activePropertiesCount} bien{stats.activePropertiesCount > 1 ? 's' : ''} actif
              {stats.activePropertiesCount > 1 ? 's' : ''}
            </span>
            <button type="button" onClick={refreshAll} className="lux-btn-ghost ml-auto">
              Actualiser
            </button>
          </div>
        </motion.section>

        {/* ================= LES 6 KPI opérationnels — fonds colorés ================= */}
        <section aria-label="Indicateurs opérationnels" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* KPI 1 · MINIBAR */}
          <LuxKpiCard
            index={0}
            tone="gold"
            label="Minibar"
            loading={loading}
            value={lux ? formatEur(lux.minibar.revenueMonth) : '—'}
            chip={lux && lux.minibar.revenueTotal > 0 ? `Total ${formatEur(lux.minibar.revenueTotal)}` : undefined}
            hint={
              lux
                ? `${lux.minibar.itemsMonth} produit${lux.minibar.itemsMonth > 1 ? 's' : ''} consommé${lux.minibar.itemsMonth > 1 ? 's' : ''} ce mois · ${lux.minibar.ordersTotal} commande${lux.minibar.ordersTotal > 1 ? 's' : ''} au total`
                : undefined
            }
          />

          {/* KPI 2 · CHECK-IN / CHECK-OUT + compte à rebours */}
          <LuxKpiCard
            index={1}
            tone="sapphire"
            label="Check-in — Check-out"
            loading={loading}
            value={stayCard ? 'Séjour' : '—'}
            chip={stayCard?.chip}
            hint={stayCard?.hint ?? 'Aucun séjour programmé sur la plateforme'}
          >
            {lux?.stay && (
              <div className="relative mt-3 grid grid-cols-2 gap-2 text-[12px] leading-tight">
                <div className="rounded-lg border border-white/12 bg-white/6 px-2.5 py-2">
                  <p className="luxkpi-label text-[9px]">Entrée</p>
                  <p className="mt-0.5 font-semibold tabular-nums" suppressHydrationWarning>
                    {fmtDayHour.format(new Date(lux.stay.checkIn))}
                  </p>
                </div>
                <div className="rounded-lg border border-white/12 bg-white/6 px-2.5 py-2">
                  <p className="luxkpi-label text-[9px]">Départ</p>
                  <p className="mt-0.5 font-semibold tabular-nums" suppressHydrationWarning>
                    {fmtDayHour.format(new Date(lux.stay.checkOut))}
                  </p>
                </div>
              </div>
            )}
          </LuxKpiCard>

          {/* KPI 3 · CALENDRIER */}
          <LuxKpiCard
            index={2}
            tone="violet"
            label="Calendrier"
            loading={loading}
            value={lux ? `${lux.calendar.inProgress}` : '—'}
            chip={lux ? `${lux.calendar.upcoming} à venir` : undefined}
            hint="Clients en cours sur l'ensemble des biens"
          />

          {/* KPI 4 · MÉNAGE */}
          <LuxKpiCard
            index={3}
            tone="emerald"
            label="Ménage"
            loading={loading}
            value={lux ? `${lux.housekeeping.done}` : '—'}
            chip={lux ? `${lux.housekeeping.scheduled} programmé${lux.housekeeping.scheduled > 1 ? 's' : ''}` : undefined}
            hint="Rapports de ménage validés avec preuves — plateforme entière"
          />

          {/* KPI 5 · DÉPART TARDIF */}
          <LuxKpiCard
            index={4}
            tone="coral"
            label="Départ tardif"
            loading={loading}
            value={lux ? `${lux.lateCheckouts.upcoming}` : '—'}
            chip={lux && lux.lateCheckouts.upcoming > 0 ? 'à venir' : undefined}
            hint={
              lux?.lateCheckouts.next
                ? `Prochain : ${lux.lateCheckouts.next.guestName}${lux.lateCheckouts.next.until ? ` — jusqu'à ${fmtDayHour.format(new Date(lux.lateCheckouts.next.until))}` : ''}`
                : 'Aucun départ tardif programmé'
            }
          />

          {/* KPI 6 · AVIS */}
          <LuxKpiCard
            index={5}
            tone="rose"
            label="Avis"
            loading={loading}
            value={lux ? `${lux.reviews.positive}` : '—'}
            chip={lux ? `${lux.reviews.negative} négatif${lux.reviews.negative > 1 ? 's' : ''}` : undefined}
            hint={
              lux && totalLuxReviews > 0
                ? `Avis positifs · ${lux.reviews.neutral} neutre${lux.reviews.neutral > 1 ? 's' : ''} sur ${totalLuxReviews} au total`
                : 'Les retours des voyageurs apparaîtront ici'
            }
          />
        </section>

        {/* ================= Actions rapides ================= */}
        <section aria-label="Actions rapides" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action, i) => (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.25 }}
            >
              <Link href={action.href} className="lux-card lux-card-hover group flex items-center gap-3 p-4">
                <span className="lux-dot shrink-0" style={{ backgroundColor: action.dot }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{action.label}</span>
                <span aria-hidden="true" className="shrink-0 text-[#8fa0c2] transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </motion.div>
          ))}
        </section>

        {/* ================= KPIs plateforme (définitions métier inchangées) ================= */}
        <section aria-label="Indicateurs plateforme" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <LuxStat
            index={0}
            label="Utilisateurs totaux"
            value={String(stats.totalHosts)}
            chip={stats.newHosts30d > 0 ? `+${stats.newHosts30d} sur 30 j` : '0 sur 30 j'}
            hint="Comptes hôtes inscrits sur la plateforme"
          />
          <LuxStat
            index={1}
            label="Hôtes actifs"
            value={String(stats.activeHosts)}
            chip={`${activeHostsPct} % du total`}
            hint="Comptes hôtes actuellement actifs"
            dot="#2dd4bf"
          />
          <LuxStat
            index={2}
            label="Propriétés"
            value={<>{stats.activePropertiesCount} <span className="text-lg text-[#8fa0c2]">/ {stats.propertiesCount}</span></>}
            hint="Biens actifs équipés d'une plaque QR"
            dot="#cdb6ff"
          />
          <LuxStat
            index={3}
            label="MRR estimé"
            value={formatEur(stats.mrrEur)}
            chip={
              stats.subscriptionsActive > 0
                ? `${stats.subscriptionsActive} abonnement${stats.subscriptionsActive > 1 ? 's' : ''} actif${stats.subscriptionsActive > 1 ? 's' : ''}`
                : 'Aucun abonnement'
            }
            hint="Revenu mensuel récurrent normalisé"
            dot="#e9c47c"
          />
        </section>

        <section aria-label="Indicateurs opérationnels secondaires" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <LuxStat
            index={0}
            label="GMV encaissée"
            value={formatEur(stats.gmvPaidEur)}
            chip={`${formatEur(stats.gmv30dEur)} sur 30 j`}
            hint={`${stats.ordersPaid} commande${stats.ordersPaid > 1 ? 's' : ''} payée${stats.ordersPaid > 1 ? 's' : ''} · panier moyen ${formatEur(stats.avgOrderEur)}`}
          />
          <LuxStat
            index={1}
            label="Revenus plateforme"
            value={formatEur(stats.platformRevenueEur)}
            chip="Commission 15 %"
            hint={`Part reversée aux hôtes : ${formatEur(stats.hostEarningsEur)}`}
            dot="#2dd4bf"
          />
          <LuxStat
            index={2}
            label="Plaques activées"
            value={<>{stats.plaquesActive} <span className="text-lg text-[#8fa0c2]">/ {stats.plaquesTotal}</span></>}
            hint={`${stats.plaquesInactive} inactive${stats.plaquesInactive > 1 ? 's' : ''} · ${stats.plaquesLost} perdue${stats.plaquesLost > 1 ? 's' : ''}`}
            dot="#e9c47c"
          />
          <LuxStat
            index={3}
            label="Prestataires actifs"
            value={<>{stats.providersActive} <span className="text-lg text-[#8fa0c2]">/ {stats.providersTotal}</span></>}
            hint={`${stats.providersOwner} owner · ${stats.providersGuest} guest`}
            dot="#5eead4"
          />
          <LuxStat
            index={4}
            label="Séjours en cours"
            value={<>{stats.bookingsActive} <span className="text-lg text-[#8fa0c2]">+ {stats.bookingsUpcoming} à venir</span></>}
            hint="Check-ins en cours et confirmés"
            dot={SAPPHIRE}
          />
          <LuxStat
            index={5}
            label="Commandes 30 j"
            value={<>{stats.orders30d} <span className="text-lg text-[#8fa0c2]">/ {stats.ordersTotal}</span></>}
            hint={`${stats.ordersRefunded} remboursée${stats.ordersRefunded > 1 ? 's' : ''} (${refundRate} %)`}
            dot="#fbbf24"
          />
        </section>

        {/* ================= Graphiques ================= */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ----- Tendance 30 j : GMV + commission ----- */}
          <div className="lux-card p-5 sm:p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="lux-eyebrow">Finance</p>
                <p className="lux-display mt-1 text-xl text-white">Revenus des 30 derniers jours</p>
                <p className="mt-0.5 text-xs text-[#8fa0c2]">
                  Volume acheté par les invités (GMV) et commission retenue par la plateforme
                </p>
              </div>
            </div>
            <ChartContainer config={revenueConfig} className="mt-4 h-72 w-full">
              <ComposedChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="rgba(148,170,214,0.14)" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(148,170,214,0.18)' }}
                  tickMargin={8}
                  minTickGap={28}
                  tick={{ fontSize: 11, fill: '#8fa0c2' }}
                  tickFormatter={(v: string) => fmtDay.format(new Date(`${v}T12:00:00`))}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11, fill: '#8fa0c2' }}
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
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          </div>

          {/* ----- Donut statuts de paiement ----- */}
          <div className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Paiements</p>
            <p className="lux-display mt-1 text-xl text-white">Statuts de paiement</p>
            <p className="mt-0.5 text-xs text-[#8fa0c2]">Répartition des {totalOrdersForDonut} commandes</p>
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
                  <p className="lux-num text-2xl text-white">{totalOrdersForDonut}</p>
                  <p className="lux-eyebrow !text-[9px]">commandes</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {paymentDistribution.map((d) => {
                const meta = metaOf(PAYMENT_META, d.key, { label: d.key, dot: '#8fa0c2' });
                if (d.count === 0) return null;
                return (
                  <span key={d.key} className="lux-chip">
                    <span className="lux-dot" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
                    {meta.label} : {d.count}
                  </span>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= Croissance & abonnements ================= */}
        <section aria-label="Croissance et abonnements" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ----- Courbe d'inscriptions hôtes 30 j ----- */}
          <div className="lux-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="lux-eyebrow">Croissance</p>
                <p className="lux-display mt-1 text-xl text-white">Inscriptions des hôtes</p>
                <p className="mt-0.5 text-xs text-[#8fa0c2]">Nouveaux comptes créés sur les 30 derniers jours</p>
              </div>
              <span className="lux-chip">
                <span className="lux-dot" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                +{stats.newHosts30d} sur 30 j
              </span>
            </div>
            <ChartContainer config={signupConfig} className="mt-4 h-64 w-full">
              <AreaChart data={data.hostSignupTrend} margin={{ left: 4, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="fillSignupsLux" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="rgba(148,170,214,0.14)" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(148,170,214,0.18)' }}
                  tickMargin={8}
                  minTickGap={28}
                  tick={{ fontSize: 11, fill: '#8fa0c2' }}
                  tickFormatter={(v: string) => fmtDay.format(new Date(`${v}T12:00:00`))}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#8fa0c2' }}
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
                <Area
                  dataKey="count"
                  type="monotone"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                  fill="url(#fillSignupsLux)"
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </div>

          {/* ----- Répartition des abonnements (Solo vs Pro) ----- */}
          <div className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Abonnements</p>
            <p className="lux-display mt-1 text-xl text-white">Répartition des abonnements</p>
            <p className="mt-0.5 text-xs text-[#8fa0c2]">Comptes hôtes par plan sélectionné</p>
            {data.planDistribution.length === 0 ? (
              <div className="lux-empty mt-4 rounded-2xl px-4 py-10 text-center">
                <p className="text-sm text-[#8fa0c2]">Aucun hôte inscrit pour le moment.</p>
              </div>
            ) : (
              <>
                <div className="relative mt-4">
                  <ChartContainer config={planConfig} className="h-56 w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent nameKey="plan" />} />
                      <Pie
                        data={data.planDistribution}
                        dataKey="count"
                        nameKey="plan"
                        innerRadius={58}
                        outerRadius={88}
                        strokeWidth={3}
                        paddingAngle={2}
                      >
                        {data.planDistribution.map((entry) => (
                          <Cell key={entry.plan} fill={`var(--color-${entry.plan})`} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="lux-num text-2xl text-white">{stats.totalHosts}</p>
                      <p className="lux-eyebrow !text-[9px]">hôtes</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.planDistribution.map((p) => (
                    <span key={p.plan} className="lux-chip">
                      {planLabel(p.plan === 'airbnb_solo' || p.plan === 'airbnb_pro' || p.plan === 'agency' ? p.plan : 'free')} : {p.count}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* ----- GMV par catégorie ----- */}
          <div className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Prestations</p>
            <p className="lux-display mt-1 text-xl text-white">GMV par catégorie</p>
            <p className="mt-0.5 text-xs text-[#8fa0c2]">Chiffre d&apos;affaires invités par type de prestation</p>
            {categoryRevenue.length === 0 ? (
              <div className="lux-empty mt-4 rounded-2xl px-4 py-10 text-center">
                <p className="text-sm text-[#8fa0c2]">Aucune commande payée pour le moment.</p>
              </div>
            ) : (
              <ChartContainer config={categoryConfig} className="mt-4 h-64 w-full">
                <BarChart layout="vertical" data={categoryRevenue} margin={{ left: 8, right: 16, top: 4 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 6" stroke="rgba(148,170,214,0.14)" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#8fa0c2' }}
                    tickFormatter={(v: number) => `${Math.round(v)}€`}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={150}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#8fa0c2' }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="gmv" fill="var(--color-gmv)" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ChartContainer>
            )}
          </div>

          {/* ----- Top prestataires ----- */}
          <div className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Classement</p>
            <p className="lux-display mt-1 text-xl text-white">Top prestataires</p>
            <p className="mt-0.5 text-xs text-[#8fa0c2]">Classement par GMV encaissée (commandes payées)</p>
            {providerRevenue.length === 0 ? (
              <div className="lux-empty mt-4 rounded-2xl px-4 py-10 text-center">
                <p className="text-sm text-[#8fa0c2]">Aucune commande payée pour le moment.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3.5">
                {providerRevenue.map((p, i) => (
                  <li key={p.name} className="group">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2.5 font-medium text-white">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'lux-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]',
                            i === 0
                              ? 'bg-[#e9c47c] text-[#1a1206]'
                              : 'bg-white/6 text-[#8fa0c2] ring-1 ring-white/10',
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="lux-num font-semibold text-white">{formatEur(p.gmv)}</span>
                        <span className="ml-1.5 text-[11px] text-[#8fa0c2]">{p.orders} cmd</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/6">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#5c8af0] to-[#2dd4bf]"
                        style={{ width: `${Math.max((p.gmv / maxProviderGmv) * 100, 6)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ================= Transactions récentes + activité ================= */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ----- Transactions récentes ----- */}
          <div className="lux-card p-5 sm:p-6 lg:col-span-2">
            <p className="lux-eyebrow">Finance</p>
            <p className="lux-display mt-1 text-xl text-white">Transactions récentes</p>
            <p className="mt-0.5 text-xs text-[#8fa0c2]">Les 8 dernières transactions passées depuis les QR Hubs</p>
            {data.recentOrders.length === 0 ? (
              <div className="lux-empty mt-4 rounded-2xl px-4 py-10 text-center">
                <p className="text-sm text-[#8fa0c2]">Aucune commande pour le moment.</p>
              </div>
            ) : (
              <div className="lux-scroll mt-4 max-h-96 overflow-y-auto rounded-2xl border border-white/8">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                    <TableRow className="hover:bg-transparent border-white/8">
                      <TableHead className="lux-eyebrow !text-[9.5px]">Invité</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px]">Prestation</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px] text-right">Montant</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px] text-right">Commission</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px]">Paiement</TableHead>
                      <TableHead className="lux-eyebrow !text-[9.5px] text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentOrders.map((o) => {
                      const pay = metaOf(PAYMENT_META, o.paymentStatus, { label: o.paymentStatus, dot: '#8fa0c2' });
                      return (
                        <TableRow key={o.id} className="border-white/8 hover:bg-white/[0.04]">
                          <TableCell className="whitespace-nowrap font-medium text-white">
                            {o.guestName}
                          </TableCell>
                          <TableCell className="max-w-[180px]">
                            <p className="truncate text-white">{o.itemName}</p>
                            <p className="truncate text-[11px] text-[#8fa0c2]">{o.providerName}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums text-white">
                            {formatEur(o.totalAmount)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-medium tabular-nums" style={{ color: '#86e9cb' }}>
                            {formatEur(o.commission)}
                          </TableCell>
                          <TableCell>
                            <span className="lux-chip">
                              <span className="lux-dot" style={{ backgroundColor: pay.dot }} aria-hidden="true" />
                              {pay.label}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-[11px] text-[#8fa0c2]">
                            {fmtDateTime.format(new Date(o.createdAt))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* ----- Flux temps réel fusionné ----- */}
          <div className="lux-card p-5 sm:p-6">
            <p className="lux-eyebrow">Temps réel</p>
            <p className="lux-display mt-1 text-xl text-white">Dernières activités</p>
            <p className="mt-0.5 text-xs text-[#8fa0c2]">Activations de plaques, scans &amp; actions hôtes</p>
            {feed.length === 0 ? (
              <div className="lux-empty mt-4 rounded-2xl px-4 py-10 text-center">
                <p className="text-sm text-[#8fa0c2]">Aucune activité enregistrée pour le moment.</p>
              </div>
            ) : (
              <ul className="lux-scroll -mx-2 mt-2 max-h-96 divide-y divide-white/6 overflow-y-auto">
                {feed.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.04]">
                    <span className="lux-dot mt-2 shrink-0" style={{ backgroundColor: a.dot }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white">{a.label}</p>
                      <p className="truncate text-xs text-[#8fa0c2]">
                        {a.who}
                        {a.detail ? ` · ${a.detail}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[#8fa0c2]">
                      {fmtDateTime.format(new Date(a.createdAt))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ================= Santé plateforme (real data /api/admin/notifications) ================= */}
        <section aria-label="Santé plateforme">
          <div className="lux-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="lux-eyebrow">Monitoring</p>
                <p className="lux-display mt-1 text-xl text-white">Santé plateforme</p>
                <p className="mt-0.5 text-xs text-[#8fa0c2]">
                  Incidents réels détectés : emails en échec, commandes impayées &gt; 48 h, abonnements en impayé,
                  plaques perdues
                </p>
              </div>
              {healthState === 'ok' && health && (
                <span className="lux-chip">
                  <span
                    className={cn('lux-dot', health.length > 0 && 'animate-pulse')}
                    style={{ backgroundColor: health.length === 0 ? '#34d399' : '#fbbf24' }}
                    aria-hidden="true"
                  />
                  {health.length === 0 ? 'Tout est opérationnel' : `${health.length} point${health.length > 1 ? 's' : ''} d'attention`}
                </span>
              )}
            </div>

            {healthState === 'loading' ? (
              <div className="mt-4 flex flex-col gap-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <LuxSkeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : healthState === 'error' ? (
              <p className="lux-empty mt-4 rounded-2xl px-4 py-6 text-center text-sm text-[#8fa0c2]">
                Monitoring momentanément indisponible.
              </p>
            ) : !health || health.length === 0 ? (
              <div className="lux-empty mt-4 rounded-2xl px-4 py-8 text-center">
                <p className="lux-display text-lg text-white">Aucun incident — la plateforme est saine.</p>
                <p className="mt-1 text-xs text-[#8fa0c2]">
                  Emails, paiements, abonnements et plaques : tout roule.
                </p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-white/6">
                {health.map((n, i) => {
                  const dot = HEALTH_KIND_DOT[n.kind] ?? '#8fa0c2';
                  const label = HEALTH_KIND_LABEL[n.kind] ?? n.kind;
                  return (
                    <li key={`${n.kind}-${i}`}>
                      <Link
                        href={n.href}
                        className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/[0.04]"
                      >
                        <span className="lux-dot mt-2 shrink-0" style={{ backgroundColor: dot }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-white">{n.title}</span>
                          <span className="block truncate text-xs text-[#8fa0c2]">{n.detail}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="lux-chip">{label}</span>
                          <span className="text-[11px] text-[#8fa0c2]">{fmtDateTime.format(new Date(n.at))}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ================= Dernières inscriptions ================= */}
        <section aria-label="Dernières inscriptions">
          <div className="lux-card overflow-hidden p-0">
            <div className="px-5 pb-3 pt-5 sm:px-6">
              <p className="lux-eyebrow">Croissance</p>
              <p className="lux-display mt-1 text-xl text-white">Dernières inscriptions</p>
              <p className="mt-0.5 text-xs text-[#8fa0c2]">Les 6 comptes hôtes les plus récents</p>
            </div>
            {data.recentHosts.length === 0 ? (
              <div className="lux-empty mx-5 mb-5 rounded-2xl px-4 py-8 text-center sm:mx-6">
                <p className="text-sm text-[#8fa0c2]">Aucun hôte inscrit pour le moment.</p>
              </div>
            ) : (
              <ul className="lux-scroll max-h-96 divide-y divide-white/6 overflow-y-auto">
                {data.recentHosts.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.04] sm:px-6">
                    <span
                      aria-hidden="true"
                      className="lux-num inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3d6fe0]/15 text-xs font-semibold text-[#a9c4ff] ring-1 ring-[#5c8af0]/25"
                    >
                      {(h.fullName ?? h.email).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {h.fullName ?? 'Sans nom'}
                        {!h.isActive && (
                          <span className="ml-2 text-[11px] font-semibold" style={{ color: '#f07d6a' }}>
                            · désactivé
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-[#8fa0c2]">{h.email}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="lux-chip">{planLabel(h.selectedPlan)}</span>
                      <span className="text-[11px] text-[#8fa0c2]">
                        {h.propertyCount} bien{h.propertyCount > 1 ? 's' : ''} · {formatDay(h.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ================= Rappel règle d'or ================= */}
        <section aria-label="Règle de gestion des prestataires" className="pb-4">
          <div className="rounded-2xl border border-[#2dd4bf]/25 bg-[#2dd4bf]/8 p-5">
            <div className="flex items-start gap-3">
              <span className="lux-dot mt-2 shrink-0" style={{ backgroundColor: '#2dd4bf' }} aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#86e9cb]">Règle d&apos;or — Prestataires</p>
                <p className="mt-1 text-xs leading-relaxed text-[#9fc4b8]">
                  Seul le Superadmin (vous) ajoute et géolocalise les prestataires. Les hôtes les consultent
                  depuis leur dashboard, et les voyageurs découvrent les expériences via le QR Hub.
                  Gestion complète : <span className="font-semibold">menu Prestataires</span> dans la barre latérale.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

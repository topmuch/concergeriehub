'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { useOverview, type ActivityItem } from '@/hooks/use-overview';
import { OnboardingWizard } from '@/components/airbnb/onboarding-wizard';
import { CoachWidget } from '@/components/airbnb/host/coach-widget';
import { relativeFrTime } from '@/lib/automations';
import { cn } from '@/lib/utils';

// =============================================================
// OverviewContent — page « Vue d'ensemble » du Dashboard Hôte
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
//
// • Design SIMPLE, LUXUEUX, PROFESSIONNEL — mode sombre BLEUTÉ
// • SANS ICÔNES : typographie (labels espacés, chiffres serif),
//   points colorés, filets — aucun lucide, aucun emoji
// • LES 6 KPI (données réelles via /api/airbnb/dashboard-kpis) :
//   1 MINIBAR (produits consommés + CA)          — fond or
//   2 CHECK-IN / CHECK-OUT (dates + compte à rebours) — fond saphir
//   3 CALENDRIER (clients en cours & à venir)    — fond améthyste
//   4 MÉNAGE (déjà faits / programmés)           — fond émeraude
//   5 DÉPART TARDIF à venir                      — fond corail
//   6 AVIS (positifs / négatifs)                 — fond rose
// • Toutes les sections existantes sont conservées (mêmes données,
//   même logique) : hero, invitations, arrivées/départs du jour,
//   activité récente, courbe 30 j, flux, actions rapides, modules,
//   wizard d'onboarding — REDESIGNÉES uniquement.
// =============================================================

// ---------- Couleurs du graphe (thème saphir) ----------
const SAPPHIRE = '#5c8af0';
const TEAL = '#2dd4bf';

// ---------- Types ----------
interface LuxKpis {
  minibar: {
    itemsMonth: number;
    revenueMonth: number;
    ordersMonth: number;
    itemsTotal: number;
    revenueTotal: number;
    ordersTotal: number;
    canSeeFinance: boolean;
  };
  stay: {
    kind: 'active' | 'upcoming';
    guestName: string;
    propertyName: string;
    checkIn: string;
    checkOut: string;
  } | null;
  calendar: {
    inProgress: number;
    upcoming: number;
    next: { guestName: string; propertyName: string; checkIn: string; checkOut: string } | null;
  };
  housekeeping: { done: number; scheduled: number };
  lateCheckouts: {
    upcoming: number;
    next: { guestName: string; propertyName: string; until: string | null } | null;
  };
  reviews: { positive: number; neutral: number; negative: number };
}

interface DayStatsResponse {
  scope: 'single' | 'all';
  property: { id: string; name: string } | null;
  stats: {
    propertiesActive: number;
    propertiesCount: number;
    staysInProgress: number;
    arrivalsToday: number;
    departuresToday: number;
    revenueThisMonth: number;
    ordersThisMonth: number;
    canSeeFinance: boolean;
  };
  today: {
    id: string;
    kind: 'arrival' | 'departure';
    guestName: string;
    propertyName: string;
    at: string;
    status: string;
    source: string;
  }[];
}

interface NotifItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

// ---------- Helpers ----------
function formatEur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

function longDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const fmtHour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtDayShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtDayHour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function sourceLabel(source: string): string {
  if (source === 'ICAL') return 'iCal';
  if (source === 'MANUAL') return 'Manuelle';
  return source.charAt(0) + source.slice(1).toLowerCase();
}

/** Statut de réservation → libellé + pastille colorée (sans badge à icône). */
function statusMeta(status: string): { label: string; dot: string } {
  switch (status) {
    case 'CONFIRMED':
      return { label: 'Confirmée', dot: '#34d399' };
    case 'PENDING':
      return { label: 'En attente', dot: '#fbbf24' };
    case 'COMPLETED':
      return { label: 'Terminée', dot: '#8fa0c2' };
    default:
      return { label: status.toLowerCase(), dot: '#8fa0c2' };
  }
}

/** Point coloré par type d'événement du flux d'activité. */
const ACTIVITY_DOT: Record<ActivityItem['type'], string> = {
  scan: '#5c8af0',
  order: '#34d399',
  booking: '#a78bfa',
  message: '#fbbf24',
};

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

function LuxSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-2xl bg-white/8', className)} />;
}

// ---------- Carte KPI « joyau » (SANS icône — le chiffre est le héros) ----------
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
  children?: React.ReactNode;
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
        <p className="luxkpi-value mt-2.5 truncate text-[30px] leading-none sm:text-[34px]">{value}</p>
      )}
      {children}
      {hint && !loading && <p className="relative mt-2.5 truncate text-[12px] leading-snug opacity-80">{hint}</p>}
    </motion.article>
  );
}

// =============================================================
export function OverviewContent() {
  const { userFirstName, invitations, properties, propertiesLoading, selectedId, onboardingCompleted, refreshProperties } =
    useHostContext();
  const { data, loading, error, refetch } = useOverview();
  const now = new Date();

  // ----- Les 6 KPI « SAPHIR LUXE » : /api/airbnb/dashboard-kpis -----
  const [lux, setLux] = useState<LuxKpis | null>(null);
  const [luxLoading, setLuxLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // ----- KPIs « journée » : /api/airbnb/dashboard-stats (real data) -----
  const [day, setDay] = useState<DayStatsResponse | null>(null);
  const [dayLoading, setDayLoading] = useState(true);

  // Horloge pour les comptes à rebours (mise à jour chaque minute,
  // après montage uniquement — anti-hydratation).
  const [tick, setTick] = useState<Date | null>(null);
  useEffect(() => {
    setTick(new Date());
    const id = setInterval(() => setTick(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (propertiesLoading) return;
    let cancelled = false;
    setLuxLoading(true);
    setDayLoading(true);
    (async () => {
      try {
        const qs = `?propertyId=${encodeURIComponent(selectedId)}`;
        const [resLux, resDay] = await Promise.all([
          fetch(`/api/airbnb/dashboard-kpis${qs}`, { cache: 'no-store' }),
          fetch(`/api/airbnb/dashboard-stats${qs}`, { cache: 'no-store' }),
        ]);
        if (resLux.ok) setLux((await resLux.json()) as LuxKpis);
        else setLux(null);
        if (resDay.ok) setDay((await resDay.json()) as DayStatsResponse);
        else setDay(null);
      } catch {
        if (!cancelled) {
          setLux(null);
          setDay(null);
        }
      } finally {
        if (!cancelled) {
          setLuxLoading(false);
          setDayLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, propertiesLoading, reloadKey]);

  // ----- Dernières notifications de l'utilisateur (section « Activité récente ») -----
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/airbnb/notifications?limit=8', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { notifications: NotifItem[] };
        if (!cancelled) setNotifs(json.notifications ?? []);
      } catch {
        if (!cancelled) setNotifs([]);
      } finally {
        if (!cancelled) setNotifsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // ----- Chantier ONBOARDING : assistant post-inscription (conservé) -----
  const [onboardingClosed, setOnboardingClosed] = useState(false);
  const onboardingTarget = useMemo(() => {
    if (propertiesLoading || onboardingClosed || onboardingCompleted) return null;
    if (typeof window !== 'undefined' && sessionStorage.getItem('ch-onboarding-dismissed') === '1') {
      return null;
    }
    const owned = properties.find((p) => p.isOwner);
    if (!owned) return null;
    return { propertyId: owned.id, name: owned.name, address: owned.address ?? '' };
  }, [properties, propertiesLoading, onboardingCompleted, onboardingClosed]);

  function finishOnboarding(completed: boolean) {
    setOnboardingClosed(true);
    if (completed) {
      toast.success('Votre logement est configuré');
      void refreshProperties();
      void refetch();
    }
  }

  function refreshAll() {
    void refetch();
    setReloadKey((k) => k + 1);
    toast.success('Données actualisées');
  }

  const kpiLoading = luxLoading || propertiesLoading;
  const today = day?.today ?? [];
  const totalReviews = lux ? lux.reviews.positive + lux.reviews.neutral + lux.reviews.negative : 0;

  // ---------- Contenu de la carte CHECK-IN / CHECK-OUT (séjour + compte à rebours) ----------
  const stayCard = (() => {
    if (kpiLoading) return null;
    if (!lux?.stay) {
      return { chip: undefined as string | undefined, hint: 'Aucun séjour programmé pour le moment.' };
    }
    const s = lux.stay;
    const isActive = s.kind === 'active';
    const target = isActive ? new Date(s.checkOut) : new Date(s.checkIn);
    const cd = tick ? countdownLabel(target, tick) : null;
    return {
      chip: cd ? (isActive ? `Départ dans ${cd}` : `Entrée dans ${cd}`) : undefined,
      hint: `${isActive ? 'Séjour en cours' : 'Prochain séjour'} — ${s.guestName} · ${s.propertyName}`,
    };
  })();

  return (
    <div className="lux -m-4 min-h-full p-4 pb-10 sm:-m-6 sm:p-6">
      <div className="lux-bg -m-4 min-h-full p-4 pb-10 sm:-m-6 sm:p-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
          {/* ═══════════ HERO — panneau AURA coloré (v6.0) ═══════════ */}
          <motion.section
            aria-label="Vue d'ensemble"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="lux-hero p-6 sm:p-8"
          >
            <div className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div className="min-w-0">
                <p className="lux-eyebrow" suppressHydrationWarning>
                  {longDateFr(now)}
                </p>
                <h1
                  className="lux-display mt-2 text-3xl font-semibold text-white sm:text-[40px]"
                  suppressHydrationWarning
                >
                  {greeting(now)}, {userFirstName}
                </h1>
                <p className="mt-2.5 max-w-xl text-sm text-[#8fa0c2] sm:text-[15px]" suppressHydrationWarning>
                  {data?.scope === 'single' && data.property ? (
                    <>
                      Activité de <span className="font-semibold text-white">{data.property.name}</span> — voici
                      l&apos;état de vos locations aujourd&apos;hui.
                    </>
                  ) : (
                    <>
                      Vue consolidée de vos {properties.length} propriétés — voici l&apos;état de vos locations
                      aujourd&apos;hui.
                    </>
                  )}
                </p>

                {/* Actions du hero — pilules typographiques */}
                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  <Link href="/airbnb/properties?new=1" className="lux-btn">
                    Nouvelle propriété
                  </Link>
                  <Link href="/airbnb/calendar" className="lux-btn lux-btn-gold">
                    Ajouter un séjour
                  </Link>
                  <Link href="/airbnb/menage" className="lux-btn-ghost">
                    Voir les tâches
                  </Link>
                  <button
                    type="button"
                    onClick={refreshAll}
                    disabled={loading || dayLoading || luxLoading}
                    className="lux-btn-ghost disabled:opacity-50"
                  >
                    Actualiser
                  </button>
                </div>
              </div>

              {/* Monogramme de la maison (sans icône — typographie seule) */}
              <div className="hidden shrink-0 items-center gap-3 sm:flex" aria-hidden="true">
                <div className="lux-rule w-10" />
                <span className="lux-display text-2xl text-[#e9c47c]">R</span>
              </div>
            </div>
          </motion.section>

          {/* ═══════════ Bannière invitations en attente (conservée) ═══════════ */}
          {invitations.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e9c47c]/30 bg-[#e9c47c]/8 px-4 py-3"
              role="status"
            >
              <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
              <p className="flex-1 text-sm text-[#f3d795]">
                <span className="font-semibold">
                  {invitations.length === 1 ? 'Une invitation en attente' : `${invitations.length} invitations en attente`}
                </span>{' '}
                — {invitations[0].property.name} ({roleLabel(invitations[0].role)})
                {invitations.length > 1 && ' et d’autres…'}
              </p>
              <Link href="/airbnb/team" className="lux-btn lux-btn-gold h-9 px-4 text-xs">
                Gérer mes invitations
              </Link>
            </motion.div>
          )}

          {/* ═══════════ Erreur API (conservée) ═══════════ */}
          {error && (
            <div className="lux-card flex flex-col items-center gap-3 p-6 text-center" role="alert">
              <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
              <p className="text-sm font-semibold text-white">{error}</p>
              <button type="button" onClick={() => void refetch()} className="lux-btn mt-1">
                Réessayer
              </button>
            </div>
          )}

          {/* ═══════════ LES 6 KPI — fonds colorés « joyaux » ═══════════ */}
          <section aria-label="Indicateurs clés" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* KPI 1 · MINIBAR — produits consommés & chiffre d'affaires */}
            <LuxKpiCard
              index={0}
              tone="gold"
              label="Minibar"
              loading={kpiLoading}
              value={
                lux?.minibar.canSeeFinance ? formatEur(lux.minibar.revenueMonth) : '—'
              }
              chip={
                lux?.minibar.canSeeFinance && lux.minibar.revenueTotal > 0
                  ? `Total ${formatEur(lux.minibar.revenueTotal)}`
                  : undefined
              }
              hint={
                lux?.minibar.canSeeFinance
                  ? `${lux.minibar.itemsMonth} produit${lux.minibar.itemsMonth > 1 ? 's' : ''} consommé${lux.minibar.itemsMonth > 1 ? 's' : ''} ce mois · ${lux.minibar.ordersMonth} commande${lux.minibar.ordersMonth > 1 ? 's' : ''}`
                  : 'Chiffres non visibles pour votre rôle'
              }
            />

            {/* KPI 2 · CHECK-IN / CHECK-OUT — séjour, dates & compte à rebours */}
            <LuxKpiCard
              index={1}
              tone="sapphire"
              label="Check-in — Check-out"
              loading={kpiLoading}
              value={stayCard ? 'Séjour' : '—'}
              chip={stayCard?.chip}
              hint={stayCard?.hint}
            >
              {lux?.stay && !kpiLoading && (
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

            {/* KPI 3 · CALENDRIER — clients en cours & à venir */}
            <LuxKpiCard
              index={2}
              tone="violet"
              label="Calendrier"
              loading={kpiLoading}
              value={lux ? `${lux.calendar.inProgress}` : '—'}
              chip={lux ? `${lux.calendar.upcoming} à venir` : undefined}
              hint={
                lux?.calendar.next
                  ? `Prochain : ${lux.calendar.next.guestName} — dès le ${fmtDayHour.format(new Date(lux.calendar.next.checkIn))}`
                  : 'Aucun client à venir'
              }
            />

            {/* KPI 4 · MÉNAGE — déjà faits / programmés */}
            <LuxKpiCard
              index={3}
              tone="emerald"
              label="Ménage"
              loading={kpiLoading}
              value={lux ? `${lux.housekeeping.done}` : '—'}
              chip={lux ? `${lux.housekeeping.scheduled} programmé${lux.housekeeping.scheduled > 1 ? 's' : ''}` : undefined}
              hint={
                lux && lux.housekeeping.done > 0
                  ? 'Rapports de ménage validés avec preuves'
                  : 'Les ménages réalisés et programmés apparaissent ici'
              }
            />

            {/* KPI 5 · DÉPART TARDIF à venir */}
            <LuxKpiCard
              index={4}
              tone="coral"
              label="Départ tardif"
              loading={kpiLoading}
              value={lux ? `${lux.lateCheckouts.upcoming}` : '—'}
              chip={lux && lux.lateCheckouts.upcoming > 0 ? 'à venir' : undefined}
              hint={
                lux?.lateCheckouts.next
                  ? `Prochain : ${lux.lateCheckouts.next.guestName}${lux.lateCheckouts.next.until ? ` — jusqu'à ${fmtDayHour.format(new Date(lux.lateCheckouts.next.until))}` : ''}`
                  : 'Aucun départ tardif programmé'
              }
            />

            {/* KPI 6 · AVIS — positifs & négatifs */}
            <LuxKpiCard
              index={5}
              tone="rose"
              label="Avis"
              loading={kpiLoading}
              value={lux ? `${lux.reviews.positive}` : '—'}
              chip={lux ? `${lux.reviews.negative} négatif${lux.reviews.negative > 1 ? 's' : ''}` : undefined}
              hint={
                lux && totalReviews > 0
                  ? `Avis positifs · ${lux.reviews.neutral} neutre${lux.reviews.neutral > 1 ? 's' : ''} sur ${totalReviews} au total`
                  : 'Les retours de vos invités apparaîtront ici'
              }
            />
          </section>

          {/* ═══════════ COACH ROOMSCAN — recommandations IA du jour (v5.4) ═══════════ */}
          <CoachWidget refreshKey={reloadKey} />

          {/* ═══════════ Arrivées & Départs du jour + Activité récente ═══════════ */}
          <section aria-label="Journée et notifications" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* ----- Arrivées & Départs du jour (real data) ----- */}
            <div className="lux-card flex flex-col p-5 sm:p-6 xl:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="lux-eyebrow">Programme du jour</h2>
                  <p className="lux-display mt-1 text-xl text-white" suppressHydrationWarning>
                    Arrivées &amp; départs
                  </p>
                </div>
                <Link href="/airbnb/calendar" className="lux-chip transition-colors hover:text-white">
                  Calendrier <span aria-hidden="true">→</span>
                </Link>
              </div>

              {kpiLoading ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <LuxSkeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : today.length === 0 ? (
                <div className="lux-empty flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl p-8 text-center">
                  <p className="lux-display text-lg text-white">Journée tranquille</p>
                  <p className="max-w-xs text-xs text-[#8fa0c2]">
                    Ni arrivée ni départ aujourd&apos;hui. Les réservations du calendrier apparaîtront ici.
                  </p>
                </div>
              ) : (
                <ul className="lux-scroll flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1">
                  {today.map((item, i) => {
                    const st = statusMeta(item.status);
                    const isArrival = item.kind === 'arrival';
                    return (
                      <motion.li
                        key={item.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.04 * i, duration: 0.25 }}
                        className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5"
                      >
                        <span className="lux-eyebrow w-10 shrink-0 text-center !text-[13px] !tracking-normal" style={{ color: isArrival ? '#a9c4ff' : '#86e9cb' }}>
                          {fmtHour.format(new Date(item.at))}
                        </span>
                        <span className="h-8 w-px shrink-0 bg-white/10" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{item.guestName}</p>
                          <p className="truncate text-xs text-[#8fa0c2]">
                            {item.propertyName} · {isArrival ? 'Arrivée' : 'Départ'} · {sourceLabel(item.source)}
                          </p>
                        </div>
                        <span className="lux-chip hidden shrink-0 sm:inline-flex">
                          <span className="lux-dot" style={{ backgroundColor: st.dot }} aria-hidden="true" />
                          {st.label}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ----- Activité récente : dernières notifications ----- */}
            <div className="lux-card flex flex-col p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="lux-eyebrow">Activité récente</h2>
                <span className="lux-chip">{notifsLoading ? '…' : notifs.length}</span>
              </div>
              {notifsLoading ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <LuxSkeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : notifs.length === 0 ? (
                <div className="lux-empty flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center">
                  <p className="lux-display text-lg text-white">Rien pour l&apos;instant</p>
                  <p className="text-xs text-[#8fa0c2]">Réservations, ménages et réclamations arriveront ici.</p>
                </div>
              ) : (
                <ul className="lux-scroll flex max-h-[320px] flex-col gap-1 overflow-y-auto pr-1">
                  {notifs.map((n) => (
                    <li
                      key={n.id}
                      className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <span
                        className="lux-dot mt-1.5 shrink-0"
                        style={{ backgroundColor: n.isRead ? 'rgba(143,160,194,0.4)' : '#5c8af0' }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{n.title}</p>
                        {n.body && <p className="line-clamp-2 text-xs text-[#8fa0c2]">{n.body}</p>}
                      </div>
                      <time
                        dateTime={n.createdAt}
                        className="shrink-0 text-[11px] text-[#8fa0c2]"
                        title={new Date(n.createdAt).toLocaleString('fr-FR')}
                      >
                        {relativeFrTime(new Date(n.createdAt))}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ═══════════ Graphique + Flux d'activité (conservés) ═══════════ */}
          <section aria-label="Activité et historique" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Graphique 30 jours */}
            <div className="lux-card p-5 xl:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="lux-eyebrow">Tendance</h2>
                  <p className="lux-display mt-1 text-xl text-white">Activité des 30 derniers jours</p>
                  <p className="mt-0.5 text-xs text-[#8fa0c2]">Scans de plaques et commandes invités</p>
                </div>
              </div>
              {loading || propertiesLoading ? (
                <LuxSkeleton className="h-[280px] w-full" />
              ) : (
                <div
                  className="h-[280px] w-full"
                  role="img"
                  aria-label="Courbe d'activité des 30 derniers jours : scans et commandes par jour"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.series ?? []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradScansLux" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={SAPPHIRE} stopOpacity={0.34} />
                          <stop offset="100%" stopColor={SAPPHIRE} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradOrdersLux" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={TEAL} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,170,214,0.14)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#8fa0c2' }}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(148,170,214,0.18)' }}
                        interval="preserveStartEnd"
                        minTickGap={24}
                      />
                      <YAxis
                        yAxisId="scans"
                        tick={{ fontSize: 11, fill: '#8fa0c2' }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        yAxisId="orders"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#8fa0c2' }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid rgba(148,170,214,0.25)',
                          backgroundColor: '#0d1530',
                          color: '#eef3fb',
                          boxShadow: '0 12px 32px rgba(2,6,18,0.6)',
                          fontSize: 13,
                        }}
                        cursor={{ stroke: 'rgba(148,170,214,0.3)' }}
                        formatter={(value: number | string, name: string) => [
                          String(value),
                          name === 'scans' ? 'Scans' : 'Commandes',
                        ]}
                      />
                      <Legend
                        formatter={(value: string) => (
                          <span className="text-xs font-medium text-[#8fa0c2]">
                            {value === 'scans' ? 'Scans de plaques' : 'Commandes invités'}
                          </span>
                        )}
                      />
                      <Area
                        yAxisId="scans"
                        type="monotone"
                        dataKey="scans"
                        stroke={SAPPHIRE}
                        strokeWidth={2}
                        fill="url(#gradScansLux)"
                        activeDot={{ r: 4, strokeWidth: 2, fill: '#0d1530' }}
                      />
                      <Area
                        yAxisId="orders"
                        type="monotone"
                        dataKey="orders"
                        stroke={TEAL}
                        strokeWidth={2}
                        fill="url(#gradOrdersLux)"
                        activeDot={{ r: 4, strokeWidth: 2, fill: '#0d1530' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Flux d'activité unifié (conservé) */}
            <div className="lux-card flex flex-col p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="lux-eyebrow">Flux d&apos;activité</h2>
                <span className="lux-chip">{data?.activity.length ?? 0}</span>
              </div>
              {loading || propertiesLoading ? (
                <div className="flex flex-col gap-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <LuxSkeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (data?.activity.length ?? 0) === 0 ? (
                <div className="lux-empty flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center">
                  <p className="lux-display text-lg text-white">Aucune activité</p>
                  <p className="text-xs text-[#8fa0c2]">Scans, commandes et réservations apparaîtront ici.</p>
                </div>
              ) : (
                <ul className="lux-scroll flex max-h-[300px] flex-col gap-1 overflow-y-auto pr-1">
                  {data?.activity.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <span
                        className="lux-dot mt-2 shrink-0"
                        style={{ backgroundColor: ACTIVITY_DOT[item.type] ?? '#8fa0c2' }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{item.title}</p>
                        {item.detail && <p className="truncate text-xs text-[#8fa0c2]">{item.detail}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {item.amount != null && (
                          <p className="lux-num text-sm font-semibold" style={{ color: '#86e9cb' }}>
                            {formatEur(item.amount)}
                          </p>
                        )}
                        <time
                          dateTime={item.at}
                          className="text-[11px] text-[#8fa0c2]"
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

          {/* ═══════════ Actions rapides (conservées — pilules typographiques) ═══════════ */}
          <section aria-label="Actions rapides">
            <h2 className="lux-eyebrow mb-3">Actions rapides</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {QUICK_ACTIONS.map((action, i) => (
                <motion.div
                  key={action.href}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.05 * i, duration: 0.25 }}
                >
                  <Link
                    href={action.href}
                    className="lux-card lux-card-hover group flex h-full items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/60"
                  >
                    <span
                      className="lux-dot shrink-0"
                      style={{ backgroundColor: action.dot }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 text-[13px] font-medium leading-tight text-white sm:text-sm">
                      {action.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-[#8fa0c2] transition-transform group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ═══════════ Modules actifs (aperçu QR — conservé) ═══════════ */}
          {!loading && data && data.modules.length > 0 && (
            <section aria-label="Modules du bien">
              <h2 className="lux-eyebrow mb-3">
                Modules {data.scope === 'single' && data.property ? `— ${data.property.name}` : '(toutes propriétés)'}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {data.modules.map((m, i) => (
                  <motion.div
                    key={m.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.04 * i, duration: 0.25 }}
                    className="lux-card lux-card-hover p-4"
                  >
                    <p className="text-sm font-semibold text-white">{m.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-[#8fa0c2]">{m.description}</p>
                    <p className="mt-2.5 text-xs font-semibold" style={{ color: '#e9c47c' }}>
                      {m.qrCount} QR actif{m.qrCount > 1 ? 's' : ''}
                      {m.nearbyProviders != null && m.qrCount > 0 && (
                        <> · {m.nearbyProviders} prestataire{m.nearbyProviders > 1 ? 's' : ''} à proximité</>
                      )}
                    </p>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* ═══════════ Bande secondaire (scans, note, commandes — données conservées) ═══════════ */}
          <section aria-label="Autres indicateurs" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                label: 'Scans ce mois',
                value: data?.stats ? data.stats.scansThisMonth.toLocaleString('fr-FR') : '—',
                hint: data?.stats?.lastScanAt ? `Dernier scan ${relativeFrTime(new Date(data.stats.lastScanAt))}` : 'Aucun scan pour l’instant',
              },
              {
                label: 'Note moyenne',
                value: data?.stats?.avgRating != null ? `${data.stats.avgRating.toFixed(1).replace('.', ',')}/5` : '—',
                hint: data?.stats ? `${data.stats.reviewsCount} avis service${data.stats.reviewsCount > 1 ? 's' : ''}` : undefined,
              },
              {
                label: 'Commandes ce mois',
                value: data?.stats ? String(data.stats.ordersThisMonth) : '—',
                hint: 'Commandes invités payées',
              },
            ].map((s) => (
              <div key={s.label} className="lux-card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  {loading || propertiesLoading ? (
                    <LuxSkeleton className="h-6 w-24" />
                  ) : (
                    <p className="lux-num truncate text-2xl text-white">{s.value}</p>
                  )}
                  <p className="lux-eyebrow mt-1">{s.label}</p>
                  {s.hint && !loading && !propertiesLoading && (
                    <p className="mt-0.5 truncate text-[11px] text-[#8fa0c2]">{s.hint}</p>
                  )}
                </div>
                <span className="lux-dot" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
              </div>
            ))}
          </section>

          {/* ═══════════ Wizard d'onboarding (post-inscription — conservé) ═══════════ */}
          {onboardingTarget && (
            <OnboardingWizard
              open
              propertyId={onboardingTarget.propertyId}
              initialName={onboardingTarget.name}
              initialAddress={onboardingTarget.address}
              onFinished={finishOnboarding}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const QUICK_ACTIONS: { href: string; label: string; dot: string }[] = [
  { href: '/airbnb/properties?new=1', label: 'Ajouter une propriété', dot: '#5c8af0' },
  { href: '/airbnb/plates?new=1', label: 'Générer une plaque QR', dot: '#2dd4bf' },
  { href: '/airbnb/orders', label: 'Voir les commandes', dot: '#86e9cb' },
  { href: '/airbnb/automations', label: 'Automatisations', dot: '#cdb6ff' },
];

function roleLabel(role: string): string {
  switch (role) {
    case 'OWNER': return 'propriétaire';
    case 'MANAGER': return 'manager';
    case 'CLEANER': return 'ménage';
    case 'MAINTENANCE': return 'maintenance';
    default: return role.toLowerCase();
  }
}

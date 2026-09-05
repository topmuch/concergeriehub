'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  QrCode,
  ReceiptText,
  Users,
} from 'lucide-react';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingWizard } from '@/components/airbnb/onboarding-wizard';
import { cn } from '@/lib/utils';
import { formatEur, propertyTypeMeta } from '@/lib/b2b';

// =============================================================
// HostOverviewContent — Dashboard Hôte « Travl » (vue d'ensemble).
// Blocs du modèle : 4 cartes KPI à tuiles, planning calendrier +
// prochaines arrivées, statistiques par bien à onglets, cartes
// vert foncé à progression, totaux, bannière d'action.
// Données réelles : /api/airbnb/properties (portefeuille existant).
// Le wizard d'onboarding post-inscription est préservé ici.
// =============================================================

/* ---------- Palette modèle ---------- */
const CORAL = '#EE4B35';
const GREEN_DARK = '#165949';

interface PortfolioStats {
  occupancyRate: number;
  bookedNights: number;
  upcomingBookings: number;
  nextBooking: { guestName: string; checkIn: string; checkOut: string } | null;
  scans30d: number;
  lastScanAt: string | null;
  upsellRevenue30d: number;
  upsellOrders30d: number;
  qrCount: number;
  membersCount: number;
  pendingInvites: number;
  unreadGuestMessages: number;
}

interface PortfolioProperty {
  id: string;
  name: string;
  propertyType: string;
  address: string | null;
  isActive: boolean;
  qrHubSlug: string | null;
  myRole: string;
  isOwner: boolean;
  stats: PortfolioStats;
}

interface PortfolioData {
  user: { firstName: string; onboardingCompleted: boolean };
  plan: {
    planId: string | null;
    planName: string;
    maxProperties: number;
    isPro: boolean;
    ownedCount: number;
    canAddProperty: boolean;
  };
  properties: PortfolioProperty[];
  totals: {
    propertiesCount: number;
    scans30d: number;
    upsellRevenue30d: number;
    avgOccupancy: number;
    qrCount: number;
  };
  invitations: unknown[];
}

/* ---------- Carte KPI (tuile icône + valeur + libellé) ---------- */
function KpiTile({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Building2;
  value: string;
  label: string;
}) {
  return (
    <Card className="flex items-center gap-4 rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <span
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FDECE8]"
      >
        <Icon className="h-7 w-7 text-[#EE4B35]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-2xl font-extrabold tabular-nums text-slate-900 sm:text-3xl">
          {value}
        </span>
        <span className="block truncate text-sm text-slate-500">{label}</span>
      </span>
    </Card>
  );
}

/* ---------- Mini total (rangée du bas) ---------- */
function TotalStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Building2;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className="mb-1 h-5 w-5 text-[#EE4B35]" aria-hidden="true" />
      <p className="text-xl font-extrabold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
    </div>
  );
}

/* ---------- Carte verte à progression (modèle) ---------- */
function GreenStat({ label, value, progress }: { label: string; value: string; progress: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="flex-1 rounded-2xl bg-[#165949] p-4 text-white">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-white/85">{label}</p>
        <p className="text-lg font-extrabold tabular-nums">{value}</p>
      </div>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- Composant principal ---------- */
export function HostOverviewContent() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState<Date | null>(null);
  const [metric, setMetric] = useState<'scans' | 'revenue'>('scans');

  // ----- Onboarding (logique préservée de PortfolioContent) -----
  const [onboardingTarget, setOnboardingTarget] = useState<
    { propertyId: string; name: string; address: string } | null
  >(null);
  const [onboardingClosed, setOnboardingClosed] = useState(false);

  useEffect(() => {
    setMonth(new Date()); // après montage : évite tout écart d'hydratation
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/airbnb/properties');
      if (res.status === 401) {
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error('http');
      setData((await res.json()) as PortfolioData);
    } catch {
      setError('Impossible de charger le tableau de bord. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data || onboardingClosed || onboardingTarget) return;
    if (data.user.onboardingCompleted) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem('ch-onboarding-dismissed') === '1')
      return;
    const owned = data.properties.find((p) => p.isOwner);
    if (!owned) return;
    setOnboardingTarget({ propertyId: owned.id, name: owned.name, address: owned.address ?? '' });
  }, [data, onboardingClosed, onboardingTarget]);

  function handleOnboardingFinished(completed: boolean) {
    setOnboardingTarget(null);
    setOnboardingClosed(true);
    if (completed) {
      toast.success('Votre logement est configuré 🎉');
      load();
    } else {
      sessionStorage.setItem('ch-onboarding-dismissed', '1');
    }
  }

  /* ---------- Données dérivées ---------- */
  const properties = data?.properties ?? [];
  const totals = data?.totals;

  const arrivals = useMemo(() => {
    return properties
      .filter((p) => p.stats.nextBooking)
      .map((p) => ({ property: p, booking: p.stats.nextBooking! }))
      .sort((a, b) => a.booking.checkIn.localeCompare(b.booking.checkIn))
      .slice(0, 4);
  }, [properties]);

  const chartData = useMemo(
    () =>
      properties.map((p) => ({
        name: p.name.length > 10 ? `${p.name.slice(0, 9)}…` : p.name,
        scans: p.stats.scans30d,
        revenue: p.stats.upsellRevenue30d,
      })),
    [properties],
  );

  const chartConfig = {
    scans: { label: 'Scans (30 j)', color: GREEN_DARK },
    revenue: { label: 'Revenus (30 j)', color: CORAL },
  } satisfies ChartConfig;

  const membersTotal = properties.reduce((acc, p) => acc + p.stats.membersCount, 0);
  const orders30d = properties.reduce((acc, p) => acc + p.stats.upsellOrders30d, 0);
  const activeCount = properties.filter((p) => p.isActive).length;
  const isLimitedMember = Boolean(
    data && properties.length > 0 && !properties.some((p) => p.isOwner || p.myRole === 'MANAGER'),
  );

  /* ---------- Événements du calendrier (arrivées / départs connus) ---------- */
  const calendarEvents = useMemo(() => {
    const map = new Map<
      string,
      { checkIn: number; checkOut: number; guest: string; property: string }
    >();
    for (const { property, booking } of arrivals) {
      for (const iso of [booking.checkIn, booking.checkOut]) {
        const key = format(new Date(iso), 'yyyy-MM-dd');
        const entry = map.get(key) ?? {
          checkIn: 0,
          checkOut: 0,
          guest: booking.guestName,
          property: property.name,
        };
        if (isSameDay(new Date(iso), new Date(booking.checkIn))) entry.checkIn += 1;
        else entry.checkOut += 1;
        map.set(key, entry);
      }
    }
    return map;
  }, [arrivals]);

  /* ---------- Grille du calendrier (semaines commençant lundi) ---------- */
  const calendarDays = useMemo(() => {
    if (!month) return [];
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    });
  }, [month]);

  /* ---------- Chargements / erreurs ---------- */
  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6" aria-busy="true">
        <Skeleton className="h-9 w-64 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Skeleton className="h-[480px] rounded-2xl lg:col-span-3" />
          <Skeleton className="h-[480px] rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !data || !totals) {
    return (
      <div className="mx-auto flex w-full max-w-7xl justify-center px-4 py-16 sm:px-6">
        <Card className="w-full max-w-md p-8 text-center">
          <p className="text-3xl" aria-hidden="true">
            😵
          </p>
          <p className="mt-2 font-semibold text-slate-900">Erreur de chargement</p>
          <p className="mt-1 text-sm text-slate-600">{error || 'Données indisponibles'}</p>
          <Button
            onClick={load}
            className="mt-4 bg-[#EE4B35] text-white hover:bg-[#D64330]"
          >
            Réessayer
          </Button>
        </Card>
      </div>
    );
  }

  const greeting = data.user.firstName ? `Bonjour, ${data.user.firstName} 👋` : 'Bonjour 👋';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6">
      {/* ---------- Salutation ---------- */}
      <section aria-labelledby="host-greeting">
        <h2 id="host-greeting" className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
          {greeting}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Voici l&apos;activité de votre portfolio de locations.
        </p>
      </section>

      {/* ---------- Invitations en attente (rappel) ---------- */}
      {data.invitations.length > 0 && (
        <Link
          href="/airbnb/dashboard/portfolio"
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100"
        >
          <span aria-hidden="true" className="text-xl">
            ✉️
          </span>
          <p className="flex-1 text-sm font-semibold text-amber-800">
            {data.invitations.length > 1
              ? `Vous avez ${data.invitations.length} invitations d'équipe en attente`
              : 'Vous avez une invitation d\u2019équipe en attente'}
          </p>
          <ArrowRight className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        </Link>
      )}

      {/* ================= KPI ================= */}
      <section
        aria-label="Indicateurs clés"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiTile icon={Building2} value={String(totals.propertiesCount)} label="Biens gérés" />
        <KpiTile icon={QrCode} value={String(totals.scans30d)} label="Scans de plaques (30 j)" />
        <KpiTile
          icon={ReceiptText}
          value={formatEur(totals.upsellRevenue30d)}
          label="Revenus upsell (30 j)"
        />
        <KpiTile
          icon={CalendarDays}
          value={`${Math.round(totals.avgOccupancy * 100)} %`}
          label="Occupation moyenne"
        />
      </section>

      {/* ================= Planning + Statistiques ================= */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* ----- Planning des séjours ----- */}
        <Card className="rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-extrabold text-slate-900">Planning des séjours</h3>
            {month && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Mois précédent"
                  onClick={() => setMonth(startOfMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="min-w-36 text-center text-sm font-bold capitalize text-slate-900">
                  {format(month, 'MMMM yyyy', { locale: fr })}
                </p>
                <button
                  type="button"
                  aria-label="Mois suivant"
                  onClick={() => setMonth(startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Calendrier */}
          <div className="mt-4">
            {!month ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((d) => (
                    <p key={d} className="py-1 text-xs font-semibold text-slate-400">
                      {d}
                    </p>
                  ))}
                  {calendarDays.map((day) => {
                    const inMonth = isSameMonth(day, month);
                    const key = format(day, 'yyyy-MM-dd');
                    const ev = calendarEvents.get(key);
                    return (
                      <div
                        key={key}
                        className={cn(
                          'relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm sm:h-10 sm:w-10',
                          !inMonth && 'text-slate-300',
                          inMonth && !ev && 'text-slate-700',
                          ev && inMonth && 'bg-[#FDECE8] font-bold text-[#D64330]',
                          isToday(day) && 'bg-[#EE4B35] font-bold text-white',
                        )}
                        title={ev ? `${ev.property} — ${ev.guest}` : undefined}
                      >
                        {format(day, 'd')}
                        {ev && !isToday(day) && (
                          <span className="absolute bottom-0.5 flex gap-0.5" aria-hidden="true">
                            {ev.checkIn > 0 && (
                              <span className="h-1 w-1 rounded-full bg-[#EE4B35]" />
                            )}
                            {ev.checkOut > 0 && (
                              <span className="h-1 w-1 rounded-full bg-[#165949]" />
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#EE4B35]" aria-hidden="true" />
                    Arrivée
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#165949]" aria-hidden="true" />
                    Départ
                  </span>
                </p>
              </>
            )}
          </div>

          {/* Prochaines arrivées */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-sm font-bold text-slate-900">Prochaines arrivées</p>
            {arrivals.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Aucune arrivée planifiée — connectez vos séjours pour voir le planning se remplir.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {arrivals.map(({ property, booking }) => {
                  const meta = propertyTypeMeta(property.propertyType);
                  const nights = Math.max(
                    1,
                    Math.round(
                      (new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) /
                        86_400_000,
                    ),
                  );
                  const inDays = Math.ceil(
                    (new Date(booking.checkIn).getTime() - Date.now()) / 86_400_000,
                  );
                  return (
                    <li key={property.id} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl"
                      >
                        {meta.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{property.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {booking.guestName} ·{' '}
                          {inDays <= 0
                            ? 'séjour en cours'
                            : `dans ${inDays} jour${inDays > 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-[#EE4B35] px-2.5 py-1.5 text-xs font-bold text-white">
                        {nights} nuit{nights > 1 ? 's' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              href="/airbnb/dashboard/portfolio"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#EE4B35] hover:text-[#D64330]"
            >
              Voir le portfolio
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Card>

        {/* ----- Statistiques par bien ----- */}
        <Card className="flex flex-col rounded-2xl border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-extrabold text-slate-900">Statistiques</h3>
            <div role="tablist" aria-label="Métrique affichée" className="flex items-center gap-4">
              {(
                [
                  { key: 'scans', label: 'Scans' },
                  { key: 'revenue', label: 'Revenus' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={metric === t.key}
                  onClick={() => setMetric(t.key)}
                  className={cn(
                    'border-b-2 pb-1 text-sm font-semibold transition-colors',
                    metric === t.key
                      ? 'border-[#EE4B35] text-slate-900'
                      : 'border-transparent text-slate-400 hover:text-slate-600',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Légende type modèle */}
          <div className="mt-4 flex items-center gap-6">
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-sm"
                style={{ background: metric === 'scans' ? GREEN_DARK : CORAL }}
              />
              {metric === 'scans' ? 'Scans 30 j' : 'Revenus 30 j'}
              <strong className="ml-1 font-extrabold tabular-nums text-slate-900">
                {metric === 'scans'
                  ? totals.scans30d
                  : formatEur(totals.upsellRevenue30d)}
              </strong>
            </span>
          </div>

          {/* Graphique */}
          <div className="mt-2">
            {properties.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">
                Ajoutez un bien pour voir vos statistiques.
              </p>
            ) : (
              <ChartContainer config={chartConfig} className="h-56 w-full sm:h-64">
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={11}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey={metric}
                    fill={`var(--color-${metric})`}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={38}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </div>

          {/* Cartes vertes à progression */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <GreenStat
              label="Biens actifs"
              value={`${activeCount}/${properties.length}`}
              progress={properties.length ? (activeCount / properties.length) * 100 : 0}
            />
            <GreenStat
              label={`Plan ${data.plan.planName}`}
              value={`${data.plan.ownedCount}/${data.plan.maxProperties}`}
              progress={(data.plan.ownedCount / Math.max(1, data.plan.maxProperties)) * 100}
            />
          </div>
        </Card>
      </div>

      {/* ================= Totaux ================= */}
      <Card className="rounded-2xl border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <TotalStat icon={Building2} value={String(totals.propertiesCount)} label="Total biens" />
          <TotalStat icon={KeyRound} value={String(totals.qrCount)} label="Total QR actifs" />
          <TotalStat icon={Users} value={String(membersTotal)} label="Membres d'équipe" />
          <TotalStat icon={ReceiptText} value={String(orders30d)} label="Commandes invités (30 j)" />
        </div>
      </Card>

      {/* ================= Bannière d'action ================= */}
      <Card className="flex flex-col items-start justify-between gap-3 rounded-2xl border-slate-200/80 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div className="min-w-0">
          {isLimitedMember ? (
            <>
              <h3 className="text-base font-extrabold text-slate-900">
                Consultez vos interventions assignées
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                Planning, statuts et notes des logements où vous intervenez.
              </p>
            </>
          ) : data.plan.isPro ? (
            <>
              <h3 className="text-base font-extrabold text-slate-900">
                Ajoutez un bien et générez sa plaque QR en 3 minutes
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                Adresse, type, configuration Wi-Fi — vos invités scannent, tout est prêt.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-extrabold text-slate-900">
                Passez à l&apos;offre Pro — 10 biens, équipe et automatisations
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                16,50 €/mois facturés 199 €/an — résiliable à tout moment.
              </p>
            </>
          )}
        </div>
        <Link
          href={
            isLimitedMember
              ? '/airbnb/dashboard/portfolio'
              : data.plan.isPro
                ? '/airbnb/dashboard/portfolio'
                : '/airbnb/billing'
          }
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#165949] px-5 text-sm font-bold text-white transition-all hover:bg-[#114538] hover:shadow-lg"
        >
          {isLimitedMember
            ? 'Mes interventions'
            : data.plan.isPro
              ? 'Ajouter un bien'
              : 'Découvrir Pro'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Card>

      {/* ---------- Wizard d'onboarding (post-inscription) ---------- */}
      {onboardingTarget && (
        <OnboardingWizard
          open
          propertyId={onboardingTarget.propertyId}
          initialName={onboardingTarget.name}
          initialAddress={onboardingTarget.address}
          onFinished={handleOnboardingFinished}
        />
      )}
    </div>
  );
}

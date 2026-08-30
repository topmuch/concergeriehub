'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  BarChart3,
  ScanLine,
  TrendingUp,
  CalendarDays,
  CalendarRange,
  Monitor,
  Smartphone,
  Globe,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface ScanStats {
  totalScans: number;
  scansToday: number;
  scansThisWeek: number;
  scansThisMonth: number;
  dailyScans: { date: string; count: number }[];
  recentScans: { id: string; createdAt: string; userAgent: string; locale: string }[];
  topLocales: { locale: string; count: number }[];
}

interface HomeOption {
  id: string;
  name: string;
}

interface ScanAnalyticsProps {
  homeId: string;
  qrCodeId?: string;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function getLocaleFlag(locale: string): string {
  const flags: Record<string, string> = {
    fr: '🇫🇷',
    en: '🇬🇧',
    es: '🇪🇸',
    de: '🇩🇪',
    nl: '🇳🇱',
    it: '🇮🇹',
    pt: '🇵🇹',
    ar: '🇸🇦',
    zh: '🇨🇳',
    ja: '🇯🇵',
    ko: '🇰🇷',
    ru: '🇷🇺',
    pl: '🇵🇱',
    tr: '🇹🇷',
    br: '🇧🇷',
    ca: '🇨🇦',
    us: '🇺🇸',
    gb: '🇬🇧',
    be: '🇧🇪',
    ch: '🇨🇭',
  };
  return flags[locale?.toLowerCase()?.split('-')[0] || ''] || '🌐';
}

function isMobileUA(ua: string): boolean {
  if (!ua) return false;
  return /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'à l\'instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffHour < 24) return `il y a ${diffHour}h`;
  if (diffDay < 7) return `il y a ${diffDay}j`;
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ---------------------------------------------------------------------------
//  KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  title,
  value,
  icon,
  gradient,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
  loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden border-0 shadow-md">
      <div className={`absolute inset-0 ${gradient} opacity-10`} />
      <CardContent className="relative p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="mt-1 h-8 w-20" />
            ) : (
              <p className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">{value.toLocaleString('fr-FR')}</p>
            )}
          </div>
          <div className={`rounded-xl p-2.5 ${gradient} text-white shadow-lg`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  Main Component
// ---------------------------------------------------------------------------

export function ScanAnalytics({ homeId: initialHomeId, qrCodeId }: ScanAnalyticsProps) {
  const [homeId, setHomeId] = useState(initialHomeId);
  const [homes, setHomes] = useState<HomeOption[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch homes on mount
  useEffect(() => {
    async function fetchHomes() {
      try {
        const res = await fetch('/api/client/homes');
        const data = await res.json();
        if (data.homes) {
          setHomes(data.homes.map((h: { id: string; name: string }) => ({ id: h.id, name: h.name })));
        }
      } catch {
        // silently fail
      }
    }
    fetchHomes();
  }, []);

  // Fetch stats when homeId or qrCodeId changes
  useEffect(() => {
    if (!homeId) return;
    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ homeId });
        if (qrCodeId) params.set('qrCodeId', qrCodeId);
        const res = await fetch(`/api/client/scan-stats?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError('Erreur lors du chargement des statistiques');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [homeId, qrCodeId]);

  const chartData = stats?.dailyScans.map((d) => ({
    ...d,
    label: formatDateShort(d.date),
  })) ?? [];

  const localeChartData = stats?.topLocales.map((l) => ({
    ...l,
    name: l.locale.toUpperCase(),
    flag: getLocaleFlag(l.locale),
  })) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <BarChart3 className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Statistiques de Scan</h2>
            <p className="text-muted-foreground text-sm">Suivez les scans de vos QR codes en temps réel</p>
          </div>
        </div>
        {homes.length > 1 && !qrCodeId && (
          <Select value={homeId} onValueChange={setHomeId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Sélectionner une maison" />
            </SelectTrigger>
            <SelectContent>
              {homes.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-full bg-destructive/10 p-2">
              <BarChart3 className="h-5 w-5 text-destructive" />
            </div>
            <p className="text-sm text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total des scans"
          value={stats?.totalScans ?? 0}
          icon={<ScanLine className="h-5 w-5" />}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
          loading={loading}
        />
        <KpiCard
          title="Aujourd\'hui"
          value={stats?.scansToday ?? 0}
          icon={<TrendingUp className="h-5 w-5" />}
          gradient="bg-gradient-to-br from-amber-500 to-amber-700"
          loading={loading}
        />
        <KpiCard
          title="Cette semaine"
          value={stats?.scansThisWeek ?? 0}
          icon={<CalendarDays className="h-5 w-5" />}
          gradient="bg-gradient-to-br from-sky-500 to-sky-700"
          loading={loading}
        />
        <KpiCard
          title="Ce mois"
          value={stats?.scansThisMonth ?? 0}
          icon={<CalendarRange className="h-5 w-5" />}
          gradient="bg-gradient-to-br from-violet-500 to-violet-700"
          loading={loading}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Scans Area Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Scans quotidiens</CardTitle>
            <CardDescription>30 derniers jours</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scanGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      fontSize: '13px',
                    }}
                    labelFormatter={(label) => `📅 ${label}`}
                    formatter={(value: number) => [`${value} scan(s)`, 'Scans']}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#scanGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Locales Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Langues des visiteurs</CardTitle>
            <CardDescription>Top 10 des locales détectées</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : localeChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[260px] text-center">
                <Globe className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Aucune donnée de locale</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={localeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      fontSize: '13px',
                    }}
                    formatter={(value: number, _name: string, props: { payload: { flag: string } }) => [
                      `${value} scan(s)`,
                      `${props.payload.flag} ${props.payload.name}`,
                    ]}
                  />
                  <Bar
                    dataKey="count"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Scans Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Scans récents</CardTitle>
          <CardDescription>20 derniers scans enregistrés</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !stats?.recentScans.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ScanLine className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Aucun scan enregistré pour le moment</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead className="w-[60px]">Appareil</TableHead>
                    <TableHead className="w-[60px]">Langue</TableHead>
                    <TableHead>User Agent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentScans.map((scan) => {
                    const mobile = isMobileUA(scan.userAgent);
                    return (
                      <TableRow key={scan.id}>
                        <TableCell className="text-sm font-medium">
                          {relativeTime(scan.createdAt)}
                        </TableCell>
                        <TableCell>
                          {mobile ? (
                            <div className="flex items-center gap-1.5 text-sky-600">
                              <Smartphone className="h-4 w-4" />
                              <span className="text-xs hidden sm:inline">Mobile</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Monitor className="h-4 w-4" />
                              <span className="text-xs hidden sm:inline">Desktop</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-lg" title={scan.locale}>
                            {getLocaleFlag(scan.locale)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] sm:max-w-[300px] lg:max-w-none truncate">
                          {scan.userAgent || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import {
  Layers,
  QrCode,
  CheckCircle2,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Fallback chart colors
const CHART_COLORS = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#14b8a6'];

const PIE_COLORS = ['#10b981', '#6b7280', '#ef4444', '#a3a3a3'];

interface StatsData {
  totalBatches: number;
  totalPhysicalQr: number;
  activatedQr: number;
  totalUsers: number;
  activationTrend: { date: string; count: number }[];
  moduleDistribution: { name: string; count: number }[];
  qrStatusDistribution: { name: string; value: number }[];
  trends?: {
    batches: number;
    physicalQr: number;
    activatedQr: number;
    users: number;
  };
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  trend?: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">
              {value.toLocaleString('fr-FR')}
            </p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                {trend >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={
                    trend >= 0 ? 'text-emerald-600' : 'text-red-500'
                  }
                >
                  {trend >= 0 ? '+' : ''}
                  {trend}%
                </span>
                <span className="text-muted-foreground">vs mois dernier</span>
              </div>
            )}
          </div>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}15` }}
          >
            <Icon className="h-6 w-6" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-12 w-12 rounded-xl" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

function StatCards({ stats }: { stats: StatsData }) {
  const trends = stats.trends;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Lots"
        value={stats.totalBatches}
        icon={Layers}
        trend={trends?.batches}
        color={CHART_COLORS[0]}
      />
      <StatCard
        title="QR Physiques"
        value={stats.totalPhysicalQr}
        icon={QrCode}
        trend={trends?.physicalQr}
        color={CHART_COLORS[1]}
      />
      <StatCard
        title="QR Activés"
        value={stats.activatedQr}
        icon={CheckCircle2}
        trend={trends?.activatedQr}
        color={CHART_COLORS[2]}
      />
      <StatCard
        title="Utilisateurs"
        value={stats.totalUsers}
        icon={Users}
        trend={trends?.users}
        color={CHART_COLORS[3]}
      />
    </div>
  );
}

function ActivationTrendChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Évolution des activations (30 jours)</CardTitle>
          <CardDescription>
            Nombre d&apos;activations de QR codes par jour
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            <BarChart3 className="mr-2 h-5 w-5" />
            Aucune donnée disponible
          </div>
        </CardContent>
      </Card>
    );
  }

  const formattedData = data.map((d) => ({
    ...d,
    date: d.date
      ? new Date(d.date).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'short',
        })
      : d.date,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Évolution des activations (30 jours)</CardTitle>
        <CardDescription>
          Nombre d&apos;activations de QR codes par jour
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="count"
              name="Activations"
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS[0] }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ModuleDistributionChart({
  data,
}: {
  data: { name: string; count: number }[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Répartition par type de module</CardTitle>
          <CardDescription>
            Distribution des QR codes par catégorie de module
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            <BarChart3 className="mr-2 h-5 w-5" />
            Aucune donnée disponible
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Répartition par type de module</CardTitle>
        <CardDescription>
          Distribution des QR codes par catégorie de module
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
              }}
            />
            <Legend />
            <Bar
              dataKey="count"
              name="Quantité"
              radius={[4, 4, 0, 0]}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function QrStatusPieChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statut des QR codes</CardTitle>
          <CardDescription>
            Répartition des QR codes par statut actuel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            Aucune donnée disponible
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statut des QR codes</CardTitle>
        <CardDescription>
          Répartition des QR codes par statut actuel
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
              }}
              formatter={(value: number) => [value.toLocaleString('fr-FR'), 'Quantité']}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function AdminStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/stats');
        if (!res.ok) throw new Error('Erreur lors du chargement des statistiques');
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <StatCardsSkeleton />
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
        <h3 className="text-lg font-medium">Erreur de chargement</h3>
        <p className="mt-1 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <StatCards stats={stats} />

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ActivationTrendChart data={stats.activationTrend ?? []} />
        <ModuleDistributionChart data={stats.moduleDistribution ?? []} />
      </div>

      {/* Pie Chart - Full Width */}
      <QrStatusPieChart data={stats.qrStatusDistribution ?? []} />
    </div>
  );
}

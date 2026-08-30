'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowUpRight,
  TrendingUp,
  Eye,
  DoorOpen,
  QrCode,
  LayoutDashboard,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';

interface HomeData {
  id: string;
  name: string;
  _count?: { rooms: number; qrCodes: number };
}

interface ScanStats {
  totalScans: number;
  scansToday: number;
  scansThisWeek: number;
  scansThisMonth: number;
  dailyScans: { date: string; count: number }[];
}

export function ClientDashboard() {
  const [homes, setHomes] = useState<HomeData[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrCount, setQrCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const homesRes = await fetch('/api/client/homes');
      const homesData = await homesRes.json();
      const homesList = homesData.homes || [];
      setHomes(homesList);

      const homeId = homesList[0]?.id;
      if (homeId) {
        const [qrRes, statsRes] = await Promise.all([
          fetch(`/api/client/qr-codes?homeId=${homeId}`).then(r => r.json()),
          fetch(`/api/client/scan-stats?homeId=${homeId}`).then(r => r.json()),
        ]);
        setQrCount((qrRes.qrCodes || []).length);
        if (statsRes.totalScans !== undefined) {
          setStats(statsRes);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const homeName = homes[0]?.name || 'votre espace';
  const totalQr = homes.reduce((acc, h) => acc + (h._count?.qrCodes || 0), 0) || qrCount;
  const totalRooms = homes.reduce((acc, h) => acc + (h._count?.rooms || 0), 0);

  // Mini chart data - last 14 days
  const chartData = (stats?.dailyScans || []).slice(-14).map(d => ({
    name: new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 2),
    scans: d.count,
  }));

  const hasAnyData = totalQr > 0 || (stats?.totalScans ?? 0) > 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full max-w-lg rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Hero - Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Bonjour 👋</p>
          <h1 className="text-2xl font-bold tracking-tight">{homeName}</h1>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Scans Hub - Hero card */}
        <Card className="rounded-2xl border-0 bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg shadow-violet-500/20">
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-white/70 uppercase tracking-wider">Scans Hub</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">{stats?.totalScans ?? 0}</p>
              {stats && stats.scansToday > 0 && (
                <p className="text-xs text-white/60 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  +{stats.scansToday} aujourd&apos;hui
                </p>
              )}
            </div>
            <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Eye className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Pièces */}
        <Card className="rounded-2xl">
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pièces</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">{totalRooms}</p>
              <p className="text-xs text-muted-foreground mt-1">{homes.length} espace{homes.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <DoorOpen className="h-5 w-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>

        {/* Modules */}
        <Card className="rounded-2xl">
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Modules</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">{totalQr}</p>
              <p className="text-xs text-muted-foreground mt-1">{stats?.scansThisMonth ?? 0} scans ce mois</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center">
              <QrCode className="h-5 w-5 text-sky-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main CTA: Gérer mon Hub */}
      <Card className="rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-0.5">
          <CardContent className="p-6 bg-background rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/20">
                <LayoutDashboard className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Gérer mon Hub</h3>
                <p className="text-sm text-muted-foreground">Accédez à votre portail Hub, gérez la plaque QR et les pièces</p>
              </div>
            </div>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-hub' }))}
              className="gap-2 rounded-xl flex-shrink-0"
            >
              <LayoutDashboard className="h-4 w-4" />
              Ouvrir
            </Button>
          </CardContent>
        </div>
      </Card>

      {/* Mini trend chart */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Activité des 14 derniers jours</h3>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-analytics' }))}
                className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-0.5 transition-colors cursor-pointer"
              >
                Voir les statistiques <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#18181b',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#fff',
                    }}
                    labelStyle={{ color: '#a1a1aa' }}
                    formatter={(value: number) => [`${value} scan${value > 1 ? 's' : ''}`, '']}
                  />
                  <Area
                    type="monotone"
                    dataKey="scans"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#dashGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!hasAnyData && (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
              <Zap className="h-8 w-8 text-violet-500" />
            </div>
            <h3 className="font-semibold text-lg">Scannez votre plaque QR pour commencer</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              Scannez le QR code de votre plaque pour activer votre Hub et configurer vos pièces.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

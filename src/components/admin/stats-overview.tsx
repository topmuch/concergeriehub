'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, QrCode, CheckCircle2, Users, Home, ArrowUpRight } from 'lucide-react';

interface StatsData {
  totalBatches: number;
  totalPhysicalQrs: number;
  activeQrCount: number;
  inactiveQrCount: number;
  lostQrCount: number;
  totalUsers: number;
  totalHomes: number;
  totalDynamicQrCodes: number;
  recentBatches: Array<{ id: string; quantity: number; createdAt: string; physicalQrCodes: any[] }>;
  recentUsers: Array<{ id: string; email: string; fullName: string | null; createdAt: string }>;
}

export function StatsOverview() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      label: 'Lots générés',
      value: stats.totalBatches,
      icon: <Package className="h-6 w-6 text-white" />,
      gradient: 'from-amber-400 via-orange-500 to-red-500',
    },
    {
      label: 'QR codes physiques',
      value: stats.totalPhysicalQrs,
      icon: <QrCode className="h-6 w-6 text-white" />,
      gradient: 'from-emerald-400 via-teal-500 to-cyan-600',
    },
    {
      label: 'QR activés',
      value: stats.activeQrCount,
      sublabel: `${stats.inactiveQrCount} en attente`,
      icon: <CheckCircle2 className="h-6 w-6 text-white" />,
      gradient: 'from-violet-500 via-purple-600 to-fuchsia-700',
    },
    {
      label: 'Utilisateurs',
      value: stats.totalUsers,
      sublabel: `${stats.totalHomes} foyers`,
      icon: <Users className="h-6 w-6 text-white" />,
      gradient: 'from-rose-400 via-pink-500 to-fuchsia-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Tableau de bord</h2>
        <p className="text-muted-foreground">
          Vue d'ensemble de la plateforme QR Domotik.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-6 text-white shadow-lg`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">{card.label}</p>
                <p className="text-3xl font-bold">{card.value}</p>
                {card.sublabel && (
                  <p className="text-xs text-white/70">{card.sublabel}</p>
                )}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                {card.icon}
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
        ))}
      </div>

      {/* Recent tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent batches */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Derniers lots
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Aucun lot généré pour le moment.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.recentBatches.map((batch) => {
                  const qrList = (batch.physicalQrCodes as Array<{ status: string }>) || [];
                  const active = qrList.filter((qr) => qr.status === 'active').length;
                  const total = qrList.length || batch.quantity || 0;
                  return (
                    <div key={batch.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{batch.quantity} QR codes</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(batch.createdAt).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={active >= total && total > 0 ? 'default' : 'secondary'}>
                          {active}/{total}
                        </Badge>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent users */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Derniers utilisateurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Aucun utilisateur inscrit.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.recentUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                        <span className="text-xs font-bold text-muted-foreground uppercase">
                          {(user.fullName || user.email)[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{user.fullName || 'Sans nom'}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Extra stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Home className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.totalHomes}</p>
            <p className="text-xs text-muted-foreground">Foyers actifs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <QrCode className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.totalDynamicQrCodes}</p>
            <p className="text-xs text-muted-foreground">QR dynamiques</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Package className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.totalBatches}</p>
            <p className="text-xs text-muted-foreground">Lots totaux</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.lostQrCount}</p>
            <p className="text-xs text-muted-foreground">QR perdus</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

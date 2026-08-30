'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Home,
  Users,
  Briefcase,
  ShieldCheck,
  TrendingUp,
  Check,
  Download,
  Package,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PACKS, type PackDefinition } from '@/lib/packs-config';

// ── Types ──────────────────────────────────────────────────────
interface HomeData {
  id: string;
  name: string;
}

interface PackQRStatus {
  moduleType: string;
  name: string;
  roomName: string;
  installed: boolean;
}

interface PackData extends Omit<PackDefinition, 'qrCodes'> {
  installedCount: number;
  totalCount: number;
  qrCodes: PackQRStatus[];
}

// ── Icon mapping ──────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  Home,
  Users,
  Briefcase,
  ShieldCheck,
  TrendingUp,
};

// ── Component ──────────────────────────────────────────────────
export function PackManager() {
  const [homeId, setHomeId] = useState<string | null>(null);
  const [packs, setPacks] = useState<PackData[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingPackId, setInstallingPackId] = useState<string | null>(null);

  // ── Fetch homes & packs data ──────────────────────────────────
  const fetchPacks = useCallback(async (home: string) => {
    try {
      const res = await fetch(`/api/client/packs?homeId=${home}`);
      const data = await res.json();
      return (data.packs || []) as PackData[];
    } catch {
      return [];
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const homesRes = await fetch('/api/client/homes');
      const homesData = await homesRes.json();
      const homes: HomeData[] = homesData.homes || [];
      const firstHomeId = homes[0]?.id;

      if (!firstHomeId) {
        setLoading(false);
        return;
      }

      setHomeId(firstHomeId);
      const packsData = await fetchPacks(firstHomeId);
      setPacks(packsData);
    } catch {
      toast.error('Erreur lors du chargement des packs');
    } finally {
      setLoading(false);
    }
  }, [fetchPacks]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // ── Install handler ──────────────────────────────────────────
  const handleInstall = async (packId: string) => {
    if (!homeId) return;
    setInstallingPackId(packId);

    try {
      const res = await fetch('/api/client/packs/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeId, packId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erreur lors de l'installation");
        return;
      }

      toast.success(`Pack installé ! ${data.installed} QR codes créés`);

      // Refetch packs data
      const packsData = await fetchPacks(homeId);
      setPacks(packsData);
    } catch {
      toast.error("Erreur lors de l'installation");
    } finally {
      setInstallingPackId(null);
    }
  };

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-80 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // ── Empty state (no home) ─────────────────────────────────────
  if (!homeId) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Home className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">Aucune maison trouvée</h3>
        <p className="max-w-sm text-muted-foreground">
          Créez d'abord une maison pour installer des packs
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Packs Pré-configurés
        </h2>
        <p className="mt-1 text-muted-foreground">
          Installez des bundles de QR codes en un clic
        </p>
      </div>

      {/* Pack Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packs.map((pack) => {
          const isFullyInstalled = pack.installedCount === pack.totalCount;
          const isPartiallyInstalled =
            pack.installedCount > 0 && !isFullyInstalled;
          const isInstalling = installingPackId === pack.id;
          const remaining = pack.totalCount - pack.installedCount;
          const progressPercent =
            pack.totalCount > 0
              ? Math.round((pack.installedCount / pack.totalCount) * 100)
              : 0;
          const IconComponent = ICON_MAP[pack.icon] || Package;

          let buttonClass = '';
          if (isFullyInstalled) {
            buttonClass = 'bg-emerald-600 hover:bg-emerald-600 text-white';
          } else if (isPartiallyInstalled) {
            buttonClass = 'bg-amber-500 hover:bg-amber-600 text-white';
          }

          return (
            <Card
              key={pack.id}
              className="group overflow-hidden transition-shadow hover:shadow-lg"
            >
              {/* Gradient Header Bar */}
              <div className={`bg-gradient-to-r ${pack.color} px-5 py-3`}>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="border-0 bg-white/20 text-xs text-white backdrop-blur-sm"
                  >
                    {pack.badge}
                  </Badge>
                  <div className="flex items-center gap-1.5 text-white">
                    <IconComponent className="h-4 w-4" />
                    <span className="text-sm font-semibold">{pack.name}</span>
                  </div>
                </div>
              </div>

              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm leading-snug text-foreground">
                  {pack.description}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 pb-5">
                {/* Target Audience Badge */}
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  <Users className="mr-1 h-3 w-3" />
                  {pack.targetAudience}
                </Badge>

                {/* Features List */}
                <div className="rounded-lg bg-slate-900 p-3">
                  <ul className="space-y-1.5">
                    {pack.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm text-white/80"
                      >
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* QR Code Count Badge */}
                <div className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {pack.totalCount} QR code{pack.totalCount > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Install Progress */}
                {pack.installedCount > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {pack.installedCount}/{pack.totalCount} installés
                      </span>
                      <span className="font-medium text-muted-foreground">
                        {progressPercent}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFullyInstalled
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Install Button */}
                <Button
                  className={`w-full ${buttonClass}`}
                  disabled={isFullyInstalled || isInstalling}
                  onClick={() => handleInstall(pack.id)}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Installation...
                    </>
                  ) : isFullyInstalled ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Déjà installé ✓
                    </>
                  ) : isPartiallyInstalled ? (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Compléter l'installation ({remaining} restant
                      {remaining > 1 ? 's' : ''})
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Installer ce pack
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

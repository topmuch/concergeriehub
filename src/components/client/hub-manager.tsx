'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ExternalLink,
  Copy,
  Check,
  DoorOpen,
  QrCode,
  Eye,
  Settings2,
  Link2,
  LayoutDashboard,
  Wifi,
  BedDouble,
  Bath,
  CookingPot,
  Sofa,
  Monitor,
  TreePine,
  Home as HomeIcon,
  ChevronRight,
} from 'lucide-react';

// ── Types ──
interface HomeData {
  id: string;
  name: string;
  address?: string | null;
  _count?: { rooms: number; members: number; qrCodes: number };
}

interface RoomData {
  id: string;
  name: string;
  icon?: string | null;
  _count?: { qrCodes: number };
}

interface ScanStats {
  totalScans: number;
  scansToday: number;
  scansThisWeek: number;
  scansThisMonth: number;
}

// ── Room icon helper ──
function getRoomIcon(icon?: string | null) {
  switch (icon?.toLowerCase()) {
    case 'salon':
    case 'living':
      return <Sofa className="h-4 w-4" />;
    case 'cuisine':
    case 'kitchen':
      return <CookingPot className="h-4 w-4" />;
    case 'chambre':
    case 'bedroom':
      return <BedDouble className="h-4 w-4" />;
    case 'salle de bain':
    case 'bathroom':
      return <Bath className="h-4 w-4" />;
    case 'bureau':
    case 'office':
      return <Monitor className="h-4 w-4" />;
    case 'jardin':
    case 'garden':
      return <TreePine className="h-4 w-4" />;
    case 'wifi':
      return <Wifi className="h-4 w-4" />;
    default:
      return <DoorOpen className="h-4 w-4" />;
  }
}

// ── Plan badge config ──
function getPlanBadge(plan?: string | null) {
  switch (plan) {
    case 'famille':
      return { label: 'Famille', variant: 'default' as const, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    case 'airbnb_solo':
      return { label: 'Airbnb Solo', variant: 'default' as const, className: 'bg-violet-100 text-violet-700 border-violet-200' };
    case 'airbnb_pro':
      return { label: 'Airbnb Pro', variant: 'default' as const, className: 'bg-amber-100 text-amber-700 border-amber-200' };
    default:
      return null;
  }
}

// ── Component ──
export function HubManager() {
  const [home, setHome] = useState<HomeData | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [hubSlug, setHubSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [userPlan, setUserPlan] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch homes
      const homesRes = await fetch('/api/client/homes');
      const homesData = await homesRes.json();
      const homesList: HomeData[] = homesData.homes || [];
      const firstHome = homesList[0] || null;
      setHome(firstHome);

      if (firstHome) {
        const homeId = firstHome.id;

        // 2. Fetch rooms and scan stats in parallel
        const [roomsRes, statsRes] = await Promise.all([
          fetch(`/api/client/rooms?homeId=${homeId}`).then((r) => r.json()),
          fetch(`/api/client/scan-stats?homeId=${homeId}`).then((r) => r.json()),
        ]);

        if (roomsRes.rooms) setRooms(roomsRes.rooms);
        if (statsRes.totalScans !== undefined) setStats(statsRes);

        // 3. Try to find the plaque linked to this home by probing the demo hub
        // In production, this would come from a dedicated API endpoint
        try {
          const hubProbe = await fetch('/api/public/hub/demo-hub');
          if (hubProbe.ok) {
            setHubSlug('demo-hub');
          }
        } catch {
          // Hub probe failed — no plaque found
        }
      }
    } catch (e) {
      console.error('[HubManager] Error loading data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hubUrl = hubSlug ? `qrdomotik.roomscan.pro/hub/${hubSlug}` : null;

  const handleCopyUrl = async () => {
    if (!hubUrl) return;
    try {
      await navigator.clipboard.writeText(`https://${hubUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-52 w-full rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  // ── Empty state ──
  if (!home) {
    return (
      <div className="max-w-4xl">
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-20 flex flex-col items-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-500/20">
              <Link2 className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold">Aucun Hub configuré</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Scannez votre plaque QR pour commencer. Votre Hub sera automatiquement créé et lié à votre espace.
            </p>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-homes' }))}
              className="mt-6 gap-2 rounded-xl"
            >
              <HomeIcon className="h-4 w-4" />
              Créer un espace
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const planBadge = getPlanBadge(userPlan);
  const totalModules = home._count?.qrCodes || 0;
  const totalRooms = rooms.length || home._count?.rooms || 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Mon Hub</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{home.name}</h1>
            {planBadge && (
              <Badge variant="outline" className={planBadge.className}>
                {planBadge.label}
              </Badge>
            )}
          </div>
          {home.address && (
            <p className="text-sm text-muted-foreground mt-1">{home.address}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-rooms' }))}
            variant="outline"
            className="gap-2 rounded-xl"
          >
            <DoorOpen className="h-4 w-4" />
            Gérer mes pièces
          </Button>
          <Button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-settings' }))}
            variant="outline"
            className="gap-2 rounded-xl"
          >
            <Settings2 className="h-4 w-4" />
            Modifier le PIN
          </Button>
        </div>
      </div>

      {/* ── Hub URL Card ── */}
      <Card className="rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-1">
          <CardContent className="p-6 bg-background rounded-xl">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {/* QR Code visual placeholder */}
              <div className="flex-shrink-0">
                <div className="h-28 w-28 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 border-2 border-violet-200 flex flex-col items-center justify-center gap-1.5">
                  <QrCode className="h-8 w-8 text-violet-600" />
                  <span className="text-[10px] font-medium text-violet-500 uppercase tracking-wider">Hub</span>
                </div>
              </div>

              {/* URL + actions */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  URL de votre Hub
                </p>
                {hubUrl ? (
                  <>
                    <p className="text-base sm:text-lg font-mono font-semibold text-foreground truncate">
                      {hubUrl}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Partagez ce lien ou imprimez-le sur votre plaque
                    </p>
                  </>
                ) : (
                  <p className="text-base text-muted-foreground">
                    Aucune plaque liée — scannez votre plaque QR pour activer le Hub
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  {hubUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyUrl}
                      className="gap-1.5 rounded-lg text-xs"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copié !' : 'Copier'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!hubSlug}
                    onClick={() => {
                      if (hubSlug) window.open(`/hub/${hubSlug}`, '_blank');
                    }}
                    className="gap-1.5 rounded-lg text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Voir mon Hub
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Scans */}
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-violet-50 flex items-center justify-center">
                <Eye className="h-4.5 w-4.5 text-violet-600" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">{stats?.totalScans ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Scans totaux</p>
          </CardContent>
        </Card>

        {/* Hub visits (this month) */}
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <LayoutDashboard className="h-4.5 w-4.5 text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">{stats?.scansThisMonth ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Visites ce mois</p>
          </CardContent>
        </Card>

        {/* Rooms */}
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
                <DoorOpen className="h-4.5 w-4.5 text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">{totalRooms}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pièces</p>
          </CardContent>
        </Card>

        {/* Modules */}
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-xl bg-sky-50 flex items-center justify-center">
                <QrCode className="h-4.5 w-4.5 text-sky-600" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">{totalModules}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Modules</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Rooms List ── */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Pièces de votre espace</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-rooms' }))}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Tout voir <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {rooms.length === 0 ? (
            <div className="text-center py-8">
              <DoorOpen className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Aucune pièce créée</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-2 rounded-xl text-xs"
                onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-rooms' }))}
              >
                <DoorOpen className="h-3.5 w-3.5" />
                Créer une pièce
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-96 overflow-y-auto">
              <div className="space-y-2 pr-3">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                      {getRoomIcon(room.icon)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{room.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {room._count?.qrCodes ?? 0} module{(room._count?.qrCodes ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button
          variant="outline"
          className="h-auto py-4 rounded-2xl gap-3 justify-start px-5"
          onClick={() => {
            if (hubSlug) window.open(`/hub/${hubSlug}`, '_blank');
          }}
          disabled={!hubSlug}
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <ExternalLink className="h-5 w-5 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Voir mon Hub</p>
            <p className="text-xs text-muted-foreground">Ouvrir dans un nouvel onglet</p>
          </div>
        </Button>

        <Button
          variant="outline"
          className="h-auto py-4 rounded-2xl gap-3 justify-start px-5"
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-rooms' }))}
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
            <DoorOpen className="h-5 w-5 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Gérer mes pièces</p>
            <p className="text-xs text-muted-foreground">Ajouter ou modifier</p>
          </div>
        </Button>

        <Button
          variant="outline"
          className="h-auto py-4 rounded-2xl gap-3 justify-start px-5"
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'client-settings' }))}
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
            <Settings2 className="h-5 w-5 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Modifier le PIN</p>
            <p className="text-xs text-muted-foreground">Sécurité mode Famille</p>
          </div>
        </Button>
      </div>
    </div>
  );
}

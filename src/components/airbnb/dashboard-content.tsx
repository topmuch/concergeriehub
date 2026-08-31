'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight, ExternalLink, MapPin, RefreshCw, Star } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { EmojiIcon } from '@/components/ui/emoji-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TeamPanel } from '@/components/airbnb/team-panel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatEur, propertyTypeMeta } from '@/lib/b2b';

// =============================================================
// DashboardContent — page principale de l'Espace Hôte B2B.
//  - En-tête "Bonjour, [Nom]" + sélecteur de propriété
//  - Grille de stats bento : Scans ce mois / Notes moyennes / Revenus Upselling
//  - Grille des modules actifs (cartes cliquables emoji)
// =============================================================

interface PropertyLite {
  id: string;
  name: string;
  propertyType: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  qrHubSlug?: string | null;
  hasGeoloc?: boolean;
}

interface DashboardModule {
  key: string;
  label: string;
  emoji: string;
  description: string;
  qrCount: number;
  previewSlug: string | null;
  nearbyProviders?: number;
}

interface DashboardData {
  user: { firstName: string };
  properties: PropertyLite[];
  property: PropertyLite | null;
  stats: {
    scansThisMonth: number;
    scansPrevMonth: number;
    scansDelta: number | null;
    lastScanAt: string | null;
    avgRating: number | null;
    reviewsCount: number;
    upsellingRevenue: number;
    upsellingOrders: number;
    unreadGuestMessages: number;
  } | null;
  modules: DashboardModule[];
}

interface DashboardContentProps {
  /** ÉTAPE 12 : bien verrouillé depuis la vue Portfolio (pas de sélecteur) */
  lockedPropertyId?: string;
  /** Retour vers la vue Portfolio */
  onBack?: () => void;
}

export function DashboardContent({ lockedPropertyId, onBack }: DashboardContentProps = {}) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [propertyId, setPropertyId] = useState<string | undefined>(lockedPropertyId);

  const effectiveId = lockedPropertyId ?? propertyId;

  const load = useCallback(async (pid?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/airbnb/dashboard${pid ? `?propertyId=${pid}` : ''}`);
      if (res.status === 401) {
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch {
      setError('Impossible de charger le dashboard. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load(effectiveId);
  }, [effectiveId, load]);

  // ----- Loading -----
  if (loading && !data) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6" aria-busy="true" aria-label="Chargement du dashboard">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ----- Erreur -----
  if (error) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-16 flex justify-center">
        <B2BCard className="max-w-md w-full text-center">
          <p className="text-3xl" aria-hidden="true">😵</p>
          <p className="mt-2 font-semibold text-slate-900">Oups, une erreur est survenue</p>
          <p className="text-sm text-slate-600 mt-1">{error}</p>
          <Button
            onClick={() => load(effectiveId)}
            className="mt-4 bg-slate-900 hover:bg-slate-800 text-white"
          >
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
        </B2BCard>
      </div>
    );
  }

  if (!data) return null;

  const { user, properties, property, stats, modules } = data;

  // ----- Aucun bien -----
  if (!property || properties.length === 0) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-16 flex justify-center">
        <B2BCard className="max-w-lg w-full text-center">
          <p className="text-4xl" aria-hidden="true">🏠</p>
          <h2 className="mt-3 text-lg font-bold text-slate-900">Aucun bien pour l&apos;instant</h2>
          <p className="text-sm text-slate-600 mt-2">
            Activez votre première plaque QR Conciergerie Hub pour créer votre bien et
            faire apparaître votre dashboard hôte.
          </p>
        </B2BCard>
      </div>
    );
  }

  const typeMeta = propertyTypeMeta(property.propertyType);

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-8">
      {/* ================= En-tête ================= */}
      <section aria-labelledby="dashboard-greeting">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 id="dashboard-greeting" className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Bonjour, {user.firstName} 👋
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Voici l&apos;activité de votre bien en temps réel.
            </p>
          </div>

          {/* Sélecteur de propriété / retour portfolio (ÉTAPE 12) */}
          {lockedPropertyId ? (
            <Button
              variant="outline"
              onClick={onBack}
              className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 self-start"
            >
              ← Retour au portfolio
            </Button>
          ) : properties.length > 1 ? (
            <Select value={property.id} onValueChange={(v) => setPropertyId(v)}>
              <SelectTrigger
                aria-label="Choisir un bien"
                className="w-full sm:w-[280px] bg-white border-slate-300 font-semibold"
              >
                <SelectValue placeholder="Choisir un bien" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {propertyTypeMeta(p.propertyType).emoji} {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="inline-flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm self-start">
              <span className="text-xl" aria-hidden="true">{typeMeta.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate max-w-[220px]">{property.name}</p>
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {property.address ?? typeMeta.label}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ================= Stats bento ================= */}
      <section aria-label="Statistiques du mois" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading || !stats ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          <>
            {/* 📡 Scans ce mois */}
            <B2BCard hover className="p-5">
              <div className="flex items-center justify-between">
                <EmojiIcon emoji="📡" size="sm" variant="accent" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Scans ce mois
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">
                {stats.scansThisMonth}
              </p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {stats.scansDelta != null ? (
                  <span
                    className={cn(
                      'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                      stats.scansDelta >= 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-100 border-slate-200 text-slate-500',
                    )}
                  >
                    {stats.scansDelta >= 0 ? '+' : ''}
                    {stats.scansDelta}% vs mois dernier
                  </span>
                ) : (
                  stats.scansThisMonth > 0 && (
                    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
                      🚀 Nouveau ce mois
                    </span>
                  )
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Plaque QR scannée par vos voyageurs
              </p>
            </B2BCard>

            {/* ⭐ Notes moyennes */}
            <B2BCard hover className="p-5">
              <div className="flex items-center justify-between">
                <EmojiIcon emoji="⭐" size="sm" variant="accent" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Notes moyennes
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">
                {stats.avgRating != null ? stats.avgRating.toFixed(1).replace('.', ',') : '—'}
                <span className="text-base font-semibold text-slate-400"> /5</span>
              </p>
              <div className="mt-2 flex items-center gap-0.5" aria-label={stats.avgRating != null ? `Note ${stats.avgRating.toFixed(1)} sur 5` : 'Aucune note'}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={cn(
                      'h-3.5 w-3.5',
                      stats.avgRating != null && i <= Math.round(stats.avgRating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'fill-slate-200 text-slate-200',
                    )}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {stats.reviewsCount > 0
                  ? `${stats.reviewsCount} avis sur les prestations`
                  : 'Aucun avis pour le moment'}
              </p>
            </B2BCard>

            {/* 💰 Revenus Upselling */}
            <B2BCard hover className="p-5">
              <div className="flex items-center justify-between">
                <EmojiIcon emoji="💰" size="sm" variant="accent" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Revenus Upselling
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">
                {formatEur(stats.upsellingRevenue)}
              </p>
              <div className="mt-2">
                <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 border-slate-200 text-slate-600">
                  {stats.upsellingOrders} commande{stats.upsellingOrders > 1 ? 's' : ''} payée
                  {stats.upsellingOrders > 1 ? 's' : ''} ce mois
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Services vendus via le QR code</p>
            </B2BCard>
          </>
        )}
      </section>

      {/* ================= Modules actifs ================= */}
      <section aria-labelledby="modules-title">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h2 id="modules-title" className="text-lg font-bold text-slate-900">
              Modules actifs
            </h2>
            <p className="text-sm text-slate-600">
              Chaque carte correspond à une fonctionnalité de votre plaque QR.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((mod) => {
            const active = mod.qrCount > 0;
            const isProviders = mod.key === 'PROVIDER_DIRECTORY';
            const hasUnread = mod.key === 'COMPLAINT' && (stats?.unreadGuestMessages ?? 0) > 0;
            return (
              <button
                key={mod.key}
                type="button"
                onClick={() => handleModuleClick(mod)}
                aria-label={`${mod.label} — ${active ? 'ouvrir' : 'non configuré'}`}
                className={cn(
                  'text-left bg-white border rounded-xl shadow-sm p-5 transition-all duration-200',
                  active
                    ? 'border-slate-200 hover:shadow-md hover:border-slate-300 cursor-pointer'
                    : 'border-slate-200 opacity-80 hover:opacity-100 cursor-pointer',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <EmojiIcon emoji={mod.emoji} size="lg" variant={active ? 'accent' : 'default'} />
                  {isProviders && (mod.nearbyProviders ?? 0) > 0 && (
                    <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold">
                      {mod.nearbyProviders} à proximité
                    </Badge>
                  )}
                  {hasUnread && (
                    <Badge className="bg-red-50 border-red-200 text-red-600 hover:bg-red-50 font-semibold">
                      {stats?.unreadGuestMessages} en attente
                    </Badge>
                  )}
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">{mod.label}</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{mod.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  {active ? (
                    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
                      Activé · {mod.qrCount} QR
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 border-slate-200 text-slate-500">
                      À configurer
                    </span>
                  )}
                  <span className="inline-flex items-center text-slate-400">
                    {isProviders ? (
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    ) : active ? (
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ================= Équipe & Hub QR (ÉTAPE 12) ================= */}
      <section aria-labelledby="team-title" className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div>
          <h2 id="team-title" className="sr-only">Équipe et hub du bien</h2>
          <TeamPanel propertyId={property.id} propertyName={property.name} />
        </div>

        <B2BCard className="p-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">🔗</span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Hub QR du bien</h3>
              <p className="text-xs text-slate-500">
                Adresse publique de l&apos;expérience voyageur (Wi-Fi, guidebook, services).
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <code className="text-xs bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 truncate max-w-full">
              /hub/{property.qrHubSlug ?? 'à-configurer'}
            </code>
            {property.qrHubSlug ? (
              <Button
                size="sm"
                variant="outline"
                className="bg-white border-slate-300"
                onClick={() => window.open(`/hub/${property.qrHubSlug}`, '_blank', 'noopener')}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Ouvrir
              </Button>
            ) : (
              <Badge className="bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-100 font-semibold">
                Non configuré
              </Badge>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-400 leading-relaxed">
            Ce slug est celui généré par l&apos;assistant de création. Les plaques QR du bien
            restent indépendantes et pointent chacune vers leur propre hub.
          </p>
        </B2BCard>
      </section>
    </div>
  );

  // ----- Clic sur une carte module -----
  function handleModuleClick(mod: DashboardModule) {
    if (mod.key === 'PROVIDER_DIRECTORY') {
      router.push('/airbnb/dashboard/providers');
      return;
    }
    if (mod.previewSlug) {
      // Aperçu invité : ce que voit le voyageur après le scan
      window.open(`/view/${mod.previewSlug}`, '_blank', 'noopener');
      return;
    }
    toast.info('Aucune plaque active pour ce module', {
      description: 'Activez un QR code de ce type depuis votre plaque physique pour le configurer.',
    });
  }
}

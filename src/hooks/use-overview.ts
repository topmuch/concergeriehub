'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHostContext, type HostProperty } from '@/components/airbnb/host/host-context';

// =============================================================
// useOverview — hook du Dashboard Client (Vue d'ensemble)
//
// Charge /api/airbnb/dashboard pour la sélection courante
// (une propriété ou l'agrégat 'all') : stats bento, courbe 30
// jours (scans + commandes), flux d'activité unifié, modules.
// =============================================================

export interface ModuleCard {
  key: string;
  label: string;
  emoji: string;
  description: string;
  qrCount: number;
  previewSlug: string | null;
  nearbyProviders?: number;
}

export interface ActivityItem {
  id: string;
  type: 'scan' | 'order' | 'booking' | 'message';
  title: string;
  detail: string | null;
  amount: number | null;
  at: string;
}

export interface SeriesPoint {
  date: string;
  label: string;
  scans: number;
  orders: number;
}

export interface OverviewStats {
  scansThisMonth: number;
  scansPrevMonth: number;
  scansDelta: number | null;
  lastScanAt: string | null;
  avgRating: number | null;
  reviewsCount: number;
  upsellingRevenue: number;
  ordersThisMonth: number;
  ordersDelta: number | null;
  unreadGuestMessages: number;
  activeProperties: number;
  propertiesCount: number;
}

export interface OverviewData {
  user: { firstName: string };
  properties: HostProperty[];
  property: (HostProperty & { hasGeoloc?: boolean }) | null;
  scope: 'single' | 'all';
  stats: OverviewStats | null;
  series: SeriesPoint[];
  activity: ActivityItem[];
  modules: ModuleCard[];
}

export interface UseOverviewResult {
  data: OverviewData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useOverview(): UseOverviewResult {
  const { selectedId, propertiesLoading } = useHostContext();
  const ready = !propertiesLoading;

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(ready);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refetch = useCallback(async () => {
    if (!ready) return;
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/airbnb/dashboard?propertyId=${encodeURIComponent(selectedId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OverviewData;
      if (current !== requestId.current) return;
      setData(json);
    } catch (err) {
      if (current !== requestId.current) return;
      console.error('[useOverview] fetch failed:', err);
      setError('Impossible de charger la vue d’ensemble. Réessayez dans un instant.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [selectedId, ready]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

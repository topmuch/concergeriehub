'use client';

import { useCallback, useEffect, useState } from 'react';
import { useHostContext, type HostInvitation, type HostPlanInfo, type HostProperty } from '@/components/airbnb/host/host-context';

// =============================================================
// useProperties — hook du Dashboard Client
//
// Expose le portfolio chargé par le HostContext (une seule requête
// partagée par tout le shell) : biens accessibles, limites de plan,
// invitations en attente + fonction de rechargement.
// =============================================================

export interface UsePropertiesResult {
  properties: HostProperty[];
  loading: boolean;
  error: string | null;
  plan: HostPlanInfo | null;
  invitations: HostInvitation[];
  refresh: () => Promise<void>;
}

export function useProperties(): UsePropertiesResult {
  const {
    properties,
    propertiesLoading,
    propertiesError,
    plan,
    invitations,
    refreshProperties,
  } = useHostContext();

  return {
    properties,
    loading: propertiesLoading,
    error: propertiesError,
    plan,
    invitations,
    refresh: refreshProperties,
  };
}

// =============================================================
// usePropertyStats — stats agrégées des biens sélectionnés
// (somme des stats individuelles côté client — les données
// proviennent de /api/airbnb/properties, déjà en cache contexte).
// =============================================================

export interface AggregatedStats {
  scans30d: number;
  upsellRevenue30d: number;
  upsellOrders30d: number;
  qrCount: number;
  membersCount: number;
  unreadGuestMessages: number;
  avgOccupancy: number;
  activeCount: number;
}

export function usePropertyStats(): AggregatedStats {
  const { properties, selectedIds } = useHostContext();

  return aggregatePropertyStats(properties, selectedIds());
}

export function aggregatePropertyStats(
  properties: HostProperty[],
  ids: string[],
): AggregatedStats {
  const selected = properties.filter((p) => ids.includes(p.id));
  return selected.reduce<AggregatedStats>(
    (acc, p) => {
      acc.scans30d += p.stats?.scans30d ?? 0;
      acc.upsellRevenue30d += p.stats?.upsellRevenue30d ?? 0;
      acc.upsellOrders30d += p.stats?.upsellOrders30d ?? 0;
      acc.qrCount += p.stats?.qrCount ?? 0;
      acc.membersCount += p.stats?.membersCount ?? 0;
      acc.unreadGuestMessages += p.stats?.unreadGuestMessages ?? 0;
      acc.avgOccupancy += p.stats?.occupancyRate ?? 0;
      if (p.isActive) acc.activeCount += 1;
      return acc;
    },
    {
      scans30d: 0,
      upsellRevenue30d: 0,
      upsellOrders30d: 0,
      qrCount: 0,
      membersCount: 0,
      unreadGuestMessages: 0,
      avgOccupancy: 0,
      activeCount: 0,
    },
  );
}

// =============================================================
// useCreateProperty — mutation de création (wizard 3 étapes)
// =============================================================

export interface CreatePropertyInput {
  name: string;
  address: string;
  propertyType: string;
  latitude?: number | null;
  longitude?: number | null;
  hubPin?: string | null;
}

export interface CreatePropertyResult {
  ok: boolean;
  status: number;
  property?: { id: string; name: string; qrHubSlug: string | null };
  error?: string;
  message?: string;
  upgrade?: string;
}

export function useCreateProperty() {
  const { refreshProperties } = useHostContext();

  const createProperty = useCallback(
    async (input: CreatePropertyInput): Promise<CreatePropertyResult> => {
      try {
        const res = await fetch('/api/airbnb/properties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = (await res.json().catch(() => ({}))) as {
          property?: { id: string; name: string; qrHubSlug: string | null };
          error?: string;
          message?: string;
          upgrade?: string;
        };
        if (!res.ok) {
          return { ok: false, status: res.status, error: data.error ?? 'Erreur serveur', message: data.message, upgrade: data.upgrade };
        }
        await refreshProperties();
        return { ok: true, status: 201, property: data.property };
      } catch (error) {
        console.error('[useCreateProperty] failed:', error);
        return { ok: false, status: 0, error: 'Erreur réseau. Réessayez dans un instant.' };
      }
    },
    [refreshProperties],
  );

  return { createProperty };
}

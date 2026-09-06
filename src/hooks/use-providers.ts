'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHostContext } from '@/components/airbnb/host/host-context';

// =============================================================
// useProviders — hook du Dashboard Client (Prestataires)
//
// Charge /api/airbnb/providers pour le bien sélectionné :
// prestataires géolocalisés triés par distance, séparés en
// Services Propriétaire (OWNER_SERVICE) et Expériences Invité
// (GUEST_EXPERIENCE), + indication de géolocalisation du bien.
// =============================================================

export interface NearbyProvider {
  id: string;
  audience: 'OWNER_SERVICE' | 'GUEST_EXPERIENCE';
  businessName: string;
  category: string;
  categoryEmoji: string;
  categoryLabel: string;
  subcategory: string | null;
  description: string | null;
  location: string | null;
  ratingAvg: number;
  totalReviews: number;
  distanceKm: number;
  serviceRadiusKm: number;
  hourlyRate: number | null;
  isVerified: boolean;
  isUrgentAvailable: boolean;
  responseTimeMinutes: number | null;
  totalJobsCompleted: number;
  contactName: string | null;
  contactEmail: string | null;
}

export interface UseProvidersResult {
  ownerServices: NearbyProvider[];
  guestExperiences: NearbyProvider[];
  property: { id: string; name: string; hasGeoloc: boolean } | null;
  hasGeoloc: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useProviders(propertyId?: string): UseProvidersResult {
  const { selectedId, propertiesLoading } = useHostContext();

  const effectiveId = propertyId ?? selectedId;
  const ready = !propertiesLoading;

  const [ownerServices, setOwnerServices] = useState<NearbyProvider[]>([]);
  const [guestExperiences, setGuestExperiences] = useState<NearbyProvider[]>([]);
  const [property, setProperty] = useState<UseProvidersResult['property']>(null);
  const [loading, setLoading] = useState(ready);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refetch = useCallback(async () => {
    if (!ready) return;
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/airbnb/providers?propertyId=${encodeURIComponent(effectiveId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        property?: { id: string; name: string; hasGeoloc?: boolean };
        hasGeoloc?: boolean;
        ownerServices?: NearbyProvider[];
        guestExperiences?: NearbyProvider[];
      };
      if (current !== requestId.current) return;
      setOwnerServices(data.ownerServices ?? []);
      setGuestExperiences(data.guestExperiences ?? []);
      const geo = data.hasGeoloc ?? false;
      setProperty(
        data.property
          ? { id: data.property.id, name: data.property.name, hasGeoloc: geo }
          : null,
      );
    } catch (err) {
      if (current !== requestId.current) return;
      console.error('[useProviders] fetch failed:', err);
      setError('Impossible de charger les prestataires. Réessayez dans un instant.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [effectiveId, ready]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    ownerServices,
    guestExperiences,
    property,
    hasGeoloc: property?.hasGeoloc ?? false,
    loading,
    error,
    refetch,
  };
}

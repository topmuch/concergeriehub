'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// =============================================================
// usePlaques — hook du Dashboard Client (page « Plaques QR »)
//
// Charge /api/airbnb/plaques : les plaques QR physiques de
// l'hôte (claimées par lui ou liées à ses biens) avec statut,
// code d'activation, slug du Hub public et bien associé.
//
// NB : les plaques physiques ne sont pas tracées par ScanLog
// (réservé aux QrCode dynamiques) — aucune statistique de scans
// n'est donc exposée ici, volontairement.
// =============================================================

export interface PlaqueDTO {
  id: string;
  hubSlug: string | null;
  status: string;
  activationCode: string;
  createdAt: string;
  claimedAt: string | null;
  property: { id: string; name: string } | null;
}

export interface UsePlaquesResult {
  plaques: PlaqueDTO[];
  loading: boolean;
  error: string | null;
  /** Recharge la liste (après création / changement de statut). */
  refetch: () => Promise<void>;
}

export function usePlaques(): UsePlaquesResult {
  const [plaques, setPlaques] = useState<PlaqueDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refetch = useCallback(async () => {
    const current = ++requestId.current;
    try {
      const res = await fetch('/api/airbnb/plaques', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { plaques?: PlaqueDTO[] };
      if (current !== requestId.current) return;
      setPlaques(json.plaques ?? []);
      setError(null);
    } catch (err) {
      if (current !== requestId.current) return;
      console.error('[usePlaques] fetch failed:', err);
      setError('Impossible de charger vos plaques. Réessayez dans un instant.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { plaques, loading, error, refetch };
}

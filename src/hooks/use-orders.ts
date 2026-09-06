'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHostContext } from '@/components/airbnb/host/host-context';

// =============================================================
// useOrders — hook du Dashboard Client (Commandes & Revenus)
//
// Charge /api/airbnb/service-orders pour la propriété sélectionnée
// (ou toutes via agrégat API `propertyId=all`) et expose les
// commandes + stats financières + rechargement.
// =============================================================

export interface OrderItem {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface HostOrder {
  id: string;
  bookingId: string | null;
  guestName: string;
  guestEmail: string | null;
  items: OrderItem[];
  totalAmount: number;
  commission: number;
  hostEarning: number;
  status: string; // PENDING | CONFIRMED | PREPARING | DELIVERED | CANCELLED
  paymentStatus: string; // UNPAID | PAID | REFUNDED | FAILED
  paidAt: string | null;
  deliveryDate: string | null;
  createdAt: string;
  provider: { businessName: string; category: string } | null;
  propertyName?: string;
}

export interface OrdersStats {
  revenue: number;
  commissionTotal: number;
  hostTotal: number;
  activeCount: number;
  pendingCount: number;
  deliveredCount: number;
  paidRevenue: number;
  paidCount: number;
  refundedRevenue: number;
  refundedCount: number;
}

export interface UseOrdersOptions {
  /** Force une propriété (sinon : sélection du contexte, 'all' inclus). */
  propertyId?: string;
  /** Désactive le chargement automatique. */
  enabled?: boolean;
}

export interface UseOrdersResult {
  orders: HostOrder[];
  stats: OrdersStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY_STATS: OrdersStats = {
  revenue: 0,
  commissionTotal: 0,
  hostTotal: 0,
  activeCount: 0,
  pendingCount: 0,
  deliveredCount: 0,
  paidRevenue: 0,
  paidCount: 0,
  refundedRevenue: 0,
  refundedCount: 0,
};

export function useOrders(options: UseOrdersOptions = {}): UseOrdersResult {
  const { propertyId: forcedId, enabled = true } = options;
  const { selectedId, propertiesLoading, properties } = useHostContext();

  const [orders, setOrders] = useState<HostOrder[]>([]);
  const [stats, setStats] = useState<OrdersStats | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  // La requête n'est stable qu'une fois le portfolio chargé (ids connus).
  const effectiveId = forcedId ?? selectedId;
  const ready = enabled && !propertiesLoading;
  const requestId = useRef(0);

  const refetch = useCallback(async () => {
    if (!ready) return;
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/airbnb/service-orders?propertyId=${encodeURIComponent(effectiveId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { orders?: HostOrder[]; stats?: OrdersStats };
      if (current !== requestId.current) return; // réponse obsolète
      const propsById = new Map(properties.map((p) => [p.id, p.name]));
      const mapped = (data.orders ?? []).map((o) => ({
        ...o,
        propertyName: propsById.get('') ?? undefined, // enrichi ci-dessous si 'all'
      }));
      setOrders(mapped);
      setStats(data.stats ?? EMPTY_STATS);
    } catch (err) {
      if (current !== requestId.current) return;
      console.error('[useOrders] fetch failed:', err);
      setError('Impossible de charger les commandes. Réessayez dans un instant.');
      setOrders([]);
      setStats(EMPTY_STATS);
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [effectiveId, ready, properties]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { orders, stats, loading, error, refetch };
}

// =============================================================
// useUpdateOrderStatus — transition du cycle de vie d'une commande
// (hôte : CONFIRMER / PRÉPARER / LIVRER / ANNULER).
// =============================================================

export function useUpdateOrderStatus() {
  const [pendingId, setPendingId] = useState<string | null>(null);

  const updateStatus = useCallback(
    async (orderId: string, status: string): Promise<{ ok: boolean; error?: string }> => {
      setPendingId(orderId);
      try {
        const res = await fetch(`/api/airbnb/service-orders?id=${encodeURIComponent(orderId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return { ok: false, error: data.error ?? 'Transition refusée' };
        return { ok: true };
      } catch (error) {
        console.error('[useUpdateOrderStatus] failed:', error);
        return { ok: false, error: 'Erreur réseau. Réessayez dans un instant.' };
      } finally {
        setPendingId(null);
      }
    },
    [],
  );

  return { updateStatus, pendingId };
}

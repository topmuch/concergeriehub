'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { providerCategoryMeta } from '@/lib/b2b';
import { ORDER_STATUS_META, ORDER_TRANSITIONS, formatEur2, type OrderStatus } from '@/lib/orders';

// =============================================================
// ÉTAPE 17.2 (V3) — Onglet 🧾 Commandes (moteur de transaction)
// • Stats financières : CA invités / commission Hub / part hôte /
//   commandes actives (hors annulées)
// • Liste des commandes du bien avec cycle de vie pilotable :
//   PENDING → CONFIRMED → PREPARING → DELIVERED (+ CANCELLED)
// • Switch multi-propriétés (héritage V2)
// ÉTAPE 17.6 (V3) — PAIEMENT IN-APP : badge 💳 Payée/À payer par
// commande + stat « dont encaissé » (montants réellement payés).
// ÉTAPE 21 (V3) — REMBOURSEMENT : bouton ↩️ Rembourser sur les
// commandes payées (confirmation, garde OWNER/MANAGER côté serveur),
// stat « remboursé ». Optimiste : rollback + toast en cas d'échec.
// =============================================================

interface OrderDTO {
  id: string;
  bookingId: string | null;
  guestName: string;
  guestEmail: string | null;
  items: unknown;
  totalAmount: number;
  commission: number;
  hostEarning: number;
  status: string;
  paymentStatus: string;
  paidAt: string | null;
  deliveryDate: string | null;
  createdAt: string;
  provider: { businessName: string; category: string };
}

interface StatsDTO {
  revenue: number;
  commissionTotal: number;
  hostTotal: number;
  activeCount: number;
  pendingCount: number;
  deliveredCount: number;
  paidRevenue: number;
  paidCount: number;
  // ÉTAPE 21 — remboursements
  refundedRevenue: number;
  refundedCount: number;
}

interface PropertyLite {
  id: string;
  name: string;
  propertyType: string;
}

interface ApiResponse {
  properties: PropertyLite[];
  property: PropertyLite | null;
  orders: OrderDTO[];
  stats: StatsDTO;
  error?: string;
}

/** Label court de la prochaine étape de cycle de vie. */
const NEXT_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Confirmer',
  PREPARING: 'Préparer',
  DELIVERED: 'Marquer livrée',
};

/** ÉTAPE 17.6 — chip paiement par commande (hôte). */
function PaymentChip({ paymentStatus, orderStatus }: { paymentStatus: string; orderStatus: string }) {
  if (orderStatus === 'CANCELLED' && paymentStatus !== 'PAID') return null;
  const meta =
    paymentStatus === 'PAID'
      ? { label: 'Payée', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
      : paymentStatus === 'REFUNDED'
        ? { label: 'Remboursée', cls: 'bg-slate-100 text-slate-600 border-slate-300' }
        : paymentStatus === 'FAILED'
          ? { label: 'Paiement échoué', cls: 'bg-rose-100 text-rose-700 border-rose-300' }
          : { label: 'À payer', cls: 'bg-orange-100 text-orange-800 border-orange-300' };
  return (
    <Badge className={`${meta.cls} border text-[10px] px-2`} title={paymentStatus === 'PAID' ? 'Encaissé via Conciergerie Hub' : 'Paiement non finalisé'}>
      💳 {meta.label}
    </Badge>
  );
}

export function OrdersContent() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [propertyId, setPropertyId] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (pid?: string) => {
    setLoading(true);
    setError('');
    try {
      const qs = pid ? `?propertyId=${encodeURIComponent(pid)}` : '';
      const res = await fetch(`/api/airbnb/service-orders${qs}`);
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(json.error || 'Impossible de charger les commandes.');
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError('Connexion impossible. Réessayez.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeProperty = (pid: string) => {
    setPropertyId(pid);
    load(pid);
  };

  /** Transition de statut — mise à jour optimiste avec rollback. */
  const transition = async (order: OrderDTO, next: OrderStatus) => {
    const prevOrders = data?.orders ?? [];
    setBusyId(order.id);
    // Optimiste
    setData((d) =>
      d ? { ...d, orders: d.orders.map((o) => (o.id === order.id ? { ...o, status: next } : o)) } : d,
    );
    try {
      const res = await fetch(`/api/airbnb/service-orders?id=${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        // Rollback
        setData((d) => (d ? { ...d, orders: prevOrders } : d));
        toast.error(json?.error || 'La mise à jour a échoué.');
        return;
      }
      const meta = ORDER_STATUS_META[next];
      toast.success(
        next === 'DELIVERED'
          ? '📦 Commande marquée livrée — bien reçue !'
          : `${meta.emoji} Commande ${meta.label.toLowerCase()}${next === 'CANCELLED' ? 'e' : ''}.`,
      );
      // Recharge silencieux pour rafraîchir les stats financières
      load(propertyId || undefined);
    } catch {
      setData((d) => (d ? { ...d, orders: prevOrders } : d));
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * ÉTAPE 21 — remboursement d'une commande payée.
   * La garde financière (OWNER/MANAGER + statut PAID) est réappliquée
   * côté serveur ; ici : confirmé par AlertDialog + maj optimiste.
   */
  const refundOrder = async (order: OrderDTO) => {
    const prevOrders = data?.orders ?? [];
    setBusyId(order.id);
    // Optimiste
    setData((d) =>
      d
        ? { ...d, orders: d.orders.map((o) => (o.id === order.id ? { ...o, paymentStatus: 'REFUNDED' } : o)) }
        : d,
    );
    try {
      const res = await fetch(`/api/airbnb/service-orders/${encodeURIComponent(order.id)}/refund`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; alreadyRefunded?: boolean }
        | null;
      if (!res.ok || !json?.ok) {
        setData((d) => (d ? { ...d, orders: prevOrders } : d));
        toast.error(json?.error || 'Le remboursement a échoué.');
        return;
      }
      toast.success(
        json.alreadyRefunded
          ? '↩️ Commande déjà remboursée.'
          : `↩️ ${formatEur2(order.totalAmount)} remboursés — ${order.guestName} est recrédité(e).`,
      );
      // Recharge silencieux pour rafraîchir les stats financières
      load(propertyId || undefined);
    } catch {
      setData((d) => (d ? { ...d, orders: prevOrders } : d));
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
      {/* ----- En-tête + switch propriété ----- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🧾 Commandes invités</h1>
          <p className="text-sm text-slate-500 mt-1">
            Le moteur de transaction de votre conciergerie — suivez et pilotez chaque commande.
          </p>
        </div>
        {data && data.properties.length > 0 && (
          <Select value={data.property?.id ?? ''} onValueChange={changeProperty}>
            <SelectTrigger className="w-full sm:w-64 bg-white" aria-label="Choisir le bien">
              <SelectValue placeholder="Choisir un bien" />
            </SelectTrigger>
            <SelectContent>
              {data.properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading && !data && <LoadingSkeleton />}

      {!loading && error && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center" role="alert">
          <p className="text-3xl" aria-hidden="true">🔌</p>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <Button className="mt-4" onClick={() => load(propertyId || undefined)}>
            Réessayer
          </Button>
        </div>
      )}

      {!loading && data && !error && (
        <>
          {/* ----- Stats financières ----- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              emoji="💰"
              label="CA invités"
              value={formatEur2(data.stats.revenue)}
              hint={`dont ${formatEur2(data.stats.paidRevenue)} encaissés (${data.stats.paidCount})${data.stats.refundedCount > 0 ? ` · ${formatEur2(data.stats.refundedRevenue)} remboursés (${data.stats.refundedCount})` : ''}`}
              tone="slate"
            />
            <StatCard
              emoji="🏦"
              label="Commission Hub"
              value={formatEur2(data.stats.commissionTotal)}
              hint="vos revenus de plateforme"
              tone="emerald"
            />
            <StatCard
              emoji="🏠"
              label="Part hôte"
              value={formatEur2(data.stats.hostTotal)}
              hint="reversée au propriétaire"
              tone="slate"
            />
            <StatCard
              emoji="⏳"
              label="Commandes actives"
              value={String(data.stats.activeCount)}
              hint={`dont ${data.stats.pendingCount} à confirmer · ${data.stats.deliveredCount} livrée${data.stats.deliveredCount > 1 ? 's' : ''}`}
              tone={data.stats.pendingCount > 0 ? 'amber' : 'slate'}
            />
          </div>

          {/* ----- Liste des commandes ----- */}
          {data.orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="text-4xl" aria-hidden="true">🛍️</p>
              <h2 className="mt-3 text-lg font-bold text-slate-900">Aucune commande pour l&apos;instant</h2>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Vos invités peuvent commander les prestataires «&nbsp;Expérience invité&nbsp;» directement
                depuis l&apos;app de leur logement (onglet Services). Les commandes apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  {data.orders.length} commande{data.orders.length > 1 ? 's' : ''} — {data.property?.name}
                </h2>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  Cycle : à confirmer → confirmée → préparation → livrée
                </p>
              </div>
              <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {data.orders.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    busy={busyId === o.id}
                    onTransition={transition}
                    onRefund={refundOrder}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ emoji, label, value, hint, tone }: {
  emoji: string;
  label: string;
  value: string;
  hint: string;
  tone: 'slate' | 'emerald' | 'amber';
}) {
  const accent =
    tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span aria-hidden="true">{emoji}</span> {label}
      </p>
      <p className={`mt-1.5 text-xl font-bold ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400 leading-snug">{hint}</p>
    </div>
  );
}

function OrderRow({ order, busy, onTransition, onRefund }: {
  order: OrderDTO;
  busy: boolean;
  onTransition: (order: OrderDTO, next: OrderStatus) => Promise<void>;
  onRefund: (order: OrderDTO) => Promise<void>;
}) {
  const status = (ORDER_STATUS_META[order.status as OrderStatus] ?? ORDER_STATUS_META.PENDING) as {
    label: string;
    emoji: string;
    badge: string;
  };
  const cat = providerCategoryMeta(order.provider.category);
  const items = Array.isArray(order.items) ? (order.items as { name: string; qty: number; unitPrice: number }[]) : [];
  const nextSteps = ORDER_TRANSITIONS[order.status as OrderStatus] ?? [];

  return (
    <li className="px-4 py-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
      {/* Prestataire + invité + lignes */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg leading-none" aria-hidden="true">{cat.emoji}</span>
          <p className="text-sm font-bold text-slate-900">{order.provider.businessName}</p>
          <Badge className={`${status.badge} text-white border-0 text-[10px] px-2`}>
            {status.emoji} {status.label}
          </Badge>
          <PaymentChip paymentStatus={order.paymentStatus} orderStatus={order.status} />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Invité&nbsp;: <span className="font-semibold text-slate-700">{order.guestName}</span>
          {order.deliveryDate && (
            <>
              {' · '}Livraison prévue&nbsp;: {formatFr(order.deliveryDate)}
            </>
          )}
          {' · '}Commandée le {formatFr(order.createdAt)}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
          {items.map((it) => `${it.qty}× ${it.name}`).join(' · ') || '—'}
        </p>
      </div>

      {/* Finances */}
      <div className="flex lg:flex-col lg:text-right items-center lg:items-end gap-1.5 shrink-0">
        <p className="text-sm font-bold text-slate-900">{formatEur2(order.totalAmount)}</p>
        <p className="text-[11px] text-slate-400">
          Hub {formatEur2(order.commission)} · Hôte {formatEur2(order.hostEarning)}
        </p>
      </div>

      {/* Actions (cycle de vie + remboursement É21) */}
      {(nextSteps.length > 0 || order.paymentStatus === 'PAID') && (
        <div className="flex gap-2 shrink-0 flex-wrap">
          {nextSteps.filter((s) => s !== 'CANCELLED').map((s) => (
            <Button
              key={s}
              size="sm"
              disabled={busy}
              onClick={() => onTransition(order, s)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {busy ? '…' : NEXT_ACTION_LABEL[s] ?? s}
            </Button>
          ))}
          {nextSteps.includes('CANCELLED') && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onTransition(order, 'CANCELLED')}
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
            >
              Annuler
            </Button>
          )}
          {order.paymentStatus === 'PAID' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  {busy ? '…' : '↩️ Rembourser'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Rembourser {formatEur2(order.totalAmount)} à {order.guestName}&nbsp;?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    L&apos;invité sera recrédité(e) intégralement (la commission Hub est également
                    annulée). Cette action est définitive et sera visible du prestataire.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onRefund(order)}
                    className="bg-rose-600 text-white hover:bg-rose-700"
                  >
                    Confirmer le remboursement
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </li>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement des commandes">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function formatFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

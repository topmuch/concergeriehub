'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandLogo } from '@/components/ui/brand-logo';
import { providerCategoryMeta } from '@/lib/b2b';
import { ORDER_STATUS_META, ORDER_TRANSITIONS, formatEur2, type OrderStatus } from '@/lib/orders';

// =============================================================
// ÉTAPE 17.4 (V3) — Portail Prestataire : "Mes commandes"
// Le prestataire voit UNIQUEMENT les commandes qui lui sont
// adressées (résolu serveur depuis la session → providerProfile)
// et pilote son cycle de vie :
//   PENDING → CONFIRMED → PREPARING → DELIVERED (+ CANCELLED)
// ⚠️ La part hôte (hostEarning) n'est JAMAIS exposée au
// prestataire — c'est un contrat entre Conciergerie Hub et l'hôte.
// Optimiste : rollback + toast en cas d'échec.
// =============================================================

interface ProviderOrderDTO {
  id: string;
  guestName: string;
  guestEmail: string | null;
  items: unknown;
  totalAmount: number;
  commission: number;
  status: string;
  deliveryDate: string | null;
  createdAt: string;
  property: { name: string } | null;
}

interface ProviderStatsDTO {
  activeCount: number;
  pendingCount: number;
  preparingCount: number;
  deliveredCount: number;
  revenue: number;
  commissionTotal: number;
}

interface ProviderMe {
  businessName: string;
  category: string;
  audience: string;
  ratingAvg: number;
  totalReviews: number;
}

interface ApiResponse {
  provider: ProviderMe;
  orders: ProviderOrderDTO[];
  stats: ProviderStatsDTO;
  error?: string;
}

/** Label court de la prochaine étape de cycle de vie. */
const NEXT_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Accepter',
  PREPARING: 'Démarrer la préparation',
  DELIVERED: 'Marquer livrée',
};

export function ProviderDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/provider/service-orders', { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(json.error || 'Impossible de charger vos commandes.');
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
    const t = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  /** Transition de statut — mise à jour optimiste avec rollback. */
  const transition = async (order: ProviderOrderDTO, next: OrderStatus) => {
    const prevOrders = data?.orders ?? [];
    setBusyId(order.id);
    setData((d) =>
      d ? { ...d, orders: d.orders.map((o) => (o.id === order.id ? { ...o, status: next } : o)) } : d,
    );
    try {
      const res = await fetch(`/api/provider/service-orders?id=${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setData((d) => (d ? { ...d, orders: prevOrders } : d));
        toast.error(json?.error || 'La mise à jour a échoué.');
        return;
      }
      const meta = ORDER_STATUS_META[next];
      toast.success(
        next === 'DELIVERED'
          ? '📦 Commande marquée livrée — bravo !'
          : next === 'CONFIRMED'
            ? '✅ Commande acceptée — au travail !'
            : `${meta.emoji} Commande ${meta.label.toLowerCase()}${next === 'CANCELLED' ? 'e' : ''}.`,
      );
      load();
    } catch {
      setData((d) => (d ? { ...d, orders: prevOrders } : d));
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setBusyId(null);
    }
  };

  const cat = data ? providerCategoryMeta(data.provider.category) : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ----- En-tête portail ----- */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto w-full px-4 py-4 flex items-center justify-between gap-3">
          <BrandLogo size="sm" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Portail Prestataire
          </p>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
          {loading && !data && <LoadingSkeleton />}

          {!loading && error && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center" role="alert">
              <p className="text-3xl" aria-hidden="true">🔌</p>
              <p className="mt-2 text-sm text-slate-600">{error}</p>
              <Button className="mt-4" onClick={() => load()}>
                Réessayer
              </Button>
            </div>
          )}

          {!loading && data && (
            <>
              {/* ----- Identité prestataire ----- */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <span aria-hidden="true">{cat?.emoji}</span> {data.provider.businessName}
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {cat?.label}
                    {data.provider.audience === 'GUEST_EXPERIENCE' && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                        Expérience invité
                      </span>
                    )}
                    {data.provider.totalReviews > 0 && (
                      <span className="ml-2">
                        ⭐ {data.provider.ratingAvg.toFixed(1)} ({data.provider.totalReviews} avis)
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 sm:text-right leading-snug">
                  Vos commandes arrivent de l&apos;app de vos clients.
                  <br />
                  Acceptez, préparez, livrez — l&apos;hôte suit en direct.
                </p>
              </div>

              {/* ----- Stats ----- */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  emoji="⏳"
                  label="À traiter"
                  value={String(data.stats.activeCount)}
                  hint={`dont ${data.stats.pendingCount} à accepter · ${data.stats.preparingCount} en préparation`}
                  tone={data.stats.pendingCount > 0 ? 'amber' : 'slate'}
                />
                <StatCard
                  emoji="💰"
                  label="CA généré"
                  value={formatEur2(data.stats.revenue)}
                  hint="hors commandes annulées"
                  tone="slate"
                />
                <StatCard
                  emoji="🏦"
                  label="Commission Hub"
                  value={formatEur2(data.stats.commissionTotal)}
                  hint="prélevée par la plateforme"
                  tone="emerald"
                />
                <StatCard
                  emoji="📦"
                  label="Livrées"
                  value={String(data.stats.deliveredCount)}
                  hint="missions accomplies"
                  tone="slate"
                />
              </div>

              {/* ----- Liste des commandes ----- */}
              {data.orders.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                  <p className="text-4xl" aria-hidden="true">🛍️</p>
                  <h2 className="mt-3 text-lg font-bold text-slate-900">Aucune commande pour l&apos;instant</h2>
                  <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                    Dès qu&apos;un invité commandera vos services depuis l&apos;app de son logement,
                    la commande apparaîtra ici avec toutes les informations de livraison.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      {data.orders.length} commande{data.orders.length > 1 ? 's' : ''}
                    </h2>
                    <p className="text-[11px] text-slate-400 hidden sm:block">
                      Cycle : à accepter → confirmée → préparation → livrée
                    </p>
                  </div>
                  <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto custom-scrollbar">
                    {data.orders.map((o) => (
                      <OrderRow key={o.id} order={o} busy={busyId === o.id} onTransition={transition} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ----- Footer sticky (règle UI : mt-auto) ----- */}
      <footer className="mt-auto bg-white border-t border-slate-200 py-4">
        <div className="max-w-6xl mx-auto w-full px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            🔐 Portail sécurisé — vous ne voyez que vos commandes.
          </p>
          <p className="text-xs text-slate-400">
            Conciergerie Hub — le moteur de transaction de votre conciergerie
          </p>
        </div>
      </footer>
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

function OrderRow({ order, busy, onTransition }: {
  order: ProviderOrderDTO;
  busy: boolean;
  onTransition: (order: ProviderOrderDTO, next: OrderStatus) => Promise<void>;
}) {
  const status = (ORDER_STATUS_META[order.status as OrderStatus] ?? ORDER_STATUS_META.PENDING) as {
    label: string;
    emoji: string;
    badge: string;
  };
  const items = Array.isArray(order.items) ? (order.items as { name: string; qty: number; unitPrice: number }[]) : [];
  const nextSteps = ORDER_TRANSITIONS[order.status as OrderStatus] ?? [];

  return (
    <li className="px-4 py-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
      {/* Contenu + invité + lignes */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-900">{order.property?.name ?? 'Logement'}</p>
          <Badge className={`${status.badge} text-white border-0 text-[10px] px-2`}>
            {status.emoji} {status.label}
          </Badge>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Invité&nbsp;: <span className="font-semibold text-slate-700">{order.guestName}</span>
          {order.guestEmail && (
            <>
              {' · '}
              <a href={`mailto:${order.guestEmail}`} className="underline underline-offset-2 hover:text-slate-700">
                {order.guestEmail}
              </a>
            </>
          )}
          {order.deliveryDate && (
            <>
              {' · '}Livraison prévue&nbsp;: {formatFr(order.deliveryDate)}
            </>
          )}
          {' · '}Commandée le {formatFr(order.createdAt)}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
          <span className="font-semibold text-slate-600">Prestation&nbsp;: </span>
          {items.map((it) => `${it.qty}× ${it.name}`).join(' · ') || '—'}
        </p>
      </div>

      {/* Finances — total + commission Hub uniquement (jamais la part hôte) */}
      <div className="flex lg:flex-col lg:text-right items-center lg:items-end gap-1.5 shrink-0">
        <p className="text-sm font-bold text-slate-900">{formatEur2(order.totalAmount)}</p>
        <p className="text-[11px] text-slate-400">
          Commission Hub&nbsp;: {formatEur2(order.commission)}
        </p>
      </div>

      {/* Actions de cycle de vie */}
      {nextSteps.length > 0 && (
        <div className="flex gap-2 shrink-0">
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
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onTransition(order, 'CANCELLED')}
            className="text-rose-600 border-rose-200 hover:bg-rose-50"
          >
            Refuser
          </Button>
        </div>
      )}
    </li>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement de vos commandes">
      <Skeleton className="h-16 rounded-xl" />
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

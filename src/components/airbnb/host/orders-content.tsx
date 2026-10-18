'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KPICard } from '@/components/airbnb/host/kpi-card';
import { StatusBadge } from '@/components/airbnb/host/status-badge';
import { DataTable, type DataTableColumn } from '@/components/airbnb/host/data-table';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { useOrders, useUpdateOrderStatus, type HostOrder, type OrderItem } from '@/hooks/use-orders';
import { canTransition, ORDER_STATUSES, type OrderStatus } from '@/lib/orders';
import { providerCategoryMeta } from '@/lib/b2b';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » — panel hôte.
import { laundryOrderSummary, pickupSlotLabel } from '@/lib/laundry';

// v5.2 « SAPHIR LUXE » — pastilles de statut pressing (teintes sémantiques 10 %).
const LAUNDRY_STATUS_HOST_META: Record<string, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: 'Paiement en cours', className: 'border-[#fbbf24]/25 bg-[#fbbf24]/10 text-[#fbbf24]' },
  REQUESTED: { label: 'Demandée', className: 'border-white/12 bg-white/[0.04] text-[#8fa0c2]' },
  PAID: { label: 'Réglée', className: 'border-[#34d399]/25 bg-[#34d399]/10 text-[#34d399]' },
  IN_PROGRESS: { label: 'En cours', className: 'border-[#5c8af0]/25 bg-[#5c8af0]/10 text-[#a9c4ff]' },
  READY: { label: 'Prête à livrer', className: 'border-[#2dd4bf]/25 bg-[#2dd4bf]/10 text-[#2dd4bf]' },
  DELIVERED: { label: 'Livrée', className: 'border-[#34d399]/25 bg-[#34d399]/10 text-[#34d399]' },
  CANCELLED: { label: 'Annulée', className: 'border-[#f07d6a]/25 bg-[#f07d6a]/10 text-[#f07d6a]' },
};
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// =============================================================
// OrdersContent — page « Commandes & Revenus » du Dashboard Client
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
// nuit bleutée, SANS ICÔNES ni emojis (typographie, points colorés,
// glyphes purs). Données, handlers et textes métier intacts.
//
// • 4 KPIs réelles : Total encaissé · Commissions Hub ·
//   Revenus prestataires · En attente de paiement
// • Filtres client-side : statut / paiement / période
// • DataTable : tri Date desc au montage, actions de transition
//   (canTransition) confirmées par AlertDialog
// • Export CSV des commandes FILTRÉES (BOM UTF-8, séparateur « ; »)
// • Scope : suit le sélecteur du header ('all' → agrégat API)
// =============================================================

/** Ligne enrichie : l'API renvoie propertyId + propertyName (T4-b). */
type OrderRow = HostOrder & { propertyId?: string; propertyName?: string | null };

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  PREPARING: 'En préparation',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'Non payée',
  PAID: 'Payée',
  REFUNDED: 'Remboursée',
  FAILED: 'Échec',
};

/** Cibles de transition proposées, dans l'ordre du cycle de vie. */
type TransitionTarget = Exclude<OrderStatus, 'PENDING'>;

const TRANSITION_TARGETS: TransitionTarget[] = ['CONFIRMED', 'PREPARING', 'DELIVERED', 'CANCELLED'];

/** Options du filtre Statut (ordre du schéma). */
const STATUS_OPTIONS: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'DELIVERED', 'CANCELLED'];

const ACTION_META: Record<TransitionTarget, { label: string; destructive: boolean }> = {
  CONFIRMED: { label: 'Confirmer', destructive: false },
  PREPARING: { label: 'Passer en préparation', destructive: false },
  DELIVERED: { label: 'Marquer livrée', destructive: false },
  CANCELLED: { label: 'Annuler', destructive: true },
};

/** Transitions légales pour un statut donné (jamais throw). */
function legalTargets(status: string): TransitionTarget[] {
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) return [];
  return TRANSITION_TARGETS.filter((t) => canTransition(status as OrderStatus, t));
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

/** Nombre CSV FR : virgule décimale (Excel fr). */
function csvNumber(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

/** Date CSV FR : dd/mm/yyyy HH:mm (indépendant des locales du poste). */
function csvDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Tampon local YYYY-MM-DD pour le nom de fichier. */
function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Échappement CSV minimal : quote si séparateur/guillemet/retour ligne. */
function csvEscape(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function itemsLabel(items: OrderItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return '—';
  return items.map((it) => `${it.name} × ${it.qty}`).join(', ');
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

interface PendingAction {
  order: OrderRow;
  target: TransitionTarget;
}

function confirmTitle(target: TransitionTarget): string {
  return target === 'CANCELLED'
    ? 'Annuler cette commande ?'
    : `${ACTION_META[target].label} cette commande ?`;
}

function confirmDescription(order: OrderRow, target: TransitionTarget): string {
  const who = order.guestName || 'ce client';
  const montant = formatEur(order.totalAmount);
  switch (target) {
    case 'CONFIRMED':
      return `La commande de ${who} (${montant}) passera « Confirmée ». Le prestataire peut démarrer la prestation.`;
    case 'PREPARING':
      return `La commande de ${who} (${montant}) passera « En préparation ».`;
    case 'DELIVERED':
      return `La commande de ${who} (${montant}) sera marquée « Livrée ». Statut terminal, horodaté à date.`;
    case 'CANCELLED':
      return `La commande de ${who} (${montant}) sera annulée. Action irréversible : elle sera exclue des revenus.`;
  }
}

export function OrdersContent() {
  const { orders, stats, loading, error, refetch } = useOrders();
  const { properties, selectedId, selectedProperty } = useHostContext();
  const { updateStatus, pendingId } = useUpdateOrderStatus();

  // ----- Filtres client-side -----
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all'); // '7' | '30' | '90' | 'all'
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Mappage id→nom (source de vérité : biens accessibles du contexte).
  const propsById = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);

  // L'API enrichit chaque commande (propertyId + propertyName) ; le hook
  // propage les champs bruts — on résout le nom ici, défensivement.
  const rows = useMemo<OrderRow[]>(
    () =>
      orders.map((o) => {
        const row = o as OrderRow;
        const resolvedName =
          row.propertyName ?? (row.propertyId ? propsById.get(row.propertyId) ?? null : null);
        return {
          ...row,
          propertyName: resolvedName ?? undefined,
        };
      }),
    [orders, propsById],
  );

  const periodDays = periodFilter === 'all' ? null : Number(periodFilter);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter);
    if (paymentFilter !== 'all') list = list.filter((o) => o.paymentStatus === paymentFilter);
    if (periodDays !== null) {
      const since = Date.now() - periodDays * 86_400_000;
      list = list.filter((o) => new Date(o.createdAt).getTime() >= since);
    }
    // Tri Date desc au montage (le DataTable laisse l'ordre d'entrée tant
    // que l'utilisateur n'a pas cliqué un en-tête).
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [rows, statusFilter, paymentFilter, periodDays]);

  const hasActiveFilters =
    statusFilter !== 'all' || paymentFilter !== 'all' || periodFilter !== 'all';

  const scopeLabel = selectedId === 'all' ? 'toutes propriétés' : selectedProperty?.name ?? 'bien sélectionné';

  const hasAllStats = stats !== null;
  const awaitingPayment = hasAllStats ? Math.max(0, stats.revenue - stats.paidRevenue) : 0;

  // ----- Transition de statut (AlertDialog → PATCH) -----
  const transitionBusy = pendingAction !== null && pendingId === pendingAction.order.id;

  async function runTransition() {
    if (!pendingAction) return;
    const { order, target } = pendingAction;
    const result = await updateStatus(order.id, target);
    setPendingAction(null);
    if (result.ok) {
      toast.success(`Commande de ${order.guestName} → ${STATUS_LABELS[target] ?? target}`);
      await refetch();
    } else {
      toast.error(result.error ?? 'Transition refusée');
    }
  }

  // ----- Export CSV des commandes filtrées -----
  function exportCsv() {
    if (filtered.length === 0) {
      toast.error('Aucune commande à exporter pour ce filtre');
      return;
    }
    const header = [
      'Date',
      'Bien',
      'Invité',
      'Email',
      'Prestataire',
      'Articles',
      'Livraison demandée',
      'Note invité',
      'Total (€)',
      'Commission (€)',
      'Part hôte (€)',
      'Statut',
      'Paiement',
    ];
    const lines = filtered.map((o) => [
      csvDate(o.createdAt),
      o.propertyName ?? '—',
      o.guestName,
      o.guestEmail ?? '',
      o.provider?.businessName ?? '—',
      itemsLabel(o.items),
      // REFONTE SERVICES PREMIUM (V4.11) — créneau + note (audit compta/support)
      o.deliveryDate && !Number.isNaN(new Date(o.deliveryDate).getTime())
        ? csvDate(o.deliveryDate)
        : '',
      o.guestNote ?? '',
      csvNumber(o.totalAmount),
      csvNumber(o.commission),
      csvNumber(o.hostEarning),
      STATUS_LABELS[o.status] ?? o.status,
      PAYMENT_LABELS[o.paymentStatus] ?? o.paymentStatus,
    ]);
    // BOM UTF-8 (﻿) pour ouverture directe dans Excel.
    const csv =
      '﻿' +
      [header, ...lines].map((row) => row.map(csvEscape).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commandes-conciergerie-hub-${fileStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Export CSV téléchargé — ${lines.length} ligne${lines.length > 1 ? 's' : ''}`);
  }

  // ----- Colonnes DataTable -----
  const columns: DataTableColumn<OrderRow>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      sortValue: (o) => new Date(o.createdAt).getTime(),
      cell: (o) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap font-medium text-white">{shortDate(o.createdAt)}</p>
          <p className="text-xs text-[#8fa0c2]">{shortTime(o.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'guest',
      header: 'Invité',
      sortValue: (o) => o.guestName,
      cell: (o) => (
        <div className="min-w-0 max-w-[180px]">
          <p className="truncate font-medium text-white" title={o.guestName}>
            {o.guestName || '—'}
          </p>
          {o.guestEmail && (
            <p className="truncate text-xs text-[#8fa0c2]" title={o.guestEmail}>
              {o.guestEmail}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Prestataire',
      sortValue: (o) => o.provider?.businessName ?? '',
      cell: (o) => (
        <div className="min-w-0 max-w-[180px]">
          <p className="truncate font-medium text-white" title={o.provider?.businessName}>
            {o.provider?.businessName ?? '—'}
          </p>
          {o.provider && (
            <p className="truncate text-xs text-[#8fa0c2]">
              {providerCategoryMeta(o.provider.category).label}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Articles',
      hideBelow: 'md',
      cell: (o) => (
        <div className="min-w-0 max-w-[240px]">
          <p className="truncate text-[#8fa0c2]" title={itemsLabel(o.items)}>
            {itemsLabel(o.items)}
          </p>
          {/* REFONTE SERVICES PREMIUM (V4.11) — créneau choisi + note invité */}
          {o.deliveryDate && !Number.isNaN(new Date(o.deliveryDate).getTime()) && (
            <p className="truncate text-[11px] font-semibold text-[#86e9cb]" title={`Livraison demandée : ${new Date(o.deliveryDate).toLocaleString('fr-FR')}`}>
              {new Date(o.deliveryDate).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {o.guestNote && (
            <p className="truncate text-[11px] text-[#fbbf24]" title={`Note de l'invité : ${o.guestNote}`}>
              {o.guestNote}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Montant',
      sortValue: (o) => o.totalAmount,
      cell: (o) => <span className="lux-num font-semibold tabular-nums text-[#34d399]">{formatEur(o.totalAmount)}</span>,
    },
    {
      key: 'commission',
      header: 'Commission',
      hideBelow: 'lg',
      sortValue: (o) => o.commission,
      cell: (o) => <span className="text-[#8fa0c2]">{formatEur(o.commission)}</span>,
    },
    {
      key: 'hostEarning',
      header: 'Part hôte',
      hideBelow: 'lg',
      sortValue: (o) => o.hostEarning,
      cell: (o) => <span className="text-[#8fa0c2]">{formatEur(o.hostEarning)}</span>,
    },
    {
      key: 'status',
      header: 'Statut',
      sortValue: (o) => o.status,
      cell: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: 'payment',
      header: 'Paiement',
      sortValue: (o) => o.paymentStatus,
      cell: (o) => <StatusBadge status={o.paymentStatus} />,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (o) => {
        const targets = legalTargets(o.status);
        if (targets.length === 0) {
          return (
            <span className="text-xs text-[#8fa0c2]/60" title="Statut terminal — aucune action">
              —
            </span>
          );
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 rounded-full p-0 text-[#8fa0c2] hover:bg-white/8 hover:text-white"
                aria-label={`Actions pour la commande de ${o.guestName || 'un invité'}`}
              >
                <span aria-hidden="true" className="text-base leading-none">⋯</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-white/10 bg-[#0d1530] text-white">
              <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fa0c2]">
                Transition de statut
              </DropdownMenuLabel>
              {targets.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={() => setPendingAction({ order: o, target: t })}
                  className={cn(
                    'cursor-pointer focus:bg-white/8 focus:text-white',
                    ACTION_META[t].destructive && 'text-[#f07d6a] focus:bg-[#f07d6a]/10 focus:text-[#f07d6a]',
                  )}
                >
                  <span className="lux-dot shrink-0" style={{ backgroundColor: ACTION_META[t].destructive ? '#f07d6a' : '#5c8af0' }} aria-hidden="true" />
                  {ACTION_META[t].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Performance</p>
          <h1 className="lux-display mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Commandes &amp; Revenus
          </h1>
          <p className="mt-1.5 text-sm text-[#8fa0c2]">
            {loading && orders.length === 0 ? (
              'Chargement des commandes…'
            ) : (
              <>
                {orders.length} commande{orders.length > 1 ? 's' : ''} —{' '}
                <span className="font-semibold text-white">{scopeLabel}</span>
                {hasActiveFilters && (
                  <span className="text-[#8fa0c2]/80">
                    {' '}
                    · {filtered.length} affichée{filtered.length > 1 ? 's' : ''}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-white/12 bg-white/[0.04] px-4 text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
          onClick={exportCsv}
          disabled={loading || filtered.length === 0}
          aria-label="Exporter les commandes filtrées au format CSV"
        >
          Exporter CSV
        </Button>
      </div>

      {/* ---------- Erreur API ---------- */}
      {error && (
        <div className="lux-empty flex flex-col items-center gap-3 p-6 text-center" role="alert">
          <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">{error}</p>
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            aria-label="Réessayer le chargement des commandes"
            className="lux-btn h-9 px-4 text-xs"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ---------- KPIs financières ---------- */}
      <section aria-label="Indicateurs financiers" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          tone="emerald"
          label="Total encaissé"
          value={hasAllStats ? formatEur(stats.paidRevenue) : '—'}
          hint={hasAllStats ? `${stats.paidCount} commande${stats.paidCount > 1 ? 's' : ''} payée${stats.paidCount > 1 ? 's' : ''}` : undefined}
          loading={loading}
        />
        <KPICard
          tone="rausch"
          label="Commissions Hub"
          value={hasAllStats ? formatEur(stats.commissionTotal) : '—'}
          hint={hasAllStats ? 'Part plateforme' : undefined}
          loading={loading}
        />
        <KPICard
          tone="violet"
          label="Revenus prestataires"
          value={hasAllStats ? formatEur(stats.hostTotal) : '—'}
          hint={hasAllStats ? 'Part hôte — reversements' : undefined}
          loading={loading}
        />
        <KPICard
          tone="amber"
          label="En attente de paiement"
          value={hasAllStats ? formatEur(awaitingPayment) : '—'}
          hint={
            hasAllStats
              ? stats.refundedCount > 0
                ? `${stats.refundedCount} commande${stats.refundedCount > 1 ? 's' : ''} remboursée${stats.refundedCount > 1 ? 's' : ''}`
                : `${stats.pendingCount} à confirmer · hors annulées`
              : undefined
          }
          loading={loading}
        />
      </section>

      {/* ---------- Filtres ---------- */}
      <section
        aria-label="Filtres des commandes"
        className="lux-card flex flex-wrap items-center gap-2 p-3"
      >
        <span className="lux-eyebrow mr-1 hidden !text-[9.5px] sm:inline">
          Filtres
        </span>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="h-9 w-[168px] rounded-full border-white/12 bg-white/[0.04] text-sm text-white"
            aria-label="Filtrer par statut de commande"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#0d1530] text-white">
            <SelectItem value="all" className="focus:bg-white/8 focus:text-white">Statut : Tous</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="focus:bg-white/8 focus:text-white">
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger
            className="h-9 w-[178px] rounded-full border-white/12 bg-white/[0.04] text-sm text-white"
            aria-label="Filtrer par statut de paiement"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#0d1530] text-white">
            <SelectItem value="all" className="focus:bg-white/8 focus:text-white">Paiement : Tous</SelectItem>
            <SelectItem value="PAID" className="focus:bg-white/8 focus:text-white">Payée</SelectItem>
            <SelectItem value="UNPAID" className="focus:bg-white/8 focus:text-white">Non payée</SelectItem>
            <SelectItem value="REFUNDED" className="focus:bg-white/8 focus:text-white">Remboursée</SelectItem>
          </SelectContent>
        </Select>

        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger
            className="h-9 w-[150px] rounded-full border-white/12 bg-white/[0.04] text-sm text-white"
            aria-label="Filtrer par période"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#0d1530] text-white">
            <SelectItem value="all" className="focus:bg-white/8 focus:text-white">Tout</SelectItem>
            <SelectItem value="7" className="focus:bg-white/8 focus:text-white">7 derniers jours</SelectItem>
            <SelectItem value="30" className="focus:bg-white/8 focus:text-white">30 derniers jours</SelectItem>
            <SelectItem value="90" className="focus:bg-white/8 focus:text-white">90 derniers jours</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-full text-[#8fa0c2] hover:bg-white/8 hover:text-white"
            onClick={() => {
              setStatusFilter('all');
              setPaymentFilter('all');
              setPeriodFilter('all');
            }}
            aria-label="Réinitialiser les filtres"
          >
            Réinitialiser
          </Button>
        )}

        <span className="ml-auto hidden text-xs text-[#8fa0c2] sm:inline">
          {filtered.length}/{rows.length} commande{rows.length > 1 ? 's' : ''}
        </span>
      </section>

      {/* ---------- Tableau ---------- */}
      <section aria-label="Tableau des commandes">
        {loading && rows.length === 0 ? (
          <Skeleton className="h-72 w-full rounded-2xl bg-white/8" aria-hidden="true" />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(o) => o.id}
            className="lux-card p-3 sm:p-4"
            pageSize={10}
            emptyMessage={
              hasActiveFilters ? 'Aucune commande pour ce filtre' : 'Aucune commande pour le moment'
            }
          />
        )}
      </section>

      {/* ---------- AlertDialog de confirmation de transition ---------- */}
      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent className="rounded-2xl border-white/10 bg-[#0b1226] text-white shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display text-lg font-semibold text-white">
              {pendingAction ? confirmTitle(pendingAction.target) : ''}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#8fa0c2]">
              {pendingAction ? confirmDescription(pendingAction.order, pendingAction.target) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={transitionBusy}
              className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
            >
              Retour
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                'rounded-full font-semibold',
                pendingAction?.target === 'CANCELLED'
                  ? 'bg-[#f07d6a] text-[#2a100a] hover:brightness-105 focus:ring-[#f07d6a]/50'
                  : 'bg-[#5c8af0] text-white hover:bg-[#4a79e0] focus:ring-[#5c8af0]/50',
              )}
              disabled={transitionBusy}
              onClick={(e) => {
                e.preventDefault(); // garde la modale ouverte pendant l'appel
                void runTransition();
              }}
            >
              {transitionBusy ? 'En cours…' : pendingAction?.target === 'CANCELLED' ? 'Oui, annuler' : 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* v4.54 « PRESSING & BLANCHISSERIE EXPRESS » — suivi des commandes */}
      <LaundryOrdersPanel />
    </div>
  );
}

// =============================================================
// v4.54 « PRESSING & BLANCHISSERIE EXPRESS » (amélioration 1.5)
// Panneau de suivi des commandes pressing du bien sélectionné :
// statut du cycle de vie (demandée → payée → en cours → prête →
// livrée) + règlement hors plateforme + annulation.
// =============================================================
interface LaundryOrderApi {
  id: string;
  bookingId: string | null;
  guestName: string | null;
  serviceType: string;
  pieces: number;
  pickupSlot: string;
  notes: string | null;
  amountEur: number;
  payment: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

function LaundryOrdersPanel() {
  const { selectedId, selectedProperty } = useHostContext();
  const [orders, setOrders] = useState<LaundryOrderApi[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(pid)}/laundry-orders`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as { orders?: LaundryOrderApi[] } | null;
      if (res.ok && json) setOrders(json.orders ?? []);
      else setOrders(null);
    } catch {
      setOrders(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId === 'all' || !selectedProperty?.id) {
      setOrders(null);
      return;
    }
    void load(selectedProperty.id);
  }, [selectedId, selectedProperty, load]);

  const patch = async (orderId: string, action: 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCEL' | 'MARK_PAID') => {
    if (!selectedProperty?.id || busyId) return;
    setBusyId(orderId);
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(selectedProperty.id)}/laundry-orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      });
      if (!res.ok) throw new Error('http');
      setOrders((prev) =>
        prev
          ? prev.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    status:
                      action === 'MARK_PAID' ? 'PAID' : action === 'CANCEL' ? 'CANCELLED' : action,
                    paidAt: action === 'MARK_PAID' ? new Date().toISOString() : o.paidAt,
                  }
                : o,
            )
          : prev,
      );
      toast.success('Commande mise à jour ✅');
    } catch {
      toast.error('Mise à jour impossible. Réessayez.');
    } finally {
      setBusyId(null);
    }
  };

  if (selectedId === 'all') return null;

  const active = (orders ?? []).filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
  const done = (orders ?? []).filter((o) => o.status === 'DELIVERED' || o.status === 'CANCELLED');

  return (
    <section className="lux-card p-5" aria-label="Commandes pressing">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="lux-eyebrow !text-[9.5px]">Services</p>
          <h2 className="lux-display mt-1 text-lg font-semibold text-white">
            Pressing &amp; Blanchisserie Express
          </h2>
          <p className="mt-0.5 text-xs text-[#8fa0c2]">
            Commandes pressing de vos invités (repassage, lessive, pressing à sec) — {selectedProperty?.name ?? ''}.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-full border-white/12 bg-white/[0.04] text-xs text-[#d5def0] hover:bg-white/8 hover:text-white"
          disabled={loading || !selectedProperty?.id}
          onClick={() => selectedProperty?.id && void load(selectedProperty.id)}
          aria-label="Rafraîchir les commandes pressing"
        >
          Actualiser
        </Button>
      </div>

      {orders === null && !loading ? (
        <div className="lux-empty mt-4 flex flex-col items-center gap-2 p-6 text-center">
          <span className="lux-dot" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">Aucune commande pressing</p>
          <p className="text-xs text-[#8fa0c2]">
            Vos invités commandent depuis l&apos;onglet Services de leur Hub.
          </p>
        </div>
      ) : loading && orders === null ? (
        <Skeleton className="mt-4 h-24 w-full rounded-2xl bg-white/8" />
      ) : (
        <div className="mt-4 space-y-3">
          {active.length === 0 && done.length === 0 && (
            <div className="lux-empty flex flex-col items-center gap-2 p-6 text-center">
              <span className="lux-dot" style={{ backgroundColor: '#5c8af0' }} aria-hidden="true" />
              <p className="text-sm font-semibold text-white">Aucune commande pressing</p>
              <p className="text-xs text-[#8fa0c2]">
                Vos invités commandent depuis l&apos;onglet Services de leur Hub.
              </p>
            </div>
          )}
          {active.map((o) => {
            const meta = LAUNDRY_STATUS_HOST_META[o.status] ?? { label: o.status, className: 'border-white/12 bg-white/[0.04] text-[#8fa0c2]' };
            return (
              <div
                key={o.id}
                className="flex flex-col gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05] sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {laundryOrderSummary(o.serviceType, o.pieces)}
                    <span className={`ml-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                      {meta.label}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[#8fa0c2]">
                    {o.guestName ?? 'Invité'} · récupération {pickupSlotLabel(o.pickupSlot)} ·{' '}
                    {new Date(o.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ·{' '}
                    <strong className="text-white">{o.amountEur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</strong>
                    {o.payment === 'stripe' ? ' · carte' : ' · à régler avec l\u2019hôte'}
                  </p>
                  {o.notes && <p className="mt-1 text-xs italic text-[#8fa0c2]/80">« {o.notes.slice(0, 160)} »</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {o.status !== 'PAID' && o.payment !== 'stripe' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full border-[#34d399]/30 bg-[#34d399]/10 text-xs font-semibold text-[#34d399] hover:bg-[#34d399]/20 hover:text-[#34d399]"
                      disabled={busyId === o.id}
                      onClick={() => void patch(o.id, 'MARK_PAID')}
                    >
                      Encaissé
                    </Button>
                  )}
                  {o.status === 'PAID' || o.status === 'REQUESTED' || o.status === 'PENDING_PAYMENT' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                      disabled={busyId === o.id}
                      onClick={() => void patch(o.id, 'IN_PROGRESS')}
                    >
                      En cours
                    </Button>
                  ) : o.status === 'IN_PROGRESS' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                      disabled={busyId === o.id}
                      onClick={() => void patch(o.id, 'READY')}
                    >
                      Prête
                    </Button>
                  ) : o.status === 'READY' ? (
                    <Button
                      type="button"
                      size="sm"
                      className="lux-btn h-8 px-3 text-xs"
                      disabled={busyId === o.id}
                      onClick={() => void patch(o.id, 'DELIVERED')}
                    >
                      Livrée
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full border-[#f07d6a]/30 bg-transparent text-xs font-semibold text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                    disabled={busyId === o.id}
                    onClick={() => void patch(o.id, 'CANCEL')}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            );
          })}
          {done.length > 0 && (
            <details className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Historique ({done.length})
              </summary>
              <ul className="mt-2.5 space-y-1.5">
                {done.map((o) => {
                  const meta = LAUNDRY_STATUS_HOST_META[o.status] ?? { label: o.status, className: 'border-white/12 bg-white/[0.04] text-[#8fa0c2]' };
                  return (
                    <li key={o.id} className="text-xs text-[#8fa0c2]">
                      {laundryOrderSummary(o.serviceType, o.pieces)} — {o.guestName ?? 'Invité'} ·{' '}
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span> ·{' '}
                      {new Date(o.createdAt).toLocaleDateString('fr-FR')} ·{' '}
                      {o.amountEur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

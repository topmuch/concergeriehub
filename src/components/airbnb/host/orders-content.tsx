'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react';
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
// (spécification QRTags Pro, T4-b)
//
// • 4 KPIs réelles : 💰 Total encaissé · 🧾 Commissions Hub ·
//   🤝 Revenus prestataires · ⏳ En attente de paiement
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

const ACTION_META: Record<TransitionTarget, { label: string; emoji: string; destructive: boolean }> = {
  CONFIRMED: { label: 'Confirmer', emoji: '✅', destructive: false },
  PREPARING: { label: 'Passer en préparation', emoji: '📦', destructive: false },
  DELIVERED: { label: 'Marquer livrée', emoji: '📬', destructive: false },
  CANCELLED: { label: 'Annuler', emoji: '🚫', destructive: true },
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
      csvNumber(o.totalAmount),
      csvNumber(o.commission),
      csvNumber(o.hostEarning),
      STATUS_LABELS[o.status] ?? o.status,
      PAYMENT_LABELS[o.paymentStatus] ?? o.paymentStatus,
    ]);
    // BOM UTF-8 (\uFEFF) pour ouverture directe dans Excel.
    const csv =
      '\uFEFF' +
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
          <p className="whitespace-nowrap font-medium text-slate-800">{shortDate(o.createdAt)}</p>
          <p className="text-xs text-slate-400">{shortTime(o.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'guest',
      header: 'Invité',
      sortValue: (o) => o.guestName,
      cell: (o) => (
        <div className="min-w-0 max-w-[180px]">
          <p className="truncate font-medium text-slate-800" title={o.guestName}>
            {o.guestName || '—'}
          </p>
          {o.guestEmail && (
            <p className="truncate text-xs text-slate-400" title={o.guestEmail}>
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
          <p className="truncate font-medium text-slate-800" title={o.provider?.businessName}>
            {o.provider?.businessName ?? '—'}
          </p>
          {o.provider && (
            <p className="truncate text-xs text-slate-400">
              {providerCategoryMeta(o.provider.category).emoji}{' '}
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
        <p className="min-w-0 max-w-[240px] truncate text-slate-600" title={itemsLabel(o.items)}>
          {itemsLabel(o.items)}
        </p>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Montant',
      sortValue: (o) => o.totalAmount,
      cell: (o) => <span className="font-bold text-slate-900">{formatEur(o.totalAmount)}</span>,
    },
    {
      key: 'commission',
      header: 'Commission',
      hideBelow: 'lg',
      sortValue: (o) => o.commission,
      cell: (o) => <span className="text-slate-500">{formatEur(o.commission)}</span>,
    },
    {
      key: 'hostEarning',
      header: 'Part hôte',
      hideBelow: 'lg',
      sortValue: (o) => o.hostEarning,
      cell: (o) => <span className="text-slate-500">{formatEur(o.hostEarning)}</span>,
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
            <span className="text-xs text-slate-300" title="Statut terminal — aucune action">
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
                className="h-9 w-9 p-0 text-slate-500 hover:text-slate-900"
                aria-label={`Actions pour la commande de ${o.guestName || 'un invité'}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-slate-500">
                Transition de statut
              </DropdownMenuLabel>
              {targets.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={() => setPendingAction({ order: o, target: t })}
                  className={cn(
                    'cursor-pointer gap-2',
                    ACTION_META[t].destructive && 'text-rose-600 focus:text-rose-700',
                  )}
                >
                  <span aria-hidden="true">{ACTION_META[t].emoji}</span>
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Commandes &amp; Revenus
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {loading && orders.length === 0 ? (
              'Chargement des commandes…'
            ) : (
              <>
                {orders.length} commande{orders.length > 1 ? 's' : ''} —{' '}
                <span className="font-semibold text-slate-900">{scopeLabel}</span>
                {hasActiveFilters && (
                  <span className="text-slate-500">
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
          className="h-9 gap-2 border-slate-200 text-slate-700"
          onClick={exportCsv}
          disabled={loading || filtered.length === 0}
          aria-label="Exporter les commandes filtrées au format CSV"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter CSV
        </Button>
      </div>

      {/* ---------- Erreur API ---------- */}
      {error && (
        <div
          className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* ---------- KPIs financières ---------- */}
      <section aria-label="Indicateurs financiers" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          icon="💰"
          label="Total encaissé"
          value={hasAllStats ? formatEur(stats.paidRevenue) : '—'}
          hint={hasAllStats ? `${stats.paidCount} commande${stats.paidCount > 1 ? 's' : ''} payée${stats.paidCount > 1 ? 's' : ''}` : undefined}
          loading={loading}
        />
        <KPICard
          icon="🧾"
          label="Commissions Hub"
          value={hasAllStats ? formatEur(stats.commissionTotal) : '—'}
          hint={hasAllStats ? 'Part plateforme' : undefined}
          loading={loading}
        />
        <KPICard
          icon="🤝"
          label="Revenus prestataires"
          value={hasAllStats ? formatEur(stats.hostTotal) : '—'}
          hint={hasAllStats ? 'Part hôte — reversements' : undefined}
          loading={loading}
        />
        <KPICard
          icon="⏳"
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
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <span className="mr-1 hidden text-xs font-bold uppercase tracking-wide text-slate-500 sm:inline">
          Filtres
        </span>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="h-9 w-[168px] border-slate-200 text-sm"
            aria-label="Filtrer par statut de commande"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Statut : Tous</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger
            className="h-9 w-[178px] border-slate-200 text-sm"
            aria-label="Filtrer par statut de paiement"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Paiement : Tous</SelectItem>
            <SelectItem value="PAID">Payée</SelectItem>
            <SelectItem value="UNPAID">Non payée</SelectItem>
            <SelectItem value="REFUNDED">Remboursée</SelectItem>
          </SelectContent>
        </Select>

        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger
            className="h-9 w-[150px] border-slate-200 text-sm"
            aria-label="Filtrer par période"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tout</SelectItem>
            <SelectItem value="7">7 derniers jours</SelectItem>
            <SelectItem value="30">30 derniers jours</SelectItem>
            <SelectItem value="90">90 derniers jours</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-slate-600"
            onClick={() => {
              setStatusFilter('all');
              setPaymentFilter('all');
              setPeriodFilter('all');
            }}
            aria-label="Réinitialiser les filtres"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Réinitialiser
          </Button>
        )}

        <span className="ml-auto hidden text-xs text-slate-500 sm:inline">
          {filtered.length}/{rows.length} commande{rows.length > 1 ? 's' : ''}
        </span>
      </section>

      {/* ---------- Tableau ---------- */}
      <section aria-label="Tableau des commandes">
        {loading && rows.length === 0 ? (
          <Skeleton className="h-72 w-full rounded-xl" aria-hidden="true" />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(o) => o.id}
            pageSize={10}
            emptyMessage={
              hasActiveFilters ? '💰 Aucune commande pour ce filtre' : '💰 Aucune commande pour le moment'
            }
          />
        )}
      </section>

      {/* ---------- AlertDialog de confirmation de transition ---------- */}
      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-slate-900">
              {pendingAction ? confirmTitle(pendingAction.target) : ''}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              {pendingAction ? confirmDescription(pendingAction.order, pendingAction.target) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transitionBusy}>Retour</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                pendingAction?.target === 'CANCELLED' &&
                  'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600',
                pendingAction?.target === 'CONFIRMED' && 'bg-[#E23F2B] text-white hover:bg-[#c93522] focus:ring-[#E23F2B]',
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
    </div>
  );
}

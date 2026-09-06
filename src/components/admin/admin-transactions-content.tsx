'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Banknote,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Store,
  Wallet,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminMarketplace } from '@/components/admin/admin-marketplace';

// =============================================================
// AdminTransactionsContent — Module 6 Transactions
//  - Onglet Commandes : ServiceOrder réels (GMV, commissions,
//    statuts paiement) via /api/admin/orders
//  - Onglet Marketplace : AdminMarketplace (composant réel rebranché,
//    endpoints /api/client/* désormais superadmin-only)
//  - Onglet Reversements : payouts prestataires via
//    /api/admin/payouts (Stripe Connect si configuré, sinon manuel)
// =============================================================

interface OrderRow {
  id: string;
  guestName: string;
  guestEmail: string | null;
  itemSummary: string;
  totalAmount: number;
  commission: number;
  hostEarning: number;
  status: string;
  paymentStatus: string;
  stripePaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  provider: { id: string; businessName: string; category: string; stripeChargesEnabled: boolean };
}

interface OrdersStats {
  gmvPaidEur: number;
  commissionEur: number;
  hostEarningsEur: number;
  pendingEur: number;
  refundedEur: number;
  payoutsPaidEur: number;
  ordersTotal: number;
}

interface PayoutProviderRow {
  id: string;
  businessName: string;
  category: string;
  stripeChargesEnabled: boolean;
  stripeConnectEnabled: boolean;
  earnedEur: number;
  paidEur: number;
  reversibleEur: number;
}

interface PayoutRow {
  id: string;
  providerName: string;
  amount: number;
  status: string;
  method: string;
  stripeTransferId: string | null;
  ordersCount: number;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
}

const PAY_STATUS: Record<string, { label: string; className: string }> = {
  PAID: { label: 'Payée', className: 'bg-emerald-100 text-emerald-800' },
  UNPAID: { label: 'Impayée', className: 'bg-amber-100 text-amber-800' },
  REFUNDED: { label: 'Remboursée', className: 'bg-slate-100 text-slate-600' },
  FAILED: { label: 'Échec', className: 'bg-red-100 text-red-700' },
};

export function AdminTransactionsContent() {
  const [stats, setStats] = useState<OrdersStats | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [payoutProviders, setPayoutProviders] = useState<PayoutProviderRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(true);
  const [payoutTarget, setPayoutTarget] = useState<PayoutProviderRow | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);

  // AUD-FULL ④ — Remboursement Superadmin (moteur /api/admin/orders/[id]/refund)
  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders?limit=50');
      if (!res.ok) throw new Error('Erreur de chargement des commandes');
      const data = await res.json();
      setStats(data.stats);
      setOrders(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPayouts = useCallback(async () => {
    setPayoutLoading(true);
    try {
      const res = await fetch('/api/admin/payouts');
      if (!res.ok) throw new Error('Erreur de chargement des reversements');
      const data = await res.json();
      setPayoutProviders(Array.isArray(data.providers) ? data.providers : []);
      setPayouts(Array.isArray(data.payouts) ? data.payouts : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setPayoutLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchPayouts();
  }, [fetchOrders, fetchPayouts]);

  const createPayout = async () => {
    if (!payoutTarget) return;
    setPayoutBusy(true);
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: payoutTarget.id, amount: Number(payoutAmount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'Reversement enregistré');
      setPayoutTarget(null);
      setPayoutAmount('');
      fetchPayouts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setPayoutBusy(false);
    }
  };

  // Remboursement total de la commande via le moteur partagé avec la
  // route hôte (Stripe réel si clé configurée, sinon mode démo tracé).
  const refundOrder = async () => {
    if (!refundTarget) return;
    setRefundBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${refundTarget.id}/refund`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      const amount = data.refund?.totalAmount ?? refundTarget.totalAmount;
      toast.success(
        data.refund?.mode === 'stripe'
          ? `Remboursement Stripe de ${Number(amount).toFixed(2)} € effectué`
          : `Remboursement de ${Number(amount).toFixed(2)} € enregistré (mode démo — sans clé Stripe)`,
      );
      setRefundTarget(null);
      fetchOrders(); // refetch : statut + KPIs finance recalculés
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ----- KPIs finance réels ----- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'GMV payée (total)', value: stats ? `${stats.gmvPaidEur.toFixed(2)} €` : undefined, emoji: '💰' },
          { label: 'Commission plateforme', value: stats ? `${stats.commissionEur.toFixed(2)} €` : undefined, emoji: '🏛️' },
          { label: 'En attente de paiement', value: stats ? `${stats.pendingEur.toFixed(2)} €` : undefined, emoji: '⏳' },
          { label: 'Reversements versés', value: stats ? `${stats.payoutsPaidEur.toFixed(2)} €` : undefined, emoji: '🏦' },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-slate-200 bg-white">
            <CardContent className="p-4">
              <p aria-hidden="true" className="text-lg">{kpi.emoji}</p>
              <div className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">
                {kpi.value === undefined ? <Skeleton className="h-7 w-20" /> : kpi.value}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 bg-white">
        <CardContent className="p-0">
          <Tabs defaultValue="commandes" className="gap-0">
            <div className="border-b border-slate-100 px-4 pt-4 sm:px-6">
              <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
                <TabsTrigger value="commandes" className="gap-1.5">
                  <ShoppingCart className="h-4 w-4" /> Commandes de service
                </TabsTrigger>
                <TabsTrigger value="marketplace" className="gap-1.5">
                  <Store className="h-4 w-4" /> Marketplace
                </TabsTrigger>
                <TabsTrigger value="payouts" className="gap-1.5">
                  <Banknote className="h-4 w-4" /> Reversements
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ----- Commandes de service ----- */}
            <TabsContent value="commandes" className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between">
                <CardDescription>
                  {stats ? `${stats.ordersTotal} commande(s) — remboursements : ${stats.refundedEur.toFixed(2)} €` : '…'}
                </CardDescription>
                <Button variant="outline" size="sm" onClick={fetchOrders}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Rafraîchir
                </Button>
              </div>
              {loading ? (
                <TableSkeletonRows />
              ) : orders.length === 0 ? (
                <EmptyState text="Aucune commande de service en base." />
              ) : (
                <div className="max-h-[32rem] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead>Invité / prestation</TableHead>
                        <TableHead>Prestataire</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead className="hidden md:table-cell">Commission</TableHead>
                        <TableHead>Paiement</TableHead>
                        <TableHead className="hidden lg:table-cell">Date</TableHead>
                        <TableHead className="w-32">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o) => {
                        const pay = PAY_STATUS[o.paymentStatus] ?? { label: o.paymentStatus, className: 'bg-slate-100 text-slate-600' };
                        return (
                          <TableRow key={o.id}>
                            <TableCell>
                              <p className="font-semibold text-slate-900">{o.guestName}</p>
                              <p className="max-w-56 truncate text-xs text-slate-500">{o.itemSummary}</p>
                            </TableCell>
                            <TableCell className="text-sm">{o.provider.businessName}</TableCell>
                            <TableCell className="text-sm font-bold">
                              <span className={o.paymentStatus === 'REFUNDED' ? 'text-slate-400 line-through' : ''}>
                                {o.totalAmount.toFixed(2)} €
                              </span>
                              {o.paymentStatus === 'REFUNDED' && (
                                <p className="text-xs font-normal text-slate-400">Remboursée au client</p>
                              )}
                            </TableCell>
                            <TableCell className="hidden text-sm text-slate-500 md:table-cell">
                              {o.commission.toFixed(2)} €
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${pay.className}`}>
                                {pay.label}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-sm text-slate-500 lg:table-cell">
                              {format(new Date(o.createdAt), 'dd MMM yyyy', { locale: fr })}
                            </TableCell>
                            <TableCell>
                              {/* 💸 Rembourser : uniquement une commande PAID (le
                                  moteur refuse UNPAID/FAILED/REFUNDED en 409). */}
                              {o.paymentStatus === 'PAID' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                  onClick={() => setRefundTarget(o)}
                                >
                                  💸 Rembourser
                                </Button>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ----- Marketplace (composant orphelin rebranché) ----- */}
            <TabsContent value="marketplace" className="p-4 sm:p-6">
              <AdminMarketplace />
            </TabsContent>

            {/* ----- Reversements ----- */}
            <TabsContent value="payouts" className="space-y-4 p-4 sm:p-6">
              <div>
                <CardTitle className="text-base">🏦 Gains réversibles par prestataire</CardTitle>
                <CardDescription>
                  Part prestataire des commandes payées, non encore reversée.
                  {payoutProviders.some((p) => p.stripeChargesEnabled && p.stripeConnectEnabled)
                    ? ' Stripe Connect actif : transferts automatiques.'
                    : ' Stripe Connect non configuré : reversements manuels tracés.'}
                </CardDescription>
              </div>
              {payoutLoading ? (
                <TableSkeletonRows />
              ) : payoutProviders.length === 0 ? (
                <EmptyState text="Aucun prestataire actif." />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prestataire</TableHead>
                        <TableHead>Gains cumulés</TableHead>
                        <TableHead>Déjà reversé</TableHead>
                        <TableHead>Réversible</TableHead>
                        <TableHead className="hidden md:table-cell">Stripe Connect</TableHead>
                        <TableHead className="w-28"><span className="sr-only">Action</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payoutProviders.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-semibold text-slate-900">{p.businessName}</TableCell>
                          <TableCell className="text-sm">{p.earnedEur.toFixed(2)} €</TableCell>
                          <TableCell className="text-sm text-slate-500">{p.paidEur.toFixed(2)} €</TableCell>
                          <TableCell className="text-sm font-bold text-emerald-700">
                            {p.reversibleEur.toFixed(2)} €
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {p.stripeChargesEnabled ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700">Actif</Badge>
                            ) : (
                              <Badge variant="outline" className="border-slate-300 text-slate-700">Non onboardé</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant={p.reversibleEur > 0 ? 'default' : 'outline'}
                              disabled={p.reversibleEur <= 0}
                              onClick={() => {
                                setPayoutTarget(p);
                                setPayoutAmount(p.reversibleEur.toFixed(2));
                              }}
                            >
                              <Wallet className="mr-1.5 h-4 w-4" /> Payer
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="pt-2">
                <CardTitle className="mb-2 text-base">📜 Historique des reversements</CardTitle>
                {payouts.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun reversement encore enregistré.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          <TableHead>Prestataire</TableHead>
                          <TableHead>Montant</TableHead>
                          <TableHead>Méthode</TableHead>
                          <TableHead className="hidden sm:table-cell">Référence</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payouts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.providerName}</TableCell>
                            <TableCell className="text-sm font-bold">{p.amount.toFixed(2)} €</TableCell>
                            <TableCell>
                              <Badge variant={p.method === 'STRIPE_CONNECT' ? 'default' : 'outline'}>
                                {p.method === 'STRIPE_CONNECT' ? 'Stripe Connect' : 'Manuel'}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden font-mono text-xs text-slate-500 sm:table-cell">
                              {p.stripeTransferId ?? '—'}
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {format(new Date(p.paidAt ?? p.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ----- Dialog reversement ----- */}
      <Dialog open={payoutTarget !== null} onOpenChange={(o) => !o && setPayoutTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reversement — {payoutTarget?.businessName}</DialogTitle>
            <DialogDescription>
              Réversible : {payoutTarget?.reversibleEur.toFixed(2)} €.
              {payoutTarget?.stripeChargesEnabled
                ? ' Transfert Stripe Connect réel si la clé est configurée.'
                : ' Sans Stripe, le reversement est enregistré comme virement manuel.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="payout-amount">Montant (€)</Label>
            <Input
              id="payout-amount"
              type="number"
              min="0"
              step="0.01"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={createPayout} disabled={payoutBusy || !(Number(payoutAmount) > 0)}>
              {payoutBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer le reversement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----- Confirmation remboursement (irréversible) ----- */}
      <AlertDialog open={refundTarget !== null} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>💸 Rembourser cette commande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Remboursement total via Stripe sur le paiement d&apos;origine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="font-medium text-slate-500">Invité</dt>
              <dd className="font-semibold text-slate-900">{refundTarget?.guestName}</dd>
              <dt className="font-medium text-slate-500">Service</dt>
              <dd className="max-w-64 truncate font-semibold text-slate-900">{refundTarget?.itemSummary}</dd>
              <dt className="font-medium text-slate-500">Prestataire</dt>
              <dd className="font-semibold text-slate-900">{refundTarget?.provider.businessName}</dd>
              <dt className="font-medium text-slate-500">Montant total</dt>
              <dd className="text-base font-extrabold text-slate-900">
                {refundTarget?.totalAmount.toFixed(2)} €
              </dd>
            </dl>
          </div>
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            ⚠️ Le remboursement Stripe est irréversible. La Transaction d&apos;origine passera au statut « refunded ».
            {" "}Sans clé Stripe configurée, le remboursement est tracé en mode démo (états basculés en base, sans appel Stripe).
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refundBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                if (refundTarget) refundOrder();
              }}
              disabled={refundBusy}
            >
              {refundBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer le remboursement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
      <ShoppingCart className="mb-3 h-10 w-10 text-slate-300" />
      <p className="max-w-md text-sm text-slate-500">{text}</p>
    </div>
  );
}

function TableSkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

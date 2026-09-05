'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  CreditCard,
  FileText,
  Loader2,
  RefreshCw,
  TicketPercent,
  XCircle,
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
import { AdminPacks } from '@/components/admin/admin-packs';

// =============================================================
// AdminSubscriptions — Module 4 Abonnements
//  - KPIs réels : MRR, ARR, actifs, impayés, churn 30 j
//  - Onglet Abonnements : table (hôtes/marchands/prestataires)
//    + actions cancel / reactivate (confirmées, auditées)
//  - Onglet Factures : paiements d'abonnement (Transaction réels)
//  - Onglet Coupons : création + annulation (coupon marketplace)
//  - Onglet Packs : réutilisation du composant AdminPacks (config)
// Sources : /api/admin/subscriptions, /api/admin/coupons.
// =============================================================

interface SubRow {
  id: string;
  plan: string;
  amount: number;
  currency: string;
  billingCycle: string;
  status: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  subscriber: { type: string; id: string; name: string; email: string | null };
}

interface InvoiceRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  stripePaymentId: string | null;
  createdAt: string;
}

interface CouponRow {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxUses: number;
  currentUses: number;
  scans: number;
  status: string;
  commissionRate: number;
  validUntil: string | null;
  createdAt: string;
  merchantName: string;
  ownerEmail: string | null;
}

interface SubsStats {
  mrrEur: number;
  arrEur: number;
  activeCount: number;
  pastDueCount: number;
  cancelled30d: number;
  byPlan: { plan: string; count: number }[];
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: 'Actif', className: 'bg-emerald-100 text-emerald-800' },
  past_due: { label: 'Impayé', className: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Annulé', className: 'bg-slate-100 text-slate-600' },
  trialing: { label: 'Essai', className: 'bg-sky-100 text-sky-800' },
};

export function AdminSubscriptionsContent() {
  const [stats, setStats] = useState<SubsStats | null>(null);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponDialog, setCouponDialog] = useState(false);
  const [couponForm, setCouponForm] = useState({ code: '', discountType: 'percentage', discountValue: '10', maxUses: '50', commissionRate: '5' });
  const [couponBusy, setCouponBusy] = useState(false);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/subscriptions');
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      setStats(data.stats);
      setSubs(Array.isArray(data.data) ? data.data : []);
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCoupons = useCallback(async () => {
    setCouponsLoading(true);
    try {
      const res = await fetch('/api/admin/coupons');
      if (!res.ok) throw new Error('Erreur de chargement des coupons');
      const data = await res.json();
      setCoupons(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCouponsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubs();
    fetchCoupons();
  }, [fetchSubs, fetchCoupons]);

  const subAction = async (sub: SubRow, action: 'cancel' | 'reactivate') => {
    setBusyId(sub.id);
    try {
      const res = await fetch(`/api/admin/subscriptions/${sub.id}?action=${action}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'OK');
      fetchSubs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setBusyId(null);
    }
  };

  const createCoupon = async () => {
    setCouponBusy(true);
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponForm.code || undefined,
          discountType: couponForm.discountType,
          discountValue: Number(couponForm.discountValue),
          maxUses: Number(couponForm.maxUses),
          commissionRate: Number(couponForm.commissionRate),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(`Coupon ${data.coupon.code} créé`);
      setCouponDialog(false);
      setCouponForm({ code: '', discountType: 'percentage', discountValue: '10', maxUses: '50', commissionRate: '5' });
      fetchCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCouponBusy(false);
    }
  };

  const cancelCoupon = async (coupon: CouponRow) => {
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}?action=cancel`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      toast.success(data.message || 'Coupon annulé');
      fetchCoupons();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ----- KPIs réels ----- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'MRR (revenu mensuel récurrent)', value: stats ? `${stats.mrrEur.toFixed(2)} €` : undefined, emoji: '💰' },
          { label: 'ARR (projections 12 mois)', value: stats ? `${stats.arrEur.toFixed(2)} €` : undefined, emoji: '📈' },
          { label: 'Abonnements actifs', value: stats?.activeCount, emoji: '✅' },
          { label: 'Impayés / churn 30 j', value: stats ? `${stats.pastDueCount} / ${stats.cancelled30d}` : undefined, emoji: '⚠️' },
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
          <Tabs defaultValue="abonnements" className="gap-0">
            <div className="border-b border-slate-100 px-4 pt-4 sm:px-6">
              <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
                <TabsTrigger value="abonnements" className="gap-1.5">
                  <CreditCard className="h-4 w-4" /> Abonnements
                </TabsTrigger>
                <TabsTrigger value="factures" className="gap-1.5">
                  <FileText className="h-4 w-4" /> Factures
                </TabsTrigger>
                <TabsTrigger value="coupons" className="gap-1.5">
                  <TicketPercent className="h-4 w-4" /> Coupons
                </TabsTrigger>
                <TabsTrigger value="packs" className="gap-1.5">
                  📦 Packs & Config
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ----- Onglet Abonnements ----- */}
            <TabsContent value="abonnements" className="p-4 sm:p-6">
              {loading ? (
                <TableSkeletonRows />
              ) : subs.length === 0 ? (
                <EmptyState text="Aucun abonnement en base — les abonnements apparaissent dès le premier paiement (Stripe ou démo)." />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Souscripteur</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead className="hidden md:table-cell">Statut</TableHead>
                        <TableHead className="hidden lg:table-cell">Fin de période</TableHead>
                        <TableHead className="hidden xl:table-cell">Créé le</TableHead>
                        <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subs.map((s) => {
                        const st = STATUS_LABEL[s.status] ?? { label: s.status, className: 'bg-slate-100 text-slate-600' };
                        return (
                          <TableRow key={s.id}>
                            <TableCell>
                              <p className="font-semibold text-slate-900">{s.subscriber.name}</p>
                              <p className="text-xs text-slate-500">
                                {s.subscriber.type === 'user' ? s.subscriber.email : s.subscriber.type}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-slate-300 text-slate-700">{s.plan}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              <span className="font-semibold">{s.amount.toFixed(2)} €</span>
                              <span className="text-slate-500"> / {s.billingCycle === 'monthly' ? 'mois' : 'an'}</span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${st.className}`}>
                                {st.label}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-sm text-slate-500 lg:table-cell">
                              {s.currentPeriodEnd ? format(new Date(s.currentPeriodEnd), 'dd MMM yyyy', { locale: fr }) : '—'}
                            </TableCell>
                            <TableCell className="hidden text-sm text-slate-500 xl:table-cell">
                              {format(new Date(s.createdAt), 'dd MMM yyyy', { locale: fr })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {busyId === s.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                                {s.status === 'active' && (
                                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                                    onClick={() => subAction(s, 'cancel')} disabled={busyId === s.id}
                                    aria-label="Annuler cet abonnement">
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                )}
                                {s.status !== 'active' && (
                                  <Button variant="ghost" size="sm" className="text-emerald-700 hover:text-emerald-800"
                                    onClick={() => subAction(s, 'reactivate')} disabled={busyId === s.id}
                                    aria-label="Réactiver cet abonnement">
                                    <RefreshCw className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ----- Onglet Factures ----- */}
            <TabsContent value="factures" className="p-4 sm:p-6">
              {invoices.length === 0 ? (
                <EmptyState text="Aucune facture — les paiements d'abonnement (webhook Stripe / démo) y apparaissent." />
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead>Facture</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="hidden sm:table-cell">Référence Stripe</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-mono text-xs">#{i.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-sm font-semibold">{i.amount.toFixed(2)} €</TableCell>
                          <TableCell>
                            <Badge variant={i.status === 'completed' || i.status === 'PAID' ? 'default' : 'outline'}>
                              {i.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden font-mono text-xs text-slate-500 sm:table-cell">
                            {i.stripePaymentId ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {format(new Date(i.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ----- Onglet Coupons ----- */}
            <TabsContent value="coupons" className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">Coupons marketplace — réductions et scans réels.</p>
                <Button size="sm" onClick={() => setCouponDialog(true)}>
                  <TicketPercent className="mr-2 h-4 w-4" /> Nouveau coupon
                </Button>
              </div>
              {couponsLoading ? (
                <TableSkeletonRows />
              ) : coupons.length === 0 ? (
                <EmptyState text="Aucun coupon en base." />
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Réduction</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead className="hidden sm:table-cell">Marchand</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coupons.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-sm font-bold">{c.code}</TableCell>
                          <TableCell className="text-sm">
                            {c.discountType === 'percentage'
                              ? `-${c.discountValue}%`
                              : c.discountType === 'fixed'
                                ? `-${c.discountValue.toFixed(2)} €`
                                : 'BOGO'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {c.currentUses}/{c.maxUses} · {c.scans} scan{c.scans > 1 ? 's' : ''}
                          </TableCell>
                          <TableCell className="hidden text-sm sm:table-cell">{c.merchantName}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === 'active' ? 'default' : 'outline'}>{c.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {c.status === 'active' && (
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                                onClick={() => cancelCoupon(c)} aria-label={`Annuler le coupon ${c.code}`}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ----- Onglet Packs (composant orphelin rebranché) ----- */}
            <TabsContent value="packs" className="p-4 sm:p-6">
              <AdminPacks />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ----- Dialog création coupon ----- */}
      <Dialog open={couponDialog} onOpenChange={setCouponDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau coupon marketplace</DialogTitle>
            <DialogDescription>
              Code généré automatiquement si vide (format HUB-XXXXXXXX).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="coupon-code">Code (optionnel)</Label>
              <Input id="coupon-code" placeholder="HUB-XXXXXX" value={couponForm.code}
                onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="coupon-type">Type</Label>
                <select
                  id="coupon-type"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={couponForm.discountType}
                  onChange={(e) => setCouponForm((f) => ({ ...f, discountType: e.target.value }))}
                >
                  <option value="percentage">Pourcentage (%)</option>
                  <option value="fixed">Montant fixe (€)</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coupon-value">Valeur</Label>
                <Input id="coupon-value" type="number" min="1" value={couponForm.discountValue}
                  onChange={(e) => setCouponForm((f) => ({ ...f, discountValue: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="coupon-uses">Utilisations max</Label>
                <Input id="coupon-uses" type="number" min="1" value={couponForm.maxUses}
                  onChange={(e) => setCouponForm((f) => ({ ...f, maxUses: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coupon-commission">Commission (%)</Label>
                <Input id="coupon-commission" type="number" min="0" max="100" value={couponForm.commissionRate}
                  onChange={(e) => setCouponForm((f) => ({ ...f, commissionRate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createCoupon} disabled={couponBusy}>
              {couponBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer le coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
      <FileText className="mb-3 h-10 w-10 text-slate-300" />
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

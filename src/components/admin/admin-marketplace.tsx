'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Store, Tag, Zap, Ticket, Receipt, Plus, Search, Trash2, Loader2,
  Edit, QrCode, Play, Ban, Eye, Star, ShieldCheck, XCircle, CheckCircle,
} from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

// ── Types ──────────────────────────────────────────────────────
interface MerchantData {
  id: string; name: string; category: string | null; description: string | null;
  address: string | null; phone: string | null; website: string | null;
  openingHours: string; isVerified: boolean; ratingAvg: number; isActive: boolean;
  createdAt: string;
}

interface PromoData {
  id: string; merchantId: string | null; title: string; description: string | null;
  originalPrice: number | null; promoPrice: number | null;
  validFrom: string | null; validUntil: string | null; category: string | null;
  source: string; viewsCount: number; redemptionsCount: number; createdAt: string;
  merchant: { id: string; name: string } | null;
}

interface FlashSaleData {
  id: string; promoId: string; merchantId: string; title: string | null;
  description: string | null; originalPrice: number | null; flashPrice: number;
  startsAt: string; endsAt: string; maxRedemptions: number | null;
  currentRedemptions: number; status: string; costEuros: number; createdAt: string;
  merchant: { id: string; name: string } | null;
}

interface CouponData {
  id: string; merchantId: string; code: string; discountType: string;
  discountValue: number; maxUses: number; currentUses: number;
  validFrom: string | null; validUntil: string | null; status: string; createdAt: string;
  merchant: { id: string; name: string } | null;
}

interface TransactionData {
  id: string; type: string; payerId: string | null; receiverId: string | null;
  amount: number; currency: string; status: string; createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────
const CATEGORIES = ['Boulangerie', 'Boucherie', 'Épicerie', 'Pharmacie', 'Restauration', 'Beauté', 'Autre'];

const FLASH_STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Programmée', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0' },
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' },
  expired: { label: 'Expirée', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
  cancelled: { label: 'Annulée', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
};

const TXN_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0' },
  completed: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' },
  failed: { label: 'Échoué', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
  refunded: { label: 'Remboursé', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
};

const COUPON_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Actif', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' },
  used: { label: 'Utilisé', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
  expired: { label: 'Expiré', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0' },
  cancelled: { label: 'Annulé', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
};

// ── Helpers ────────────────────────────────────────────────────
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtEur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const fmtDateTime = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const isPromoActive = (p: PromoData) => !p.validUntil || new Date(p.validUntil) >= new Date();

function SB({ cfg }: { cfg: { label: string; cls: string } }) {
  return <Badge className={cfg.cls}>{cfg.label}</Badge>;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: React.ElementType }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold tabular-nums mt-1">{value}</p></div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Icon className="h-5 w-5 text-muted-foreground" /></div>
      </div>
    </Card>
  );
}

// ── Component ──────────────────────────────────────────────────
export function AdminMarketplace() {
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [promos, setPromos] = useState<PromoData[]>([]);
  const [flashSales, setFlashSales] = useState<FlashSaleData[]>([]);
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [loading, setLoading] = useState(true);

  const [mSearch, setMSearch] = useState('');
  const [mCategory, setMCategory] = useState('all');
  const [pMerchant, setPMerchant] = useState('all');
  const [pStatus, setPStatus] = useState('all');
  const [cStatus, setCStatus] = useState('all');
  const [cMerchant, setCMerchant] = useState('all');
  const [tType, setTType] = useState('all');
  const [tStatus, setTStatus] = useState('all');

  const [merchantDlg, setMerchantDlg] = useState(false);
  const [promoDlg, setPromoDlg] = useState(false);
  const [flashDlg, setFlashDlg] = useState(false);
  const [couponDlg, setCouponDlg] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [mf, setMf] = useState({ name: '', category: '', address: '', phone: '', description: '', website: '' });
  const [pf, setPf] = useState({ merchantId: '', title: '', description: '', originalPrice: '', promoPrice: '', validUntil: '', category: '' });
  const [ff, setFf] = useState({ merchantId: '', promoId: '', title: '', flashPrice: '', startsAt: '', endsAt: '', maxRedemptions: '', costEuros: '0.5' });
  const [cf, setCf] = useState({ merchantId: '', discountType: 'percentage', discountValue: '', maxUses: '1', validUntil: '' });

  const [submitting, setSubmitting] = useState(false);

  const [now, setNow] = useState(Date.now());
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    cdRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (cdRef.current) clearInterval(cdRef.current); };
  }, []);

  // ── Fetch ────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [m, p, f, c, t] = await Promise.all([
        fetch('/api/client/merchants').then(r => r.json()).then(d => Array.isArray(d) ? d : d.data ?? []),
        fetch('/api/client/promos').then(r => r.json()).then(d => Array.isArray(d) ? d : d.data ?? []),
        fetch('/api/client/flash-sales?status=all').then(r => r.json()).then(d => Array.isArray(d) ? d : d.data ?? []),
        fetch('/api/client/coupons?status=all').then(r => r.json()).then(d => Array.isArray(d) ? d : d.data ?? []),
        fetch('/api/client/transactions?limit=100').then(r => r.json()).then(d => d.transactions ?? d.data ?? []),
      ]);
      setMerchants(m); setPromos(p); setFlashSales(f); setCoupons(c); setTransactions(t);
    } catch { toast.error('Erreur lors du chargement'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── API helper ───────────────────────────────────────────────
  const api = async (url: string, method: string, body?: unknown) => {
    setSubmitting(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erreur'); }
      return true;
    } finally { setSubmitting(false); }
  };

  const rstM = () => setMf({ name: '', category: '', address: '', phone: '', description: '', website: '' });
  const rstP = () => setPf({ merchantId: '', title: '', description: '', originalPrice: '', promoPrice: '', validUntil: '', category: '' });
  const rstF = () => setFf({ merchantId: '', promoId: '', title: '', flashPrice: '', startsAt: '', endsAt: '', maxRedemptions: '', costEuros: '0.5' });
  const rstC = () => setCf({ merchantId: '', discountType: 'percentage', discountValue: '', maxUses: '1', validUntil: '' });

  // ── Merchant CRUD ────────────────────────────────────────────
  const saveMerchant = async () => {
    if (!mf.name.trim()) return;
    const body = { name: mf.name.trim(), category: mf.category || undefined, address: mf.address || undefined, phone: mf.phone || undefined, description: mf.description || undefined, website: mf.website || undefined, openingHours: '{}' };
    if (editId) { await api(`/api/client/merchants/${editId}`, 'PATCH', body); toast.success('Commerçant mis à jour'); }
    else { await api('/api/client/merchants', 'POST', body); toast.success('Commerçant créé'); }
    setMerchantDlg(false); setEditId(null); rstM(); fetchAll();
  };
  const deleteMerchant = (id: string) => api(`/api/client/merchants/${id}`, 'DELETE').then(() => { toast.success('Supprimé'); fetchAll(); });
  const toggleMerchant = (m: MerchantData, field: 'isActive' | 'isVerified') =>
    api(`/api/client/merchants/${m.id}`, 'PATCH', { [field]: !m[field] }).then(() => { toast.success('Mis à jour'); fetchAll(); });
  const editMerchant = (m: MerchantData) => {
    setMf({ name: m.name, category: m.category || '', address: m.address || '', phone: m.phone || '', description: m.description || '', website: m.website || '' });
    setEditId(m.id); setMerchantDlg(true);
  };

  // ── Promo CRUD ───────────────────────────────────────────────
  const savePromo = async () => {
    if (!pf.title.trim()) return;
    const body = { merchantId: pf.merchantId || undefined, title: pf.title.trim(), description: pf.description || undefined, originalPrice: pf.originalPrice ? parseFloat(pf.originalPrice) : undefined, promoPrice: pf.promoPrice ? parseFloat(pf.promoPrice) : undefined, validUntil: pf.validUntil || undefined, category: pf.category || undefined, source: 'local' };
    if (editId) { await api(`/api/client/promos/${editId}`, 'PATCH', body); toast.success('Promotion mise à jour'); }
    else { await api('/api/client/promos', 'POST', body); toast.success('Promotion créée'); }
    setPromoDlg(false); setEditId(null); rstP(); fetchAll();
  };
  const deletePromo = (id: string) => api(`/api/client/promos/${id}`, 'DELETE').then(() => { toast.success('Supprimé'); fetchAll(); });
  const editPromo = (p: PromoData) => {
    setPf({ merchantId: p.merchantId || '', title: p.title, description: p.description || '', originalPrice: p.originalPrice?.toString() || '', promoPrice: p.promoPrice?.toString() || '', validUntil: p.validUntil?.split('T')[0] || '', category: p.category || '' });
    setEditId(p.id); setPromoDlg(true);
  };

  // ── Flash CRUD ───────────────────────────────────────────────
  const saveFlash = async () => {
    if (!ff.merchantId || !ff.flashPrice || !ff.startsAt || !ff.endsAt) return;
    const body = { merchantId: ff.merchantId, promoId: ff.promoId || undefined, title: ff.title || undefined, flashPrice: parseFloat(ff.flashPrice), startsAt: ff.startsAt, endsAt: ff.endsAt, maxRedemptions: ff.maxRedemptions ? parseInt(ff.maxRedemptions) : undefined, costEuros: parseFloat(ff.costEuros) || 0.5 };
    await api('/api/client/flash-sales', 'POST', body);
    toast.success('Vente flash créée'); setFlashDlg(false); rstF(); fetchAll();
  };
  const flashAction = (id: string, action: 'active' | 'cancelled' | 'delete') => {
    if (action === 'delete') api(`/api/client/flash-sales/${id}`, 'DELETE').then(() => { toast.success('Supprimé'); fetchAll(); });
    else api(`/api/client/flash-sales/${id}`, 'PATCH', { status: action }).then(() => { toast.success(action === 'active' ? 'Activée' : 'Annulée'); fetchAll(); });
  };

  // ── Coupon CRUD ──────────────────────────────────────────────
  const saveCoupon = async () => {
    if (!cf.merchantId || !cf.discountValue) return;
    const body = { merchantId: cf.merchantId, discountType: cf.discountType, discountValue: parseFloat(cf.discountValue), maxUses: parseInt(cf.maxUses) || 1, validUntil: cf.validUntil || undefined };
    await api('/api/client/coupons', 'POST', body);
    toast.success('Coupon créé'); setCouponDlg(false); rstC(); fetchAll();
  };
  const scanCoupon = (id: string) => api(`/api/client/coupons/${id}/scan`, 'POST').then(() => { toast.success('Coupon scanné'); fetchAll(); });

  // ── Filtered data ────────────────────────────────────────────
  const filteredMerchants = merchants.filter(m => {
    if (mCategory !== 'all' && m.category !== mCategory) return false;
    if (mSearch && !m.name.toLowerCase().includes(mSearch.toLowerCase()) && !(m.category || '').toLowerCase().includes(mSearch.toLowerCase())) return false;
    return true;
  });
  const filteredPromos = promos.filter(p => {
    if (pMerchant !== 'all' && p.merchantId !== pMerchant) return false;
    if (pStatus === 'active' && !isPromoActive(p)) return false;
    if (pStatus === 'expired' && isPromoActive(p)) return false;
    return true;
  });
  const filteredCoupons = coupons.filter(c => {
    if (cStatus !== 'all' && c.status !== cStatus) return false;
    if (cMerchant !== 'all' && c.merchantId !== cMerchant) return false;
    return true;
  });
  const filteredTxns = transactions.filter(t => {
    if (tType !== 'all' && t.type !== tType) return false;
    if (tStatus !== 'all' && t.status !== tStatus) return false;
    return true;
  });
  const merchantPromosForFlash = ff.merchantId ? promos.filter(p => p.merchantId === ff.merchantId) : [];

  const getCountdown = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - now;
    if (diff <= 0) return 'Expirée';
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
  };

  const PROMO_STATUS_ACTIVE = { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' };
  const PROMO_STATUS_EXPIRED = { label: 'Expirée', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' };

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-96" />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" /> Marketplace</CardTitle>
        <CardDescription>Gestion des commerçants, promotions, ventes flash, coupons et transactions</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="merchants">
          <TabsList className="mb-4 w-full flex-wrap h-auto gap-1">
            <TabsTrigger value="merchants" className="gap-1.5"><Store className="h-3.5 w-3.5" /><span className="hidden sm:inline">Commerçants</span></TabsTrigger>
            <TabsTrigger value="promos" className="gap-1.5"><Tag className="h-3.5 w-3.5" /><span className="hidden sm:inline">Promotions</span></TabsTrigger>
            <TabsTrigger value="flash" className="gap-1.5"><Zap className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ventes Flash</span></TabsTrigger>
            <TabsTrigger value="coupons" className="gap-1.5"><Ticket className="h-3.5 w-3.5" /><span className="hidden sm:inline">Coupons</span></TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /><span className="hidden sm:inline">Transactions</span></TabsTrigger>
          </TabsList>

          {/* ── Commerçants ──────────────────────────────────────── */}
          <TabsContent value="merchants" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Total" value={merchants.length} icon={Store} />
              <StatCard label="Vérifiés" value={merchants.filter(m => m.isVerified).length} icon={ShieldCheck} />
              <StatCard label="Actifs" value={merchants.filter(m => m.isActive).length} icon={CheckCircle} />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Rechercher..." value={mSearch} onChange={e => setMSearch(e.target.value)} className="pl-9 w-56" /></div>
                <Select value={mCategory} onValueChange={setMCategory}><SelectTrigger className="w-40"><SelectValue placeholder="Catégorie" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
              <Dialog open={merchantDlg} onOpenChange={o => { setMerchantDlg(o); if (!o) { setEditId(null); rstM(); } }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Ajouter</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>{editId ? 'Modifier le commerçant' : 'Nouveau commerçant'}</DialogTitle><DialogDescription>{editId ? 'Modifier les informations' : 'Ajouter un commerçant'}</DialogDescription></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5"><Label>Nom *</Label><Input value={mf.name} onChange={e => setMf(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label>Catégorie</Label><Select value={mf.category} onValueChange={v => setMf(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-1.5"><Label>Adresse</Label><Input value={mf.address} onChange={e => setMf(f => ({ ...f, address: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label>Téléphone</Label><Input value={mf.phone} onChange={e => setMf(f => ({ ...f, phone: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label>Site web</Label><Input value={mf.website} onChange={e => setMf(f => ({ ...f, website: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label>Description</Label><Input value={mf.description} onChange={e => setMf(f => ({ ...f, description: e.target.value }))} /></div>
                  </div>
                  <DialogFooter><Button onClick={saveMerchant} disabled={submitting || !mf.name.trim()}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editId ? 'Enregistrer' : 'Créer'}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>Catégorie</TableHead><TableHead>Adresse</TableHead><TableHead className="hidden md:table-cell">Tél</TableHead><TableHead className="hidden lg:table-cell">Note</TableHead><TableHead>Vérifié</TableHead><TableHead>Actif</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredMerchants.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Aucun commerçant</TableCell></TableRow>}
                  {filteredMerchants.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell><Badge variant="outline">{m.category || '—'}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-28 truncate">{m.address || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{m.phone || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell"><div className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /><span className="text-sm">{m.ratingAvg?.toFixed(1) || '—'}</span></div></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => toggleMerchant(m, 'isVerified')}>{m.isVerified ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</Button></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => toggleMerchant(m, 'isActive')}>{m.isActive ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</Button></TableCell>
                      <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editMerchant(m)}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMerchant(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Promotions ───────────────────────────────────────── */}
          <TabsContent value="promos" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Total" value={promos.length} icon={Tag} />
              <StatCard label="Actives" value={promos.filter(p => isPromoActive(p)).length} icon={CheckCircle} />
              <StatCard label="Expirées" value={promos.filter(p => !isPromoActive(p)).length} icon={XCircle} />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <Select value={pMerchant} onValueChange={setPMerchant}><SelectTrigger className="w-44"><SelectValue placeholder="Commerçant" /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem>{merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
                <Select value={pStatus} onValueChange={setPStatus}><SelectTrigger className="w-36"><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="active">Actives</SelectItem><SelectItem value="expired">Expirées</SelectItem></SelectContent></Select>
              </div>
              <Dialog open={promoDlg} onOpenChange={o => { setPromoDlg(o); if (!o) { setEditId(null); rstP(); } }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Ajouter</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>{editId ? 'Modifier la promotion' : 'Nouvelle promotion'}</DialogTitle><DialogDescription>{editId ? 'Modifier les détails' : 'Créer une promotion'}</DialogDescription></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5"><Label>Commerçant</Label><Select value={pf.merchantId} onValueChange={v => setPf(f => ({ ...f, merchantId: v }))}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-1.5"><Label>Titre *</Label><Input value={pf.title} onChange={e => setPf(f => ({ ...f, title: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label>Description</Label><Input value={pf.description} onChange={e => setPf(f => ({ ...f, description: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Prix original</Label><Input type="number" step="0.01" value={pf.originalPrice} onChange={e => setPf(f => ({ ...f, originalPrice: e.target.value }))} /></div><div className="grid gap-1.5"><Label>Prix promo</Label><Input type="number" step="0.01" value={pf.promoPrice} onChange={e => setPf(f => ({ ...f, promoPrice: e.target.value }))} /></div></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Valide jusqu'au</Label><Input type="date" value={pf.validUntil} onChange={e => setPf(f => ({ ...f, validUntil: e.target.value }))} /></div><div className="grid gap-1.5"><Label>Catégorie</Label><Select value={pf.category} onValueChange={v => setPf(f => ({ ...f, category: v }))}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div></div>
                  </div>
                  <DialogFooter><Button onClick={savePromo} disabled={submitting || !pf.title.trim()}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editId ? 'Enregistrer' : 'Créer'}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Titre</TableHead><TableHead>Commerçant</TableHead><TableHead>Prix</TableHead><TableHead className="hidden md:table-cell">Vues</TableHead><TableHead className="hidden md:table-cell">Utilisations</TableHead><TableHead>Statut</TableHead><TableHead className="hidden lg:table-cell">Expire</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredPromos.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Aucune promotion</TableCell></TableRow>}
                  {filteredPromos.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.merchant?.name || '—'}</TableCell>
                      <TableCell>{p.originalPrice && p.promoPrice ? <><span className="line-through text-muted-foreground mr-1.5">{fmtEur(p.originalPrice)}</span><span className="font-semibold text-emerald-600">{fmtEur(p.promoPrice)}</span></> : (p.promoPrice ? fmtEur(p.promoPrice) : '—')}</TableCell>
                      <TableCell className="hidden md:table-cell"><div className="flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-muted-foreground" />{p.viewsCount}</div></TableCell>
                      <TableCell className="hidden md:table-cell">{p.redemptionsCount}</TableCell>
                      <TableCell><SB cfg={isPromoActive(p) ? PROMO_STATUS_ACTIVE : PROMO_STATUS_EXPIRED} /></TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{p.validUntil ? fmtDate(p.validUntil) : '—'}</TableCell>
                      <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editPromo(p)}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deletePromo(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Ventes Flash ─────────────────────────────────────── */}
          <TabsContent value="flash" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total" value={flashSales.length} icon={Zap} />
              <StatCard label="Actives" value={flashSales.filter(f => f.status === 'active').length} icon={Zap} />
              <StatCard label="Programmées" value={flashSales.filter(f => f.status === 'scheduled').length} icon={Tag} />
              <StatCard label="Expirées" value={flashSales.filter(f => f.status === 'expired' || f.status === 'cancelled').length} icon={XCircle} />
            </div>
            <div className="flex justify-end">
              <Dialog open={flashDlg} onOpenChange={o => { setFlashDlg(o); if (!o) rstF(); }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Créer</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Nouvelle vente flash</DialogTitle><DialogDescription>Planifier une vente flash géolocalisée</DialogDescription></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5"><Label>Commerçant *</Label><Select value={ff.merchantId} onValueChange={v => setFf(f => ({ ...f, merchantId: v }))}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-1.5"><Label>Promo liée</Label><Select value={ff.promoId} onValueChange={v => setFf(f => ({ ...f, promoId: v }))}><SelectTrigger><SelectValue placeholder="Optionnelle" /></SelectTrigger><SelectContent><SelectItem value="">Aucune</SelectItem>{merchantPromosForFlash.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-1.5"><Label>Titre</Label><Input value={ff.title} onChange={e => setFf(f => ({ ...f, title: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Prix flash (€) *</Label><Input type="number" step="0.01" value={ff.flashPrice} onChange={e => setFf(f => ({ ...f, flashPrice: e.target.value }))} /></div><div className="grid gap-1.5"><Label>Max utilisations</Label><Input type="number" value={ff.maxRedemptions} onChange={e => setFf(f => ({ ...f, maxRedemptions: e.target.value }))} placeholder="Illimité" /></div></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Début *</Label><Input type="datetime-local" value={ff.startsAt} onChange={e => setFf(f => ({ ...f, startsAt: e.target.value }))} /></div><div className="grid gap-1.5"><Label>Fin *</Label><Input type="datetime-local" value={ff.endsAt} onChange={e => setFf(f => ({ ...f, endsAt: e.target.value }))} /></div></div>
                  </div>
                  <DialogFooter><Button onClick={saveFlash} disabled={submitting || !ff.merchantId || !ff.flashPrice}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Créer</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Titre</TableHead><TableHead>Commerçant</TableHead><TableHead>Prix</TableHead><TableHead>Statut</TableHead><TableHead>Compte à rebours</TableHead><TableHead className="hidden md:table-cell">Progression</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {flashSales.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucune vente flash</TableCell></TableRow>}
                  {flashSales.map(f => {
                    const cfg = FLASH_STATUS[f.status] || FLASH_STATUS.expired;
                    const pct = f.maxRedemptions ? Math.min(100, (f.currentRedemptions / f.maxRedemptions) * 100) : 0;
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.title || 'Sans titre'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.merchant?.name || '—'}</TableCell>
                        <TableCell className="font-semibold text-emerald-600">{fmtEur(f.flashPrice)}</TableCell>
                        <TableCell><SB cfg={cfg} /></TableCell>
                        <TableCell><span className={`font-mono text-sm ${f.status === 'active' ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>{f.status === 'active' ? getCountdown(f.endsAt) : fmtDate(f.endsAt)}</span></TableCell>
                        <TableCell className="hidden md:table-cell"><div className="w-24 space-y-1"><Progress value={pct} className="h-2" /><span className="text-xs text-muted-foreground">{f.currentRedemptions}{f.maxRedemptions ? `/${f.maxRedemptions}` : ''}</span></div></TableCell>
                        <TableCell className="text-right"><div className="flex justify-end gap-1">
                          {f.status === 'scheduled' && <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={() => flashAction(f.id, 'active')} title="Activer"><Play className="h-3.5 w-3.5" /></Button>}
                          {(f.status === 'active' || f.status === 'scheduled') && <Button variant="ghost" size="icon" className="h-8 w-8 text-yellow-600" onClick={() => flashAction(f.id, 'cancelled')} title="Annuler"><Ban className="h-3.5 w-3.5" /></Button>}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => flashAction(f.id, 'delete')} title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Coupons ──────────────────────────────────────────── */}
          <TabsContent value="coupons" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total" value={coupons.length} icon={Ticket} />
              <StatCard label="Actifs" value={coupons.filter(c => c.status === 'active').length} icon={CheckCircle} />
              <StatCard label="Utilisés" value={coupons.filter(c => c.status === 'used').length} icon={QrCode} />
              <StatCard label="Expirés" value={coupons.filter(c => c.status === 'expired').length} icon={XCircle} />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <Select value={cStatus} onValueChange={setCStatus}><SelectTrigger className="w-36"><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="active">Actifs</SelectItem><SelectItem value="used">Utilisés</SelectItem><SelectItem value="expired">Expirés</SelectItem></SelectContent></Select>
                <Select value={cMerchant} onValueChange={setCMerchant}><SelectTrigger className="w-44"><SelectValue placeholder="Commerçant" /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem>{merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <Dialog open={couponDlg} onOpenChange={o => { setCouponDlg(o); if (!o) rstC(); }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Créer</Button></DialogTrigger>
                <DialogContent><DialogHeader><DialogTitle>Nouveau coupon</DialogTitle><DialogDescription>Générer un code de réduction</DialogDescription></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5"><Label>Commerçant *</Label><Select value={cf.merchantId} onValueChange={v => setCf(f => ({ ...f, merchantId: v }))}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Type</Label><Select value={cf.discountType} onValueChange={v => setCf(f => ({ ...f, discountType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Pourcentage</SelectItem><SelectItem value="fixed">Montant fixe</SelectItem></SelectContent></Select></div><div className="grid gap-1.5"><Label>Valeur *</Label><Input type="number" step="0.01" value={cf.discountValue} onChange={e => setCf(f => ({ ...f, discountValue: e.target.value }))} /></div></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label>Max utilisations</Label><Input type="number" value={cf.maxUses} onChange={e => setCf(f => ({ ...f, maxUses: e.target.value }))} /></div><div className="grid gap-1.5"><Label>Valide jusqu'au</Label><Input type="date" value={cf.validUntil} onChange={e => setCf(f => ({ ...f, validUntil: e.target.value }))} /></div></div>
                  </div>
                  <DialogFooter><Button onClick={saveCoupon} disabled={submitting || !cf.merchantId || !cf.discountValue}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Créer</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Commerçant</TableHead><TableHead>Remise</TableHead><TableHead>Statut</TableHead><TableHead className="hidden md:table-cell">Utilisations</TableHead><TableHead className="hidden lg:table-cell">Expire</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredCoupons.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun coupon</TableCell></TableRow>}
                  {filteredCoupons.map(c => (
                    <TableRow key={c.id}>
                      <TableCell><code className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-semibold cursor-pointer hover:bg-muted/80" onClick={() => { navigator.clipboard.writeText(c.code); toast.success('Code copié !'); }}>{c.code}</code></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.merchant?.name || '—'}</TableCell>
                      <TableCell className="font-semibold">{c.discountType === 'percentage' ? `${c.discountValue}%` : fmtEur(c.discountValue)}</TableCell>
                      <TableCell><SB cfg={COUPON_STATUS[c.status] || COUPON_STATUS.active} /></TableCell>
                      <TableCell className="hidden md:table-cell">{c.currentUses}{c.maxUses ? `/${c.maxUses}` : ''}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{c.validUntil ? fmtDate(c.validUntil) : '—'}</TableCell>
                      <TableCell className="text-right">{c.status === 'active' && <Button variant="ghost" size="sm" className="h-8" onClick={() => scanCoupon(c.id)}><QrCode className="mr-1.5 h-3.5 w-3.5" />Scanner</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Transactions ─────────────────────────────────────── */}
          <TabsContent value="transactions" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Total" value={transactions.length} icon={Receipt} />
              <StatCard label="Montant total" value={fmtEur(transactions.reduce((s, t) => s + t.amount, 0))} icon={Receipt} />
              <StatCard label="Ce mois" value={transactions.filter(t => { const d = new Date(t.createdAt), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length} icon={Receipt} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={tType} onValueChange={setTType}><SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="flash_sale">Vente flash</SelectItem><SelectItem value="subscription">Abonnement</SelectItem><SelectItem value="wallet_topup">Recharge</SelectItem></SelectContent></Select>
              <Select value={tStatus} onValueChange={setTStatus}><SelectTrigger className="w-40"><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="completed">Terminé</SelectItem><SelectItem value="pending">En attente</SelectItem><SelectItem value="failed">Échoué</SelectItem><SelectItem value="refunded">Remboursé</SelectItem></SelectContent></Select>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Montant</TableHead><TableHead>Statut</TableHead><TableHead className="hidden md:table-cell">Payeur</TableHead><TableHead className="hidden md:table-cell">Receveur</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredTxns.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune transaction</TableCell></TableRow>}
                  {filteredTxns.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{fmtDateTime(t.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline">{t.type.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="font-semibold">{fmtEur(t.amount)}</TableCell>
                      <TableCell><SB cfg={TXN_STATUS[t.status] || TXN_STATUS.pending} /></TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">{t.payerId ? `${t.payerId.slice(0, 8)}...` : '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">{t.receiverId ? `${t.receiverId.slice(0, 8)}...` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

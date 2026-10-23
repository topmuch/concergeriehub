'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
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
  validUntil: string | null; category: string | null; viewsCount: number;
  redemptionsCount: number; merchant: { id: string; name: string } | null;
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

// Badges de statut « lux » — teintes sémantiques 8-10 % sur fond nuit.
const FLASH_STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Programmée', cls: 'border border-[#fbbf24]/25 bg-[#fbbf24]/10 text-[#fbbf24]' },
  active: { label: 'Active', cls: 'border border-[#34d399]/25 bg-[#34d399]/10 text-[#86e9cb]' },
  expired: { label: 'Expirée', cls: 'border border-white/10 bg-white/[0.05] text-[#8fabc2]' },
  cancelled: { label: 'Annulée', cls: 'border border-[#f07d6a]/25 bg-[#f07d6a]/10 text-[#f07d6a]' },
};

const TXN_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'border border-[#fbbf24]/25 bg-[#fbbf24]/10 text-[#fbbf24]' },
  completed: { label: 'Terminé', cls: 'border border-[#34d399]/25 bg-[#34d399]/10 text-[#86e9cb]' },
  failed: { label: 'Échoué', cls: 'border border-[#f07d6a]/25 bg-[#f07d6a]/10 text-[#f07d6a]' },
  refunded: { label: 'Remboursé', cls: 'border border-white/10 bg-white/[0.05] text-[#8fabc2]' },
};

const COUPON_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Actif', cls: 'border border-[#34d399]/25 bg-[#34d399]/10 text-[#86e9cb]' },
  used: { label: 'Utilisé', cls: 'border border-white/10 bg-white/[0.05] text-[#8fabc2]' },
  expired: { label: 'Expiré', cls: 'border border-[#fbbf24]/25 bg-[#fbbf24]/10 text-[#fbbf24]' },
  cancelled: { label: 'Annulé', cls: 'border border-[#f07d6a]/25 bg-[#f07d6a]/10 text-[#f07d6a]' },
};

// ── Helpers ────────────────────────────────────────────────────
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtEur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const fmtDateTime = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const isPromoActive = (p: PromoData) => !p.validUntil || new Date(p.validUntil) >= new Date();

function SB({ cfg }: { cfg: { label: string; cls: string } }) {
  return <Badge className={cfg.cls}>{cfg.label}</Badge>;
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="lux-card p-4">
      <p className="lux-eyebrow">{label}</p>
      <p className="lux-num mt-2 truncate text-2xl leading-none text-white">{value}</p>
    </Card>
  );
}

// Champs de formulaire « lux » (sombre bleuté).
const LUX_INPUT =
  'h-10 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50';
const LUX_SELECT_TRIGGER =
  'h-10 rounded-xl border-white/12 bg-white/[0.04] text-white focus-visible:ring-[#5cadf0]/50';
const LUX_SELECT_CONTENT = 'border-white/10 bg-[#0d1530] text-white';
const LUX_SELECT_ITEM = 'focus:bg-white/8 focus:text-white';

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

  const PROMO_STATUS_ACTIVE = { label: 'Active', cls: 'border border-[#34d399]/25 bg-[#34d399]/10 text-[#86e9cb]' };
  const PROMO_STATUS_EXPIRED = { label: 'Expirée', cls: 'border border-white/10 bg-white/[0.05] text-[#8fabc2]' };

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64 bg-white/8" />
      <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl bg-white/8" />)}</div>
      <Skeleton className="h-96 rounded-2xl bg-white/8" />
    </div>
  );

  return (
    <Card className="lux-card">
      <CardHeader>
        <CardTitle className="lux-display text-xl text-white">Marketplace</CardTitle>
        <CardDescription className="text-sm text-[#8fabc2]">Gestion des commerçants, promotions, ventes flash, coupons et transactions</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="merchants">
          <TabsList className="mb-4 w-full flex-wrap h-auto gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            <TabsTrigger value="merchants" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white">Commerçants</TabsTrigger>
            <TabsTrigger value="promos" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white">Promotions</TabsTrigger>
            <TabsTrigger value="flash" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white">Ventes Flash</TabsTrigger>
            <TabsTrigger value="coupons" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white">Coupons</TabsTrigger>
            <TabsTrigger value="transactions" className="rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white">Transactions</TabsTrigger>
          </TabsList>

          {/* ── Commerçants ──────────────────────────────────────── */}
          <TabsContent value="merchants" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Total" value={merchants.length} />
              <StatCard label="Vérifiés" value={merchants.filter(m => m.isVerified).length} />
              <StatCard label="Actifs" value={merchants.filter(m => m.isActive).length} />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <Input placeholder="Rechercher..." value={mSearch} onChange={e => setMSearch(e.target.value)} className={`${LUX_INPUT} w-56`} />
                <Select value={mCategory} onValueChange={setMCategory}><SelectTrigger className={`${LUX_SELECT_TRIGGER} w-40`}><SelectValue placeholder="Catégorie" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="all">Toutes</SelectItem>{CATEGORIES.map(c => <SelectItem className={LUX_SELECT_ITEM} key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
              <Dialog open={merchantDlg} onOpenChange={o => { setMerchantDlg(o); if (!o) { setEditId(null); rstM(); } }}>
                <DialogTrigger asChild><Button size="sm" className="lux-btn h-9 rounded-full px-4 text-xs">Ajouter</Button></DialogTrigger>
                <DialogContent className="border-white/10 bg-[#0b1226] text-white"><DialogHeader><DialogTitle className="lux-display text-lg text-white">{editId ? 'Modifier le commerçant' : 'Nouveau commerçant'}</DialogTitle><DialogDescription className="text-sm text-[#8fabc2]">{editId ? 'Modifier les informations' : 'Ajouter un commerçant'}</DialogDescription></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Nom *</Label><Input className={LUX_INPUT} value={mf.name} onChange={e => setMf(f => ({ ...f, name: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Catégorie</Label><Select value={mf.category} onValueChange={v => setMf(f => ({ ...f, category: v }))}><SelectTrigger className={LUX_SELECT_TRIGGER}><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}>{CATEGORIES.map(c => <SelectItem className={LUX_SELECT_ITEM} key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Adresse</Label><Input className={LUX_INPUT} value={mf.address} onChange={e => setMf(f => ({ ...f, address: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Téléphone</Label><Input className={LUX_INPUT} value={mf.phone} onChange={e => setMf(f => ({ ...f, phone: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Site web</Label><Input className={LUX_INPUT} value={mf.website} onChange={e => setMf(f => ({ ...f, website: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Description</Label><Input className={LUX_INPUT} value={mf.description} onChange={e => setMf(f => ({ ...f, description: e.target.value }))} /></div>
                  </div>
                  <DialogFooter><Button onClick={saveMerchant} disabled={submitting || !mf.name.trim()} className="lux-btn h-9 rounded-full px-4 text-xs">{editId ? 'Enregistrer' : 'Créer'}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="lux-scroll overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                  <TableRow className="border-white/8 hover:bg-transparent"><TableHead className="lux-eyebrow !text-[9.5px]">Nom</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Catégorie</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Adresse</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Tél</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden lg:table-cell">Note</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Vérifié</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Actif</TableHead><TableHead className="lux-eyebrow !text-[9.5px] text-right">Actions</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMerchants.length === 0 && <TableRow className="border-white/8 hover:bg-white/[0.04]"><TableCell colSpan={8} className="text-center py-8 text-[#8fabc2]">Aucun commerçant</TableCell></TableRow>}
                  {filteredMerchants.map(m => (
                    <TableRow key={m.id} className="border-white/8 hover:bg-white/[0.04]">
                      <TableCell className="font-medium text-white">{m.name}</TableCell>
                      <TableCell><Badge variant="outline" className="border-white/12 bg-white/[0.03] text-[#8fabc2]">{m.category || '—'}</Badge></TableCell>
                      <TableCell className="text-sm text-[#8fabc2] max-w-28 truncate">{m.address || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-[#c7d3ec]">{m.phone || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell"><div className="flex items-center gap-1"><span className="text-[#e9c47c]" aria-hidden="true">★</span><span className="text-sm text-white">{m.ratingAvg?.toFixed(1) || '—'}</span></div></TableCell>
                      <TableCell><Button variant="ghost" size="sm" className="h-8 w-8" onClick={() => toggleMerchant(m, 'isVerified')} title="Basculer vérifié"><span aria-hidden="true" className={m.isVerified ? 'text-[#86e9cb]' : 'text-[#8fabc2]/50'}>✓</span></Button></TableCell>
                      <TableCell><Button variant="ghost" size="sm" className="h-8 w-8" onClick={() => toggleMerchant(m, 'isActive')} title="Basculer actif"><span aria-hidden="true" className={m.isActive ? 'text-[#86e9cb]' : 'text-[#8fabc2]/50'}>✓</span></Button></TableCell>
                      <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" className="h-8 text-xs text-[#8fabc2] hover:bg-white/[0.06] hover:text-white" onClick={() => editMerchant(m)}>Modifier</Button><Button variant="ghost" size="sm" className="h-8 text-xs text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]" onClick={() => deleteMerchant(m.id)}>Supprimer</Button></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Promotions ───────────────────────────────────────── */}
          <TabsContent value="promos" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Total" value={promos.length} />
              <StatCard label="Actives" value={promos.filter(p => isPromoActive(p)).length} />
              <StatCard label="Expirées" value={promos.filter(p => !isPromoActive(p)).length} />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <Select value={pMerchant} onValueChange={setPMerchant}><SelectTrigger className={`${LUX_SELECT_TRIGGER} w-44`}><SelectValue placeholder="Commerçant" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="all">Tous</SelectItem>{merchants.map(m => <SelectItem className={LUX_SELECT_ITEM} key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
                <Select value={pStatus} onValueChange={setPStatus}><SelectTrigger className={`${LUX_SELECT_TRIGGER} w-36`}><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="all">Tous</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="active">Actives</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="expired">Expirées</SelectItem></SelectContent></Select>
              </div>
              <Dialog open={promoDlg} onOpenChange={o => { setPromoDlg(o); if (!o) { setEditId(null); rstP(); } }}>
                <DialogTrigger asChild><Button size="sm" className="lux-btn h-9 rounded-full px-4 text-xs">Ajouter</Button></DialogTrigger>
                <DialogContent className="border-white/10 bg-[#0b1226] text-white"><DialogHeader><DialogTitle className="lux-display text-lg text-white">{editId ? 'Modifier la promotion' : 'Nouvelle promotion'}</DialogTitle><DialogDescription className="text-sm text-[#8fabc2]">{editId ? 'Modifier les détails' : 'Créer une promotion'}</DialogDescription></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Commerçant</Label><Select value={pf.merchantId} onValueChange={v => setPf(f => ({ ...f, merchantId: v }))}><SelectTrigger className={LUX_SELECT_TRIGGER}><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}>{merchants.map(m => <SelectItem className={LUX_SELECT_ITEM} key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Titre *</Label><Input className={LUX_INPUT} value={pf.title} onChange={e => setPf(f => ({ ...f, title: e.target.value }))} /></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Description</Label><Input className={LUX_INPUT} value={pf.description} onChange={e => setPf(f => ({ ...f, description: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Prix original</Label><Input className={LUX_INPUT} type="number" step="0.01" value={pf.originalPrice} onChange={e => setPf(f => ({ ...f, originalPrice: e.target.value }))} /></div><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Prix promo</Label><Input className={LUX_INPUT} type="number" step="0.01" value={pf.promoPrice} onChange={e => setPf(f => ({ ...f, promoPrice: e.target.value }))} /></div></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Valide jusqu'au</Label><Input className={LUX_INPUT} type="date" value={pf.validUntil} onChange={e => setPf(f => ({ ...f, validUntil: e.target.value }))} /></div><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Catégorie</Label><Select value={pf.category} onValueChange={v => setPf(f => ({ ...f, category: v }))}><SelectTrigger className={LUX_SELECT_TRIGGER}><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}>{CATEGORIES.map(c => <SelectItem className={LUX_SELECT_ITEM} key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div></div>
                  </div>
                  <DialogFooter><Button onClick={savePromo} disabled={submitting || !pf.title.trim()} className="lux-btn h-9 rounded-full px-4 text-xs">{editId ? 'Enregistrer' : 'Créer'}</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="lux-scroll overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                  <TableRow className="border-white/8 hover:bg-transparent"><TableHead className="lux-eyebrow !text-[9.5px]">Titre</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Commerçant</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Prix</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Vues</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Utilisations</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden lg:table-cell">Expire</TableHead><TableHead className="lux-eyebrow !text-[9.5px] text-right">Actions</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPromos.length === 0 && <TableRow className="border-white/8 hover:bg-white/[0.04]"><TableCell colSpan={8} className="text-center py-8 text-[#8fabc2]">Aucune promotion</TableCell></TableRow>}
                  {filteredPromos.map(p => (
                    <TableRow key={p.id} className="border-white/8 hover:bg-white/[0.04]">
                      <TableCell className="font-medium text-white">{p.title}</TableCell>
                      <TableCell className="text-sm text-[#8fabc2]">{p.merchant?.name || '—'}</TableCell>
                      <TableCell>{p.originalPrice && p.promoPrice ? <><span className="line-through text-[#8fabc2] mr-1.5">{fmtEur(p.originalPrice)}</span><span className="font-semibold text-[#86e9cb]">{fmtEur(p.promoPrice)}</span></> : (p.promoPrice ? fmtEur(p.promoPrice) : '—')}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-[#c7d3ec]">{p.viewsCount}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-[#c7d3ec]">{p.redemptionsCount}</TableCell>
                      <TableCell><SB cfg={isPromoActive(p) ? PROMO_STATUS_ACTIVE : PROMO_STATUS_EXPIRED} /></TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-[#8fabc2]">{p.validUntil ? fmtDate(p.validUntil) : '—'}</TableCell>
                      <TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" className="h-8 text-xs text-[#8fabc2] hover:bg-white/[0.06] hover:text-white" onClick={() => editPromo(p)}>Modifier</Button><Button variant="ghost" size="sm" className="h-8 text-xs text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]" onClick={() => deletePromo(p.id)}>Supprimer</Button></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Ventes Flash ─────────────────────────────────────── */}
          <TabsContent value="flash" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total" value={flashSales.length} />
              <StatCard label="Actives" value={flashSales.filter(f => f.status === 'active').length} />
              <StatCard label="Programmées" value={flashSales.filter(f => f.status === 'scheduled').length} />
              <StatCard label="Expirées" value={flashSales.filter(f => f.status === 'expired' || f.status === 'cancelled').length} />
            </div>
            <div className="flex justify-end">
              <Dialog open={flashDlg} onOpenChange={o => { setFlashDlg(o); if (!o) rstF(); }}>
                <DialogTrigger asChild><Button size="sm" className="lux-btn h-9 rounded-full px-4 text-xs">Créer</Button></DialogTrigger>
                <DialogContent className="border-white/10 bg-[#0b1226] text-white"><DialogHeader><DialogTitle className="lux-display text-lg text-white">Nouvelle vente flash</DialogTitle><DialogDescription className="text-sm text-[#8fabc2]">Planifier une vente flash géolocalisée</DialogDescription></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Commerçant *</Label><Select value={ff.merchantId} onValueChange={v => setFf(f => ({ ...f, merchantId: v }))}><SelectTrigger className={LUX_SELECT_TRIGGER}><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}>{merchants.map(m => <SelectItem className={LUX_SELECT_ITEM} key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Promo liée</Label><Select value={ff.promoId} onValueChange={v => setFf(f => ({ ...f, promoId: v }))}><SelectTrigger className={LUX_SELECT_TRIGGER}><SelectValue placeholder="Optionnelle" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="">Aucune</SelectItem>{merchantPromosForFlash.map(p => <SelectItem className={LUX_SELECT_ITEM} key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Titre</Label><Input className={LUX_INPUT} value={ff.title} onChange={e => setFf(f => ({ ...f, title: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Prix flash (€) *</Label><Input className={LUX_INPUT} type="number" step="0.01" value={ff.flashPrice} onChange={e => setFf(f => ({ ...f, flashPrice: e.target.value }))} /></div><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Max utilisations</Label><Input className={LUX_INPUT} type="number" value={ff.maxRedemptions} onChange={e => setFf(f => ({ ...f, maxRedemptions: e.target.value }))} placeholder="Illimité" /></div></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Début *</Label><Input className={LUX_INPUT} type="datetime-local" value={ff.startsAt} onChange={e => setFf(f => ({ ...f, startsAt: e.target.value }))} /></div><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Fin *</Label><Input className={LUX_INPUT} type="datetime-local" value={ff.endsAt} onChange={e => setFf(f => ({ ...f, endsAt: e.target.value }))} /></div></div>
                  </div>
                  <DialogFooter><Button onClick={saveFlash} disabled={submitting || !ff.merchantId || !ff.flashPrice} className="lux-btn h-9 rounded-full px-4 text-xs">Créer</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="lux-scroll overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                  <TableRow className="border-white/8 hover:bg-transparent"><TableHead className="lux-eyebrow !text-[9.5px]">Titre</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Commerçant</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Prix</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Compte à rebours</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Progression</TableHead><TableHead className="lux-eyebrow !text-[9.5px] text-right">Actions</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {flashSales.length === 0 && <TableRow className="border-white/8 hover:bg-white/[0.04]"><TableCell colSpan={7} className="text-center py-8 text-[#8fabc2]">Aucune vente flash</TableCell></TableRow>}
                  {flashSales.map(f => {
                    const cfg = FLASH_STATUS[f.status] || FLASH_STATUS.expired;
                    const pct = f.maxRedemptions ? Math.min(100, (f.currentRedemptions / f.maxRedemptions) * 100) : 0;
                    return (
                      <TableRow key={f.id} className="border-white/8 hover:bg-white/[0.04]">
                        <TableCell className="font-medium text-white">{f.title || 'Sans titre'}</TableCell>
                        <TableCell className="text-sm text-[#8fabc2]">{f.merchant?.name || '—'}</TableCell>
                        <TableCell className="font-semibold text-[#86e9cb]">{fmtEur(f.flashPrice)}</TableCell>
                        <TableCell><SB cfg={cfg} /></TableCell>
                        <TableCell><span className={`font-mono text-sm ${f.status === 'active' ? 'text-[#f07d6a] font-semibold' : 'text-[#8fabc2]'}`}>{f.status === 'active' ? getCountdown(f.endsAt) : fmtDate(f.endsAt)}</span></TableCell>
                        <TableCell className="hidden md:table-cell"><div className="w-24 space-y-1"><Progress value={pct} className="h-2 bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#5cadf0]" /><span className="text-xs text-[#8fabc2]">{f.currentRedemptions}{f.maxRedemptions ? `/${f.maxRedemptions}` : ''}</span></div></TableCell>
                        <TableCell className="text-right"><div className="flex justify-end gap-1">
                          {f.status === 'scheduled' && <Button variant="ghost" size="sm" className="h-8 text-xs text-[#5cadf0] hover:bg-[#5cadf0]/10 hover:text-[#a9d8ff]" onClick={() => flashAction(f.id, 'active')} title="Activer">Activer</Button>}
                          {(f.status === 'active' || f.status === 'scheduled') && <Button variant="ghost" size="sm" className="h-8 text-xs text-[#fbbf24] hover:bg-[#fbbf24]/10 hover:text-[#fbbf24]" onClick={() => flashAction(f.id, 'cancelled')} title="Annuler">Annuler</Button>}
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]" onClick={() => flashAction(f.id, 'delete')} title="Supprimer">Supprimer</Button>
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
              <StatCard label="Total" value={coupons.length} />
              <StatCard label="Actifs" value={coupons.filter(c => c.status === 'active').length} />
              <StatCard label="Utilisés" value={coupons.filter(c => c.status === 'used').length} />
              <StatCard label="Expirés" value={coupons.filter(c => c.status === 'expired').length} />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <Select value={cStatus} onValueChange={setCStatus}><SelectTrigger className={`${LUX_SELECT_TRIGGER} w-36`}><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="all">Tous</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="active">Actifs</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="used">Utilisés</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="expired">Expirés</SelectItem></SelectContent></Select>
                <Select value={cMerchant} onValueChange={setCMerchant}><SelectTrigger className={`${LUX_SELECT_TRIGGER} w-44`}><SelectValue placeholder="Commerçant" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="all">Tous</SelectItem>{merchants.map(m => <SelectItem className={LUX_SELECT_ITEM} key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <Dialog open={couponDlg} onOpenChange={o => { setCouponDlg(o); if (!o) rstC(); }}>
                <DialogTrigger asChild><Button size="sm" className="lux-btn h-9 rounded-full px-4 text-xs">Créer</Button></DialogTrigger>
                <DialogContent className="border-white/10 bg-[#0b1226] text-white"><DialogHeader><DialogTitle className="lux-display text-lg text-white">Nouveau coupon</DialogTitle><DialogDescription className="text-sm text-[#8fabc2]">Générer un code de réduction</DialogDescription></DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Commerçant *</Label><Select value={cf.merchantId} onValueChange={v => setCf(f => ({ ...f, merchantId: v }))}><SelectTrigger className={LUX_SELECT_TRIGGER}><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}>{merchants.map(m => <SelectItem className={LUX_SELECT_ITEM} key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Type</Label><Select value={cf.discountType} onValueChange={v => setCf(f => ({ ...f, discountType: v }))}><SelectTrigger className={LUX_SELECT_TRIGGER}><SelectValue /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="percentage">Pourcentage</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="fixed">Montant fixe</SelectItem></SelectContent></Select></div><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Valeur *</Label><Input className={LUX_INPUT} type="number" step="0.01" value={cf.discountValue} onChange={e => setCf(f => ({ ...f, discountValue: e.target.value }))} /></div></div>
                    <div className="grid grid-cols-2 gap-3"><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Max utilisations</Label><Input className={LUX_INPUT} type="number" value={cf.maxUses} onChange={e => setCf(f => ({ ...f, maxUses: e.target.value }))} /></div><div className="grid gap-1.5"><Label className="text-xs font-semibold text-[#c7d3ec]">Valide jusqu'au</Label><Input className={LUX_INPUT} type="date" value={cf.validUntil} onChange={e => setCf(f => ({ ...f, validUntil: e.target.value }))} /></div></div>
                  </div>
                  <DialogFooter><Button onClick={saveCoupon} disabled={submitting || !cf.merchantId || !cf.discountValue} className="lux-btn h-9 rounded-full px-4 text-xs">Créer</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="lux-scroll overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                  <TableRow className="border-white/8 hover:bg-transparent"><TableHead className="lux-eyebrow !text-[9.5px]">Code</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Commerçant</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Remise</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Utilisations</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden lg:table-cell">Expire</TableHead><TableHead className="lux-eyebrow !text-[9.5px] text-right">Actions</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCoupons.length === 0 && <TableRow className="border-white/8 hover:bg-white/[0.04]"><TableCell colSpan={7} className="text-center py-8 text-[#8fabc2]">Aucun coupon</TableCell></TableRow>}
                  {filteredCoupons.map(c => (
                    <TableRow key={c.id} className="border-white/8 hover:bg-white/[0.04]">
                      <TableCell><code className="cursor-pointer rounded border border-white/10 bg-white/[0.06] px-2 py-0.5 font-mono text-sm font-semibold text-white hover:bg-white/[0.09]" onClick={() => { navigator.clipboard.writeText(c.code); toast.success('Code copié !'); }}>{c.code}</code></TableCell>
                      <TableCell className="text-sm text-[#8fabc2]">{c.merchant?.name || '—'}</TableCell>
                      <TableCell className="font-semibold text-white">{c.discountType === 'percentage' ? `${c.discountValue}%` : fmtEur(c.discountValue)}</TableCell>
                      <TableCell><SB cfg={COUPON_STATUS[c.status] || COUPON_STATUS.active} /></TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-[#c7d3ec]">{c.currentUses}{c.maxUses ? `/${c.maxUses}` : ''}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-[#8fabc2]">{c.validUntil ? fmtDate(c.validUntil) : '—'}</TableCell>
                      <TableCell className="text-right">{c.status === 'active' && <Button variant="ghost" size="sm" className="lux-btn-ghost h-8 rounded-full px-3.5 text-xs" onClick={() => scanCoupon(c.id)}>Scanner</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ── Transactions ─────────────────────────────────────── */}
          <TabsContent value="transactions" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Total" value={transactions.length} />
              <StatCard label="Montant total" value={fmtEur(transactions.reduce((s, t) => s + t.amount, 0))} />
              <StatCard label="Ce mois" value={transactions.filter(t => { const d = new Date(t.createdAt), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={tType} onValueChange={setTType}><SelectTrigger className={`${LUX_SELECT_TRIGGER} w-44`}><SelectValue placeholder="Type" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="all">Tous</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="flash_sale">Vente flash</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="subscription">Abonnement</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="wallet_topup">Recharge</SelectItem></SelectContent></Select>
              <Select value={tStatus} onValueChange={setTStatus}><SelectTrigger className={`${LUX_SELECT_TRIGGER} w-40`}><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent className={LUX_SELECT_CONTENT}><SelectItem className={LUX_SELECT_ITEM} value="all">Tous</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="completed">Terminé</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="pending">En attente</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="failed">Échoué</SelectItem><SelectItem className={LUX_SELECT_ITEM} value="refunded">Remboursé</SelectItem></SelectContent></Select>
            </div>
            <div className="lux-scroll overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#0d1530]">
                  <TableRow className="border-white/8 hover:bg-transparent"><TableHead className="lux-eyebrow !text-[9.5px]">Date</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Type</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Montant</TableHead><TableHead className="lux-eyebrow !text-[9.5px]">Statut</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Payeur</TableHead><TableHead className="lux-eyebrow !text-[9.5px] hidden md:table-cell">Receveur</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTxns.length === 0 && <TableRow className="border-white/8 hover:bg-white/[0.04]"><TableCell colSpan={6} className="text-center py-8 text-[#8fabc2]">Aucune transaction</TableCell></TableRow>}
                  {filteredTxns.map(t => (
                    <TableRow key={t.id} className="border-white/8 hover:bg-white/[0.04]">
                      <TableCell className="text-sm text-[#c7d3ec]">{fmtDateTime(t.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline" className="border-white/12 bg-white/[0.03] text-[#8fabc2]">{t.type.replace(/_/g, ' ')}</Badge></TableCell>
                      <TableCell className="font-semibold text-white">{fmtEur(t.amount)}</TableCell>
                      <TableCell><SB cfg={TXN_STATUS[t.status] || TXN_STATUS.pending} /></TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-[#8fabc2] font-mono">{t.payerId ? `${t.payerId.slice(0, 8)}...` : '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-[#8fabc2] font-mono">{t.receiverId ? `${t.receiverId.slice(0, 8)}...` : '—'}</TableCell>
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

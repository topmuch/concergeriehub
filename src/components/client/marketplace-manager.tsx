'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Store,
  Plus,
  Star,
  Search,
  MapPin,
  Tag,
  Zap,
  Ticket,
  Receipt,
  ShieldCheck,
  Phone,
  Globe,
  Clock,
  Loader2,
  Trash2,
  Eye,
  Copy,
  CheckCircle,
  XCircle,
  ChevronRight,
  QrCode,
  Play,
  Ban,
  TrendingUp,
  Euro,
  CalendarDays,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// ── Types ──────────────────────────────────────────────────────
interface MerchantPhoto {
  id: string;
  url: string;
  altText?: string;
  sortOrder: number;
  isCover: boolean;
}

interface MerchantData {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  address: string | null;
  location: string | null;
  phone: string | null;
  website: string | null;
  openingHours: string;
  logoUrl: string | null;
  isVerified: boolean;
  ratingAvg: number;
  totalReviews: number;
  isActive: boolean;
  createdAt: string;
  merchantPhotos: MerchantPhoto[];
  promos?: PromoData[];
  _count?: { coupons: number };
  flashSales?: unknown[];
}

interface PromoData {
  id: string;
  merchantId: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  originalPrice: number | null;
  promoPrice: number | null;
  validFrom: string | null;
  validUntil: string | null;
  category: string | null;
  source: string;
  viewsCount: number;
  redemptionsCount: number;
  createdAt: string;
  merchant: { id: string; name: string; logoUrl: string | null } | null;
}

interface FlashSaleData {
  id: string;
  promoId: string;
  merchantId: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  originalPrice: number | null;
  flashPrice: number;
  geofenceRadiusMeters: number;
  startsAt: string;
  endsAt: string;
  maxRedemptions: number | null;
  currentRedemptions: number;
  status: string;
  costEuros: number;
  createdAt: string;
  merchant: { id: string; name: string; logoUrl: string | null; category?: string | null } | null;
}

interface CouponData {
  id: string;
  merchantId: string;
  userId: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxUses: number;
  currentUses: number;
  validFrom: string | null;
  validUntil: string | null;
  status: string;
  createdAt: string;
  merchant: { id: string; name: string } | null;
}

interface TransactionData {
  id: string;
  type: string;
  payerId: string | null;
  receiverId: string | null;
  amount: number;
  currency: string;
  status: string;
  referenceId: string | null;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────
const MERCHANT_CATEGORIES = [
  'Boulangerie',
  'Boucherie',
  'Épicerie',
  'Pharmacie',
  'Restauration',
  'Beauté',
  'Autre',
];

const FLASH_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Programmée', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0' },
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' },
  expired: { label: 'Expirée', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
  cancelled: { label: 'Annulée', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
};

const TXN_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0' },
  completed: { label: 'Terminé', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' },
  failed: { label: 'Échoué', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
  refunded: { label: 'Remboursé', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
};

const COUPON_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: 'Actif', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' },
  used: { label: 'Utilisé', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
  expired: { label: 'Expiré', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0' },
  cancelled: { label: 'Annulé', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
};

type TabType = 'merchants' | 'promos' | 'flash' | 'coupons' | 'transactions';

const userId = 'dev-user-1';

// ── Component ──────────────────────────────────────────────────
export function MarketplaceManager() {
  // Data state
  const [homeId, setHomeId] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [promos, setPromos] = useState<PromoData[]>([]);
  const [flashSales, setFlashSales] = useState<FlashSaleData[]>([]);
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('merchants');

  // Merchants UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantData | null>(null);
  const [merchantDetailOpen, setMerchantDetailOpen] = useState(false);
  const [createMerchantOpen, setCreateMerchantOpen] = useState(false);
  const [merchFormName, setMerchFormName] = useState('');
  const [merchFormCategory, setMerchFormCategory] = useState('');
  const [merchFormDesc, setMerchFormDesc] = useState('');
  const [merchFormAddress, setMerchFormAddress] = useState('');
  const [merchFormLocation, setMerchFormLocation] = useState('');
  const [merchFormPhone, setMerchFormPhone] = useState('');
  const [merchFormWebsite, setMerchFormWebsite] = useState('');
  const [merchFormHours, setMerchFormHours] = useState('{}');
  const [merchSubmitting, setMerchSubmitting] = useState(false);

  // Promos UI state
  const [promoMerchantFilter, setPromoMerchantFilter] = useState('all');
  const [promoCategoryFilter, setPromoCategoryFilter] = useState('all');
  const [promoStatusFilter, setPromoStatusFilter] = useState('all');
  const [createPromoOpen, setCreatePromoOpen] = useState(false);
  const [promoFormMerchantId, setPromoFormMerchantId] = useState('');
  const [promoFormTitle, setPromoFormTitle] = useState('');
  const [promoFormDesc, setPromoFormDesc] = useState('');
  const [promoFormImageUrl, setPromoFormImageUrl] = useState('');
  const [promoFormOrigPrice, setPromoFormOrigPrice] = useState('');
  const [promoFormPromoPrice, setPromoFormPromoPrice] = useState('');
  const [promoFormValidFrom, setPromoFormValidFrom] = useState('');
  const [promoFormValidUntil, setPromoFormValidUntil] = useState('');
  const [promoFormCategory, setPromoFormCategory] = useState('');
  const [promoFormSource, setPromoFormSource] = useState('local');
  const [promoSubmitting, setPromoSubmitting] = useState(false);

  // Flash Sales UI state
  const [createFlashOpen, setCreateFlashOpen] = useState(false);
  const [flashFormMerchantId, setFlashFormMerchantId] = useState('');
  const [flashFormPromoId, setFlashFormPromoId] = useState('');
  const [flashFormTitle, setFlashFormTitle] = useState('');
  const [flashFormDesc, setFlashFormDesc] = useState('');
  const [flashFormImageUrl, setFlashFormImageUrl] = useState('');
  const [flashFormOrigPrice, setFlashFormOrigPrice] = useState('');
  const [flashFormFlashPrice, setFlashFormFlashPrice] = useState('');
  const [flashFormRadius, setFlashFormRadius] = useState('500');
  const [flashFormStartsAt, setFlashFormStartsAt] = useState('');
  const [flashFormEndsAt, setFlashFormEndsAt] = useState('');
  const [flashFormMaxRedemptions, setFlashFormMaxRedemptions] = useState('');
  const [flashFormCost, setFlashFormCost] = useState('0.5');
  const [flashSubmitting, setFlashSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Coupons UI state
  const [couponStatusFilter, setCouponStatusFilter] = useState('active');
  const [createCouponOpen, setCreateCouponOpen] = useState(false);
  const [couponFormMerchantId, setCouponFormMerchantId] = useState('');
  const [couponFormFlashSaleId, setCouponFormFlashSaleId] = useState('');
  const [couponFormDiscountType, setCouponFormDiscountType] = useState('percentage');
  const [couponFormDiscountValue, setCouponFormDiscountValue] = useState('');
  const [couponFormMaxUses, setCouponFormMaxUses] = useState('1');
  const [couponFormValidFrom, setCouponFormValidFrom] = useState('');
  const [couponFormValidUntil, setCouponFormValidUntil] = useState('');
  const [couponSubmitting, setCouponSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Transactions UI state
  const [txnTypeFilter, setTxnTypeFilter] = useState('all');
  const [txnStatusFilter, setTxnStatusFilter] = useState('all');

  // ── Fetch helpers ───────────────────────────────────────────
  const fetchHomeId = useCallback(async () => {
    try {
      const res = await fetch('/api/client/homes');
      const data = await res.json();
      const homes = data.homes || [];
      return homes[0]?.id || null;
    } catch {
      return null;
    }
  }, []);

  const fetchMerchants = useCallback(async (home?: string | null, category?: string, search?: string) => {
    try {
      let url = '/api/client/merchants?';
      const params: string[] = [];
      if (home) params.push(`homeId=${home}`);
      if (category && category !== 'all') params.push(`category=${encodeURIComponent(category)}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      url += params.join('&');
      const res = await fetch(url);
      const data = await res.json();
      return (Array.isArray(data) ? data : []) as MerchantData[];
    } catch {
      return [];
    }
  }, []);

  const fetchPromos = useCallback(async (merchantId?: string, category?: string, status?: string) => {
    try {
      let url = '/api/client/promos?';
      const params: string[] = [];
      if (merchantId && merchantId !== 'all') params.push(`merchantId=${merchantId}`);
      if (category && category !== 'all') params.push(`category=${encodeURIComponent(category)}`);
      if (status === 'active') params.push('isActive=true');
      url += params.join('&');
      const res = await fetch(url);
      const data = await res.json();
      return (Array.isArray(data) ? data : []) as PromoData[];
    } catch {
      return [];
    }
  }, []);

  const fetchFlashSales = useCallback(async (status?: string) => {
    try {
      let url = '/api/client/flash-sales?';
      if (status && status !== 'all') {
        url += `status=${status}`;
      } else {
        url += 'status=all';
      }
      const res = await fetch(url);
      const data = await res.json();
      return (Array.isArray(data) ? data : []) as FlashSaleData[];
    } catch {
      return [];
    }
  }, []);

  const fetchCoupons = useCallback(async (status?: string) => {
    try {
      let url = '/api/client/coupons';
      if (status && status !== 'all') url += `?status=${status}`;
      const res = await fetch(url);
      const data = await res.json();
      return (Array.isArray(data) ? data : []) as CouponData[];
    } catch {
      return [];
    }
  }, []);

  const fetchTransactions = useCallback(async (type?: string, status?: string) => {
    try {
      const params: string[] = [];
      if (type && type !== 'all') params.push(`type=${type}`);
      if (status && status !== 'all') params.push(`status=${status}`);
      const url = `/api/client/transactions?${params.join('&')}&limit=50`;
      const res = await fetch(url);
      const data = await res.json();
      return {
        transactions: (data.transactions || []) as TransactionData[],
        total: data.total || 0,
      };
    } catch {
      return { transactions: [], total: 0 };
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const hid = await fetchHomeId();
      if (!hid) { setLoading(false); return; }
      setHomeId(hid);
      const [m, p, f, c, t] = await Promise.all([
        fetchMerchants(hid),
        fetchPromos(),
        fetchFlashSales('all'),
        fetchCoupons('all'),
        fetchTransactions(),
      ]);
      setMerchants(m);
      setPromos(p);
      setFlashSales(f);
      setCoupons(c);
      setTransactions(t.transactions);
      setTransactionsTotal(t.total);
    } catch {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, [fetchHomeId, fetchMerchants, fetchPromos, fetchFlashSales, fetchCoupons, fetchTransactions]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fetchTabData = useCallback(async (tab: TabType) => {
    setTabLoading(true);
    try {
      if (tab === 'merchants') {
        const data = await fetchMerchants(homeId, categoryFilter, searchQuery);
        setMerchants(data);
      } else if (tab === 'promos') {
        const data = await fetchPromos(promoMerchantFilter, promoCategoryFilter, promoStatusFilter);
        setPromos(data);
      } else if (tab === 'flash') {
        const data = await fetchFlashSales('all');
        setFlashSales(data);
      } else if (tab === 'coupons') {
        const data = await fetchCoupons(couponStatusFilter);
        setCoupons(data);
      } else if (tab === 'transactions') {
        const data = await fetchTransactions(txnTypeFilter, txnStatusFilter);
        setTransactions(data.transactions);
        setTransactionsTotal(data.total);
      }
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      setTabLoading(false);
    }
  }, [homeId, categoryFilter, searchQuery, promoMerchantFilter, promoCategoryFilter, promoStatusFilter, couponStatusFilter, txnTypeFilter, txnStatusFilter, fetchMerchants, fetchPromos, fetchFlashSales, fetchCoupons, fetchTransactions]);

  useEffect(() => {
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  // ── Flash sale countdown ─────────────────────────────────────
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // ── Helpers ─────────────────────────────────────────────────
  const renderStars = (rating: number, size: 'sm' | 'md' = 'sm') => {
    const sz = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`${sz} ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
          />
        ))}
      </div>
    );
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatEur = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const getCountdown = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - now;
    if (diff <= 0) return { h: 0, m: 0, s: 0, expired: true };
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { h, m, s, expired: false };
  };

  const isPromoActive = (p: PromoData) => {
    if (!p.validUntil) return true;
    return new Date(p.validUntil) >= new Date();
  };

  const getMerchantPromos = (merchantId: string): PromoData[] => {
    return promos.filter((p) => p.merchantId === merchantId);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(id);
      toast.success('Code copié !');
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  // ── Merchants handlers ───────────────────────────────────────
  const handleCreateMerchant = async () => {
    if (!merchFormName.trim()) return;
    setMerchSubmitting(true);
    try {
      const res = await fetch('/api/client/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: merchFormName.trim(),
          category: merchFormCategory || undefined,
          description: merchFormDesc || undefined,
          address: merchFormAddress || undefined,
          location: merchFormLocation || undefined,
          phone: merchFormPhone || undefined,
          website: merchFormWebsite || undefined,
          openingHours: merchFormHours || '{}',
          homeId: homeId || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Commerçant créé avec succès');
      setCreateMerchantOpen(false);
      setMerchFormName(''); setMerchFormCategory(''); setMerchFormDesc('');
      setMerchFormAddress(''); setMerchFormLocation(''); setMerchFormPhone('');
      setMerchFormWebsite(''); setMerchFormHours('{}');
      fetchTabData('merchants');
    } catch {
      toast.error("Erreur lors de la création du commerçant");
    } finally {
      setMerchSubmitting(false);
    }
  };

  const handleDeleteMerchant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/client/merchants/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Commerçant désactivé');
      fetchTabData('merchants');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleToggleActive = async (merchant: MerchantData, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/client/merchants/${merchant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !merchant.isActive }),
      });
      if (!res.ok) throw new Error();
      toast.success(merchant.isActive ? 'Commerçant désactivé' : 'Commerçant activé');
      fetchTabData('merchants');
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // ── Promos handlers ──────────────────────────────────────────
  const handleCreatePromo = async () => {
    if (!promoFormTitle.trim()) return;
    setPromoSubmitting(true);
    try {
      const res = await fetch('/api/client/promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: promoFormMerchantId || undefined,
          title: promoFormTitle.trim(),
          description: promoFormDesc || undefined,
          imageUrl: promoFormImageUrl || undefined,
          originalPrice: promoFormOrigPrice ? parseFloat(promoFormOrigPrice) : undefined,
          promoPrice: promoFormPromoPrice ? parseFloat(promoFormPromoPrice) : undefined,
          validFrom: promoFormValidFrom || undefined,
          validUntil: promoFormValidUntil || undefined,
          category: promoFormCategory || undefined,
          source: promoFormSource || 'local',
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Promotion créée avec succès');
      setCreatePromoOpen(false);
      setPromoFormTitle(''); setPromoFormDesc(''); setPromoFormImageUrl('');
      setPromoFormOrigPrice(''); setPromoFormPromoPrice('');
      setPromoFormValidFrom(''); setPromoFormValidUntil('');
      setPromoFormCategory(''); setPromoFormSource('local'); setPromoFormMerchantId('');
      fetchTabData('promos');
    } catch {
      toast.error("Erreur lors de la création de la promotion");
    } finally {
      setPromoSubmitting(false);
    }
  };

  const handleRedeemPromo = async (promoId: string) => {
    try {
      const res = await fetch(`/api/client/promos/${promoId}/redeem`, { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success('Promo récupérée !');
      fetchTabData('promos');
    } catch {
      toast.error('Erreur lors de la récupération');
    }
  };

  // ── Flash Sales handlers ─────────────────────────────────────
  const handleCreateFlashSale = async () => {
    if (!flashFormMerchantId || !flashFormPromoId || !flashFormFlashPrice || !flashFormStartsAt || !flashFormEndsAt) return;
    setFlashSubmitting(true);
    try {
      const res = await fetch('/api/client/flash-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: flashFormMerchantId,
          promoId: flashFormPromoId,
          title: flashFormTitle || undefined,
          description: flashFormDesc || undefined,
          imageUrl: flashFormImageUrl || undefined,
          originalPrice: flashFormOrigPrice ? parseFloat(flashFormOrigPrice) : undefined,
          flashPrice: parseFloat(flashFormFlashPrice),
          geofenceRadiusMeters: parseInt(flashFormRadius) || 500,
          startsAt: flashFormStartsAt,
          endsAt: flashFormEndsAt,
          maxRedemptions: flashFormMaxRedemptions ? parseInt(flashFormMaxRedemptions) : undefined,
          costEuros: parseFloat(flashFormCost) || 0.5,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Vente flash créée');
      setCreateFlashOpen(false);
      setFlashFormMerchantId(''); setFlashFormPromoId(''); setFlashFormTitle('');
      setFlashFormDesc(''); setFlashFormImageUrl(''); setFlashFormOrigPrice('');
      setFlashFormFlashPrice(''); setFlashFormRadius('500');
      setFlashFormStartsAt(''); setFlashFormEndsAt('');
      setFlashFormMaxRedemptions(''); setFlashFormCost('0.5');
      fetchTabData('flash');
    } catch {
      toast.error('Erreur lors de la création');
    } finally {
      setFlashSubmitting(false);
    }
  };

  const handleFlashStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/client/flash-sales/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Vente flash ${newStatus === 'active' ? 'activée' : 'annulée'}`);
      fetchTabData('flash');
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // ── Coupons handlers ─────────────────────────────────────────
  const handleClaimCoupon = async () => {
    if (!couponFormMerchantId || !couponFormDiscountValue) return;
    setCouponSubmitting(true);
    try {
      const res = await fetch('/api/client/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: couponFormMerchantId,
          flashSaleId: couponFormFlashSaleId || undefined,
          discountType: couponFormDiscountType,
          discountValue: parseFloat(couponFormDiscountValue),
          maxUses: parseInt(couponFormMaxUses) || 1,
          validFrom: couponFormValidFrom || undefined,
          validUntil: couponFormValidUntil || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Coupon réclamé avec succès !');
      setCreateCouponOpen(false);
      setCouponFormMerchantId(''); setCouponFormFlashSaleId('');
      setCouponFormDiscountType('percentage'); setCouponFormDiscountValue('');
      setCouponFormMaxUses('1'); setCouponFormValidFrom(''); setCouponFormValidUntil('');
      fetchTabData('coupons');
    } catch {
      toast.error('Erreur lors de la réclamation');
    } finally {
      setCouponSubmitting(false);
    }
  };

  const handleScanCoupon = async (couponId: string, merchantId: string) => {
    try {
      const res = await fetch(`/api/client/coupons/${couponId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Coupon scanné avec succès !');
      fetchTabData('coupons');
    } catch {
      toast.error('Erreur lors du scan');
    }
  };

  // ── Loading skeleton ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!homeId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-2xl border-2 border-dashed border-muted-foreground/25 p-12 max-w-md">
          <Store className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-semibold">Aucune maison</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Créez d'abord une maison pour accéder au marketplace.
          </p>
        </div>
      </div>
    );
  }

  // ── Computed ────────────────────────────────────────────────
  const totalMerchants = merchants.length;
  const verifiedMerchants = merchants.filter((m) => m.isVerified).length;
  const activeMerchants = merchants.filter((m) => m.isActive).length;

  const activePromos = promos.filter((p) => isPromoActive(p)).length;
  const redeemedPromos = promos.filter((p) => p.redemptionsCount > 0).length;

  const activeFlashSales = flashSales.filter((f) => f.status === 'active').length;
  const scheduledFlashSales = flashSales.filter((f) => f.status === 'scheduled').length;
  const expiredFlashSales = flashSales.filter((f) => f.status === 'expired').length;

  const activeCoupons = coupons.filter((c) => c.status === 'active').length;
  const usedCoupons = coupons.filter((c) => c.status === 'used').length;
  const totalEconomy = coupons
    .filter((c) => c.status === 'used')
    .reduce((sum, c) => sum + c.discountValue, 0);

  const totalTxnAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const thisMonthTxns = transactions.filter((t) => {
    const d = new Date(t.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const filteredMerchants = merchants.filter(
    (m) =>
      !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.category && m.category.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const filteredPromos = promos.filter((p) => {
    if (promoStatusFilter === 'active' && !isPromoActive(p)) return false;
    if (promoStatusFilter === 'expired' && isPromoActive(p)) return false;
    return true;
  });

  const filteredCoupons = coupons;

  const merchantPromosForFlash = flashFormMerchantId
    ? promos.filter((p) => p.merchantId === flashFormMerchantId)
    : [];

  const flashSalesForCoupon = couponFormMerchantId
    ? flashSales.filter((f) => f.merchantId === couponFormMerchantId && (f.status === 'active' || f.status === 'scheduled'))
    : [];

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Section 1 - Header + Stats */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Marketplace</h2>
            <p className="text-sm text-muted-foreground">
              Commerçants, promotions, ventes flash et coupons
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards - per tab */}
      {activeTab === 'merchants' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-400 via-violet-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Commerçants</p>
                <p className="text-3xl font-bold tabular-nums">{totalMerchants}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Store className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Vérifiés</p>
                <p className="text-3xl font-bold tabular-nums">{verifiedMerchants}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Actifs</p>
                <p className="text-3xl font-bold tabular-nums">{activeMerchants}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Eye className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
        </div>
      )}

      {activeTab === 'promos' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-400 via-violet-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Total promos</p>
                <p className="text-3xl font-bold tabular-nums">{promos.length}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Tag className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Actives</p>
                <p className="text-3xl font-bold tabular-nums">{activePromos}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <CheckCircle className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Rédemptées</p>
                <p className="text-3xl font-bold tabular-nums">{redeemedPromos}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
        </div>
      )}

      {activeTab === 'flash' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-400 via-violet-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Total</p>
                <p className="text-3xl font-bold tabular-nums">{flashSales.length}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Zap className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white/80">Actives</p>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                  </span>
                </div>
                <p className="text-3xl font-bold tabular-nums">{activeFlashSales}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Zap className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-400 via-yellow-500 to-amber-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Programmées</p>
                <p className="text-3xl font-bold tabular-nums">{scheduledFlashSales}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Clock className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-400 via-slate-500 to-slate-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Expirées</p>
                <p className="text-3xl font-bold tabular-nums">{expiredFlashSales}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <XCircle className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          </div>
        </div>
      )}

      {activeTab === 'coupons' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-400 via-violet-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Mes coupons</p>
                <p className="text-3xl font-bold tabular-nums">{coupons.length}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Ticket className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Actifs</p>
                <p className="text-3xl font-bold tabular-nums">{activeCoupons}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <CheckCircle className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Utilisés</p>
                <p className="text-3xl font-bold tabular-nums">{usedCoupons}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-400 via-rose-500 to-pink-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Économie totale</p>
                <p className="text-3xl font-bold tabular-nums">{totalEconomy.toFixed(0)} €</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Euro className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-400 via-violet-500 to-purple-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Total transactions</p>
                <p className="text-3xl font-bold tabular-nums">{transactionsTotal}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Receipt className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Montant total</p>
                <p className="text-3xl font-bold tabular-nums">{formatEur(totalTxnAmount)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Euro className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/80">Ce mois</p>
                <p className="text-3xl font-bold tabular-nums">{thisMonthTxns}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <CalendarDays className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
          </div>
        </div>
      )}

      {/* Section 2 - Tab buttons + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'merchants' as TabType, label: 'Commerçants', icon: Store },
            { key: 'promos' as TabType, label: 'Promotions', icon: Tag },
            { key: 'flash' as TabType, label: 'Ventes Flash', icon: Zap },
            { key: 'coupons' as TabType, label: 'Coupons', icon: Ticket },
            { key: 'transactions' as TabType, label: 'Transactions', icon: Receipt },
          ]).map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={activeTab === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(key)}
              className={
                activeTab === key
                  ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-sm'
                  : ''
              }
            >
              <Icon className="h-3.5 w-3.5 mr-1.5" />
              {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Tab-specific action buttons */}
          {activeTab === 'merchants' && (
            <Dialog open={createMerchantOpen} onOpenChange={setCreateMerchantOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-md">
                  <Plus className="h-4 w-4" />
                  Nouveau commerçant
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-violet-500" />
                    Nouveau commerçant
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="m-name">Nom *</Label>
                    <Input id="m-name" placeholder="Ex: Boulangerie Dupont" value={merchFormName} onChange={(e) => setMerchFormName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Catégorie</Label>
                    <Select value={merchFormCategory} onValueChange={setMerchFormCategory}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      <SelectContent>
                        {MERCHANT_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="m-desc">Description</Label>
                    <Textarea id="m-desc" placeholder="Décrivez le commerçant..." value={merchFormDesc} onChange={(e) => setMerchFormDesc(e.target.value)} rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="m-address">Adresse</Label>
                      <Input id="m-address" placeholder="12 rue de la Paix" value={merchFormAddress} onChange={(e) => setMerchFormAddress(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="m-location">Localisation</Label>
                      <Input id="m-location" placeholder="Paris 11e" value={merchFormLocation} onChange={(e) => setMerchFormLocation(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="m-phone">Téléphone</Label>
                      <Input id="m-phone" placeholder="01 23 45 67 89" value={merchFormPhone} onChange={(e) => setMerchFormPhone(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="m-website">Site web</Label>
                      <Input id="m-website" placeholder="https://..." value={merchFormWebsite} onChange={(e) => setMerchFormWebsite(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="m-hours">Horaires (JSON)</Label>
                    <Textarea id="m-hours" placeholder='{"lun":"9h-19h"}' value={merchFormHours} onChange={(e) => setMerchFormHours(e.target.value)} rows={3} className="font-mono text-xs" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateMerchantOpen(false)}>Annuler</Button>
                  <Button
                    onClick={handleCreateMerchant}
                    disabled={!merchFormName.trim() || merchSubmitting}
                    className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
                  >
                    {merchSubmitting ? 'Création...' : 'Créer'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {activeTab === 'promos' && (
            <Dialog open={createPromoOpen} onOpenChange={setCreatePromoOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-md">
                  <Plus className="h-4 w-4" />
                  Nouvelle promo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Tag className="h-5 w-5 text-violet-500" />
                    Nouvelle promotion
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Commerçant</Label>
                    <Select value={promoFormMerchantId} onValueChange={setPromoFormMerchantId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {merchants.filter((m) => m.isActive).map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p-title">Titre *</Label>
                    <Input id="p-title" placeholder="Ex: -20% sur les pains" value={promoFormTitle} onChange={(e) => setPromoFormTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p-desc">Description</Label>
                    <Textarea id="p-desc" placeholder="Détails de la promotion..." value={promoFormDesc} onChange={(e) => setPromoFormDesc(e.target.value)} rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="p-orig">Prix original (€)</Label>
                      <Input id="p-orig" type="number" min={0} step={0.01} placeholder="10.00" value={promoFormOrigPrice} onChange={(e) => setPromoFormOrigPrice(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="p-promo">Prix promo (€)</Label>
                      <Input id="p-promo" type="number" min={0} step={0.01} placeholder="7.50" value={promoFormPromoPrice} onChange={(e) => setPromoFormPromoPrice(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="p-from">Valide du</Label>
                      <Input id="p-from" type="datetime-local" value={promoFormValidFrom} onChange={(e) => setPromoFormValidFrom(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="p-until">Jusqu'au</Label>
                      <Input id="p-until" type="datetime-local" value={promoFormValidUntil} onChange={(e) => setPromoFormValidUntil(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Catégorie</Label>
                      <Select value={promoFormCategory} onValueChange={setPromoFormCategory}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                        <SelectContent>
                          {MERCHANT_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Source</Label>
                      <Select value={promoFormSource} onValueChange={setPromoFormSource}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local</SelectItem>
                          <SelectItem value="scraped">Scrapé</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="p-image">URL image</Label>
                    <Input id="p-image" placeholder="https://..." value={promoFormImageUrl} onChange={(e) => setPromoFormImageUrl(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreatePromoOpen(false)}>Annuler</Button>
                  <Button
                    onClick={handleCreatePromo}
                    disabled={!promoFormTitle.trim() || promoSubmitting}
                    className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
                  >
                    {promoSubmitting ? 'Création...' : 'Créer'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {activeTab === 'flash' && (
            <Dialog open={createFlashOpen} onOpenChange={setCreateFlashOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-md">
                  <Plus className="h-4 w-4" />
                  Nouvelle vente flash
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    Nouvelle vente flash
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Commerçant *</Label>
                      <Select value={flashFormMerchantId} onValueChange={(v) => { setFlashFormMerchantId(v); setFlashFormPromoId(''); }}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {merchants.filter((m) => m.isActive).map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Promo associée *</Label>
                      <Select value={flashFormPromoId} onValueChange={setFlashFormPromoId} disabled={!flashFormMerchantId}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {merchantPromosForFlash.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="f-title">Titre</Label>
                    <Input id="f-title" placeholder="Ex: Flash -50% baguettes" value={flashFormTitle} onChange={(e) => setFlashFormTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="f-desc">Description</Label>
                    <Textarea id="f-desc" placeholder="Détails..." value={flashFormDesc} onChange={(e) => setFlashFormDesc(e.target.value)} rows={2} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="f-orig">Prix orig. (€)</Label>
                      <Input id="f-orig" type="number" min={0} step={0.01} placeholder="10.00" value={flashFormOrigPrice} onChange={(e) => setFlashFormOrigPrice(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-flash">Prix flash (€) *</Label>
                      <Input id="f-flash" type="number" min={0} step={0.01} placeholder="5.00" value={flashFormFlashPrice} onChange={(e) => setFlashFormFlashPrice(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-radius">Rayon (m)</Label>
                      <Input id="f-radius" type="number" min={50} value={flashFormRadius} onChange={(e) => setFlashFormRadius(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="f-start">Début *</Label>
                      <Input id="f-start" type="datetime-local" value={flashFormStartsAt} onChange={(e) => setFlashFormStartsAt(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-end">Fin *</Label>
                      <Input id="f-end" type="datetime-local" value={flashFormEndsAt} onChange={(e) => setFlashFormEndsAt(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="f-max">Max rédemptions</Label>
                      <Input id="f-max" type="number" min={1} placeholder="50" value={flashFormMaxRedemptions} onChange={(e) => setFlashFormMaxRedemptions(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="f-cost">Coût (€)</Label>
                      <Input id="f-cost" type="number" min={0} step={0.01} value={flashFormCost} onChange={(e) => setFlashFormCost(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="f-image">URL image</Label>
                    <Input id="f-image" placeholder="https://..." value={flashFormImageUrl} onChange={(e) => setFlashFormImageUrl(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateFlashOpen(false)}>Annuler</Button>
                  <Button
                    onClick={handleCreateFlashSale}
                    disabled={!flashFormMerchantId || !flashFormPromoId || !flashFormFlashPrice || !flashFormStartsAt || !flashFormEndsAt || flashSubmitting}
                    className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
                  >
                    {flashSubmitting ? 'Création...' : 'Créer'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {activeTab === 'coupons' && (
            <Dialog open={createCouponOpen} onOpenChange={setCreateCouponOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-md">
                  <Plus className="h-4 w-4" />
                  Réclamer un coupon
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Ticket className="h-5 w-5 text-violet-500" />
                    Réclamer un coupon
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Commerçant *</Label>
                    <Select value={couponFormMerchantId} onValueChange={(v) => { setCouponFormMerchantId(v); setCouponFormFlashSaleId(''); }}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {merchants.filter((m) => m.isActive).map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Vente flash (optionnel)</Label>
                    <Select value={couponFormFlashSaleId} onValueChange={setCouponFormFlashSaleId} disabled={!couponFormMerchantId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Aucune" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {flashSalesForCoupon.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.title || 'Vente flash'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type de réduction</Label>
                      <Select value={couponFormDiscountType} onValueChange={setCouponFormDiscountType}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Pourcentage</SelectItem>
                          <SelectItem value="fixed">Montant fixe</SelectItem>
                          <SelectItem value="bogof">1 acheté = 1 offert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-value">Valeur *</Label>
                      <Input id="c-value" type="number" min={0} step={0.01} placeholder="20" value={couponFormDiscountValue} onChange={(e) => setCouponFormDiscountValue(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="c-max">Max utilisations</Label>
                      <Input id="c-max" type="number" min={1} value={couponFormMaxUses} onChange={(e) => setCouponFormMaxUses(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-from">Valide du</Label>
                      <Input id="c-from" type="datetime-local" value={couponFormValidFrom} onChange={(e) => setCouponFormValidFrom(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-until">Valide jusqu'au</Label>
                    <Input id="c-until" type="datetime-local" value={couponFormValidUntil} onChange={(e) => setCouponFormValidUntil(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateCouponOpen(false)}>Annuler</Button>
                  <Button
                    onClick={handleClaimCoupon}
                    disabled={!couponFormMerchantId || !couponFormDiscountValue || couponSubmitting}
                    className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
                  >
                    {couponSubmitting ? 'Réclamation...' : 'Réclamer'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Section 3 - Tab Content */}
      {tabLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* ═══════════════════ Tab: Commerçants ═══════════════════ */}
          {activeTab === 'merchants' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher par nom ou catégorie..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); fetchTabData('merchants'); }}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Toutes catégories" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">Tous</SelectItem>
                    {MERCHANT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filteredMerchants.length === 0 ? (
                <div className="text-center py-12">
                  <Store className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucun commerçant trouvé</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredMerchants.map((m) => (
                    <Card
                      key={m.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setSelectedMerchant(m); setMerchantDetailOpen(true); }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm truncate">{m.name}</h4>
                              {m.isVerified && (
                                <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              )}
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                {m.category || 'Autre'}
                              </Badge>
                            </div>
                            {m.address && (
                              <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 shrink-0" />{m.address}
                              </div>
                            )}
                            {m.phone && (
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3 shrink-0" />{m.phone}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {renderStars(Math.round(m.ratingAvg))}
                              <span className="text-xs text-muted-foreground">({m.totalReviews})</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <button
                              onClick={(e) => handleToggleActive(m, e)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${m.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${m.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteMerchant(m.id, e)}
                              className="text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Merchant detail dialog */}
              <Dialog open={merchantDetailOpen} onOpenChange={setMerchantDetailOpen}>
                <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
                  {selectedMerchant && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          {selectedMerchant.name}
                          {selectedMerchant.isVerified && <ShieldCheck className="h-5 w-5 text-blue-500" />}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="border-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                            {selectedMerchant.category || 'Autre'}
                          </Badge>
                          <Badge variant="outline" className={`border-0 ${selectedMerchant.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                            {selectedMerchant.isActive ? 'Actif' : 'Inactif'}
                          </Badge>
                        </div>

                        {selectedMerchant.description && (
                          <p className="text-sm text-muted-foreground leading-relaxed">{selectedMerchant.description}</p>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {selectedMerchant.address && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4 shrink-0" />{selectedMerchant.address}
                            </div>
                          )}
                          {selectedMerchant.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-4 w-4 shrink-0" />{selectedMerchant.phone}
                            </div>
                          )}
                          {selectedMerchant.website && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Globe className="h-4 w-4 shrink-0" />{selectedMerchant.website}
                            </div>
                          )}
                          {selectedMerchant.location && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4 shrink-0" />{selectedMerchant.location}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {renderStars(Math.round(selectedMerchant.ratingAvg), 'md')}
                          <span className="text-sm text-muted-foreground">{selectedMerchant.ratingAvg.toFixed(1)} ({selectedMerchant.totalReviews} avis)</span>
                        </div>

                        {/* Photos */}
                        {selectedMerchant.merchantPhotos && selectedMerchant.merchantPhotos.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Photos ({selectedMerchant.merchantPhotos.length})</h4>
                            <div className="grid grid-cols-3 gap-2">
                              {selectedMerchant.merchantPhotos.map((photo) => (
                                <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
                                  <img src={photo.url} alt={photo.altText || ''} className="h-full w-full object-cover" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Promo count */}
                        <div className="flex items-center gap-2 text-sm">
                          <Tag className="h-4 w-4 text-violet-500" />
                          <span className="text-muted-foreground">
                            {getMerchantPromos(selectedMerchant.id).length} promotion(s)
                          </span>
                        </div>

                        {/* Opening hours */}
                        {selectedMerchant.openingHours && selectedMerchant.openingHours !== '{}' && (
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Horaires d'ouverture</h4>
                            <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-lg overflow-x-auto">
                              {JSON.stringify(JSON.parse(selectedMerchant.openingHours), null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ═══════════════════ Tab: Promotions ═══════════════════ */}
          {activeTab === 'promos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={promoMerchantFilter} onValueChange={(v) => { setPromoMerchantFilter(v); fetchTabData('promos'); }}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Tous les commerçants" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">Tous les commerçants</SelectItem>
                    {merchants.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={promoCategoryFilter} onValueChange={(v) => { setPromoCategoryFilter(v); fetchTabData('promos'); }}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">Toutes</SelectItem>
                    {MERCHANT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={promoStatusFilter} onValueChange={(v) => { setPromoStatusFilter(v); fetchTabData('promos'); }}>
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="active">Actives</SelectItem>
                    <SelectItem value="expired">Expirées</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredPromos.length === 0 ? (
                <div className="text-center py-12">
                  <Tag className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucune promotion trouvée</p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-3">
                  {filteredPromos.map((p) => (
                    <Card key={p.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm">{p.title}</h4>
                              <Badge
                                className={`text-[10px] px-1.5 py-0 ${isPromoActive(p) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0'}`}
                              >
                                {isPromoActive(p) ? 'Active' : 'Expirée'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {p.merchant?.name || 'Sans commerçant'}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              {p.originalPrice != null && p.promoPrice != null && (
                                <span className="line-through text-muted-foreground">{formatEur(p.originalPrice)}</span>
                              )}
                              {p.promoPrice != null && (
                                <span className="font-semibold text-violet-600 dark:text-violet-400">{formatEur(p.promoPrice)}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{p.viewsCount}</span>
                              <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{p.redemptionsCount}</span>
                              {p.validUntil && (
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(p.validUntil).toLocaleDateString('fr-FR')}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRedeemPromo(p.id)}
                            className="shrink-0 text-violet-600 hover:bg-violet-50"
                          >
                            Récupérer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════ Tab: Ventes Flash ═══════════════════ */}
          {activeTab === 'flash' && (
            <div className="space-y-3">
              {flashSales.length === 0 ? (
                <div className="text-center py-12">
                  <Zap className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucune vente flash</p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-3">
                  {flashSales.map((f) => {
                    const cd = getCountdown(f.endsAt);
                    const progress = f.maxRedemptions
                      ? Math.min((f.currentRedemptions / f.maxRedemptions) * 100, 100)
                      : 0;
                    const statusCfg = FLASH_STATUS_CONFIG[f.status] || FLASH_STATUS_CONFIG.scheduled;

                    return (
                      <Card key={f.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium text-sm">{f.title || 'Vente flash'}</h4>
                                <Badge className={`text-[10px] px-1.5 py-0 ${statusCfg.className}`}>
                                  {f.status === 'active' && (
                                    <span className="relative flex h-2 w-2 mr-1">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                    </span>
                                  )}
                                  {statusCfg.label}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{f.merchant?.name || 'Commerçant'}</p>

                              <div className="flex items-center gap-3 mt-2 text-xs">
                                {f.originalPrice != null && (
                                  <span className="line-through text-muted-foreground">{formatEur(f.originalPrice)}</span>
                                )}
                                <span className="font-semibold text-amber-600 dark:text-amber-400">{formatEur(f.flashPrice)}</span>
                              </div>

                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{f.geofenceRadiusMeters}m</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />
                                  {formatDateTime(f.startsAt)} → {formatDateTime(f.endsAt)}
                                </span>
                              </div>

                              {/* Countdown */}
                              {f.status === 'active' && !cd.expired && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">
                                    {String(cd.h).padStart(2, '0')}:{String(cd.m).padStart(2, '0')}:{String(cd.s).padStart(2, '0')}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">restantes</span>
                                </div>
                              )}

                              {/* Progress bar */}
                              {f.maxRedemptions && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                                    <span>{f.currentRedemptions} / {f.maxRedemptions} rédemptions</span>
                                    <span>{Math.round(progress)}%</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Status actions */}
                            <div className="flex flex-col gap-1.5 shrink-0">
                              {f.status === 'scheduled' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFlashStatus(f.id, 'active')}
                                  className="text-emerald-600 hover:bg-emerald-50"
                                >
                                  <Play className="h-3 w-3 mr-1" />Activer
                                </Button>
                              )}
                              {(f.status === 'scheduled' || f.status === 'active') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFlashStatus(f.id, 'cancelled')}
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  <Ban className="h-3 w-3 mr-1" />Annuler
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════ Tab: Coupons ═══════════════════ */}
          {activeTab === 'coupons' && (
            <div className="space-y-4">
              {/* Sub-tab filter */}
              <div className="flex items-center gap-2">
                {(['active', 'used', 'expired'] as const).map((st) => (
                  <Button
                    key={st}
                    variant={couponStatusFilter === st ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setCouponStatusFilter(st); fetchTabData('coupons'); }}
                    className={
                      couponStatusFilter === st
                        ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white'
                        : ''
                    }
                  >
                    {st === 'active' ? 'Actifs' : st === 'used' ? 'Utilisés' : 'Expirés'}
                    <span className="ml-1.5 text-xs opacity-80">
                      ({coupons.filter((c) => c.status === st).length})
                    </span>
                  </Button>
                ))}
              </div>

              {filteredCoupons.length === 0 ? (
                <div className="text-center py-12">
                  <Ticket className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucun coupon</p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-3">
                  {filteredCoupons
                    .filter((c) => couponStatusFilter === 'all' || c.status === couponStatusFilter)
                    .map((c) => (
                    <div
                      key={c.id}
                      className="relative border-2 border-dashed border-muted-foreground/30 rounded-2xl p-4 bg-white dark:bg-card"
                    >
                      {/* Ticket cutout effect */}
                      <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border-2 border-muted-foreground/20" />
                      <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border-2 border-muted-foreground/20" />

                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium text-sm">{c.merchant?.name || 'Commerçant'}</h4>
                            <Badge className={`text-[10px] px-1.5 py-0 ${COUPON_STATUS_CONFIG[c.status]?.className || ''}`}>
                              {COUPON_STATUS_CONFIG[c.status]?.label || c.status}
                            </Badge>
                          </div>

                          {/* Discount display */}
                          <div className="mt-2 text-lg font-bold text-violet-600 dark:text-violet-400">
                            {c.discountType === 'percentage'
                              ? `-${c.discountValue}%`
                              : c.discountType === 'bogof'
                                ? '1 acheté = 1 offert'
                                : `-${formatEur(c.discountValue)}`}
                          </div>

                          {/* Code */}
                          <div className="mt-2 flex items-center gap-2">
                            <code className="px-2.5 py-1 bg-muted rounded-md font-mono text-sm tracking-wider font-bold">
                              {c.code}
                            </code>
                            <button
                              onClick={() => copyToClipboard(c.code, c.id)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {copiedCode === c.id ? (
                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                          </div>

                          {/* Validity */}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {c.validFrom && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                Du {new Date(c.validFrom).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                            {c.validUntil && (
                              <span className="flex items-center gap-1">
                                Jusqu'au {new Date(c.validUntil).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Scan button */}
                        {c.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleScanCoupon(c.id, c.merchantId)}
                            className="shrink-0 text-violet-600 hover:bg-violet-50"
                          >
                            <QrCode className="h-3.5 w-3.5 mr-1.5" />
                            Scanner
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════ Tab: Transactions ═══════════════════ */}
          {activeTab === 'transactions' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={txnTypeFilter} onValueChange={(v) => { setTxnTypeFilter(v); fetchTabData('transactions'); }}>
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les types</SelectItem>
                    <SelectItem value="flash_sale">Vente flash</SelectItem>
                    <SelectItem value="commission">Commission</SelectItem>
                    <SelectItem value="subscription">Abonnement</SelectItem>
                    <SelectItem value="redemption">Rédemption</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={txnStatusFilter} onValueChange={(v) => { setTxnStatusFilter(v); fetchTabData('transactions'); }}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="completed">Terminé</SelectItem>
                    <SelectItem value="failed">Échoué</SelectItem>
                    <SelectItem value="refunded">Remboursé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {transactions.length === 0 ? (
                <div className="text-center py-12">
                  <Receipt className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucune transaction</p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent space-y-2">
                  {transactions.map((t) => {
                    const statusCfg = TXN_STATUS_CONFIG[t.status] || TXN_STATUS_CONFIG.pending;
                    return (
                      <Card key={t.id}>
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={`text-[10px] px-1.5 py-0 ${statusCfg.className}`}>
                                {statusCfg.label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                {t.type}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {formatDateTime(t.createdAt)}
                              </span>
                              {t.payerId && (
                                <span>P: {t.payerId.slice(0, 8)}…</span>
                              )}
                              {t.receiverId && (
                                <span>R: {t.receiverId.slice(0, 8)}…</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold ${t.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : t.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                              {formatEur(t.amount)}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

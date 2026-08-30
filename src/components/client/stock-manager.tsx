'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Package,
  Plus,
  Trash2,
  AlertTriangle,
  ShoppingCart,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Minus,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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

// ── Types ──────────────────────────────────────────────────────
interface ProductInstance {
  id: string;
  productId: string;
  homeId: string;
  purchaseDate: string | null;
  expiryDate: string | null;
  status: string;
  createdAt: string;
}

interface ProductData {
  id: string;
  homeId: string;
  name: string;
  category: string | null;
  minStockThreshold: number;
  currentStock: number;
  isOnShoppingList: boolean;
  createdAt: string;
  updatedAt: string;
  productInstances: ProductInstance[];
}

interface HomeData {
  id: string;
  name: string;
}

// ── Constants ──────────────────────────────────────────────────
const CATEGORIES = [
  'Produits laitiers',
  'Fruits & Légumes',
  'Viandes & Poissons',
  'Épicerie',
  'Boissons',
  'Surgelés',
  "Produits d'entretien",
  'Autre',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'Produits laitiers': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'Fruits & Légumes': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Viandes & Poissons': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'Épicerie': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Boissons': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Surgelés': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  "Produits d'entretien": 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'Autre': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  fresh: { label: 'Frais', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0' },
  expired: { label: 'Expiré', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0' },
  consumed: { label: 'Consommé', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
  discarded: { label: 'Jeté', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0' },
};

type TabType = 'products' | 'dlc' | 'stock';

// ── Component ──────────────────────────────────────────────────
export function StockManager() {
  // Data state
  const [homeId, setHomeId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [dlcProducts, setDlcProducts] = useState<ProductData[]>([]);
  const [stockProducts, setStockProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [instanceDialogProduct, setInstanceDialogProduct] = useState<ProductData | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<string>('');
  const [formMinStock, setFormMinStock] = useState('1');
  const [formCurrentStock, setFormCurrentStock] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  // Instance form state
  const [instPurchaseDate, setInstPurchaseDate] = useState('');
  const [instExpiryDate, setInstExpiryDate] = useState('');
  const [instanceSubmitting, setInstanceSubmitting] = useState(false);

  // Alert check state
  const [checkingAlerts, setCheckingAlerts] = useState(false);

  // ── Fetch data ──────────────────────────────────────────────
  const fetchProducts = useCallback(async (home: string, filter: string = 'all') => {
    try {
      const res = await fetch(`/api/client/products?homeId=${home}&filter=${filter}`);
      const data = await res.json();
      return (data.products || []) as ProductData[];
    } catch {
      return [];
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const homesRes = await fetch('/api/client/homes');
      const homesData = await homesRes.json();
      const homes: HomeData[] = homesData.homes || [];
      const firstHomeId = homes[0]?.id;

      if (!firstHomeId) {
        setLoading(false);
        return;
      }

      setHomeId(firstHomeId);

      const [allProds] = await Promise.all([
        fetchProducts(firstHomeId, 'all'),
      ]);

      setProducts(allProds);
    } catch {
      toast.error('Erreur lors du chargement des produits');
    } finally {
      setLoading(false);
    }
  }, [fetchProducts]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fetchTabData = useCallback(async (tab: TabType) => {
    if (!homeId) return;
    setTabLoading(true);
    try {
      const filterMap: Record<TabType, string> = {
        products: 'all',
        dlc: 'dlc',
        stock: 'stock',
      };
      const data = await fetchProducts(homeId, filterMap[tab]);
      if (tab === 'products') setProducts(data);
      else if (tab === 'dlc') setDlcProducts(data);
      else if (tab === 'stock') setStockProducts(data);
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      setTabLoading(false);
    }
  }, [homeId, fetchProducts]);

  useEffect(() => {
    if (homeId) fetchTabData(activeTab);
  }, [activeTab, homeId, fetchTabData]);

  // ── Helpers ─────────────────────────────────────────────────
  const toggleExpand = (productId: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const getDaysUntilExpiry = (expiryDate: string | null): number | null => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getDlcColor = (days: number): string => {
    if (days === 0) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0';
    if (days === 1) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0';
    if (days === 2) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-0';
    return 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300 border-0';
  };

  const getFreshInstances = (product: ProductData) =>
    product.productInstances.filter((i) => i.status === 'fresh' && i.expiryDate);

  const getStockColor = (current: number, min: number) =>
    current > min ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

  const getStockProgressColor = (current: number, min: number) => {
    if (current <= 0) return 'bg-red-500';
    if (current <= min) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  // ── Handlers ────────────────────────────────────────────────
  const resetForm = () => {
    setFormName('');
    setFormCategory('');
    setFormMinStock('1');
    setFormCurrentStock('0');
  };

  const handleCreateProduct = async () => {
    if (!formName.trim() || !homeId) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/client/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeId,
          name: formName.trim(),
          category: formCategory || undefined,
          minStockThreshold: parseInt(formMinStock) || 1,
          currentStock: parseInt(formCurrentStock) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Produit ajouté avec succès');
      setAddDialogOpen(false);
      resetForm();
      fetchTabData(activeTab);
    } catch {
      toast.error('Erreur lors de l\'ajout du produit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Supprimer ce produit et toutes ses instances ?')) return;

    try {
      const res = await fetch(`/api/client/products/${productId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Produit supprimé');
      fetchTabData(activeTab);
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleUpdateStock = async (productId: string, delta: number, currentStock: number) => {
    const newStock = Math.max(0, currentStock + delta);
    try {
      const res = await fetch(`/api/client/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStock: newStock }),
      });
      if (!res.ok) throw new Error();
      fetchTabData(activeTab);
    } catch {
      toast.error('Erreur lors de la mise à jour du stock');
    }
  };

  const handleAddInstance = async () => {
    if (!instanceDialogProduct || !homeId) return;

    setInstanceSubmitting(true);
    try {
      const res = await fetch('/api/client/products/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: instanceDialogProduct.id,
          homeId,
          purchaseDate: instPurchaseDate || undefined,
          expiryDate: instExpiryDate || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Instance ajoutée avec succès');
      setInstanceDialogProduct(null);
      setInstPurchaseDate('');
      setInstExpiryDate('');
      fetchTabData(activeTab);
    } catch {
      toast.error('Erreur lors de l\'ajout de l\'instance');
    } finally {
      setInstanceSubmitting(false);
    }
  };

  const handleCheckAlerts = async () => {
    if (!homeId) return;

    setCheckingAlerts(true);
    try {
      const res = await fetch('/api/client/products/check-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(
        `${data.dlcAlerts} alertes DLC, ${data.stockAlerts} alertes stock, ${data.notifications} notifications envoyées`
      );
      // Refresh data after alert check
      fetchTabData(activeTab);
    } catch {
      toast.error('Erreur lors de la vérification des alertes');
    } finally {
      setCheckingAlerts(false);
    }
  };

  // ── Loading skeleton ────────────────────────────────────────
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
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-semibold">Aucune maison</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Créez d'abord une maison pour gérer vos stocks.
          </p>
        </div>
      </div>
    );
  }

  // ── Computed ────────────────────────────────────────────────
  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => p.currentStock <= p.minStockThreshold).length;
  const shoppingListCount = products.filter((p) => p.isOnShoppingList).length;

  const currentTabProducts =
    activeTab === 'products' ? products :
    activeTab === 'dlc' ? dlcProducts :
    stockProducts;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Section 1 - Header + Stats */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Gestion du Stock</h2>
            <p className="text-sm text-muted-foreground">
              Gérez vos produits, suivez les DLC et les stocks bas
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total products */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-400 via-orange-500 to-amber-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">Produits</p>
              <p className="text-3xl font-bold tabular-nums">{totalProducts}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Package className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>

        {/* Low stock */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-400 via-red-500 to-rose-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">Stock bas</p>
              <p className="text-3xl font-bold tabular-nums">{lowStockCount}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <AlertTriangle className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>

        {/* Shopping list */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white/80">Liste de courses</p>
              <p className="text-3xl font-bold tabular-nums">{shoppingListCount}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <ShoppingCart className="h-6 w-6" />
            </div>
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 -bottom-6 h-16 w-16 rounded-full bg-white/5" />
        </div>
      </div>

      {/* Section 2 - Tab buttons + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {([
            { key: 'products' as TabType, label: 'Produits', icon: Package },
            { key: 'dlc' as TabType, label: 'Alertes DLC', icon: Clock },
            { key: 'stock' as TabType, label: 'Stock Bas', icon: AlertTriangle },
          ]).map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={activeTab === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(key)}
              className={
                activeTab === key
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-sm'
                  : ''
              }
            >
              <Icon className="h-3.5 w-3.5 mr-1.5" />
              {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Add product dialog */}
          <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md">
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-orange-500" />
                  Nouveau produit
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="product-name">Nom *</Label>
                  <Input
                    id="product-name"
                    placeholder="Ex: Lait demi-écrémé"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Catégorie</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product-min-stock">Seuil minimum</Label>
                    <Input
                      id="product-min-stock"
                      type="number"
                      min={0}
                      value={formMinStock}
                      onChange={(e) => setFormMinStock(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-current-stock">Stock actuel</Label>
                    <Input
                      id="product-current-stock"
                      type="number"
                      min={0}
                      value={formCurrentStock}
                      onChange={(e) => setFormCurrentStock(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>
                  Annuler
                </Button>
                <Button
                  onClick={handleCreateProduct}
                  disabled={!formName.trim() || submitting}
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white"
                >
                  {submitting ? 'Enregistrement...' : 'Ajouter'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Check alerts button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckAlerts}
            disabled={checkingAlerts}
            className="gap-2"
          >
            {checkingAlerts ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            Vérifier les alertes
          </Button>
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
          {/* ── Tab: Produits ── */}
          {activeTab === 'products' && (
            <div className="space-y-3">
              {currentTabProducts.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Aucun produit enregistré</p>
                  <Button variant="link" size="sm" className="mt-2" onClick={() => setAddDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Ajouter un produit
                  </Button>
                </div>
              ) : (
                currentTabProducts.map((product) => {
                  const isExpanded = expandedProducts.has(product.id);
                  const isLowStock = product.currentStock <= product.minStockThreshold;

                  return (
                    <Card key={product.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Name + Category + Shopping badge */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm">{product.name}</h4>
                              {product.category && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 border-0 ${CATEGORY_COLORS[product.category] || CATEGORY_COLORS['Autre']}`}
                                >
                                  {product.category}
                                </Badge>
                              )}
                              {product.isOnShoppingList && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                                  <ShoppingCart className="h-2.5 w-2.5 mr-0.5" />
                                  En liste de courses
                                </Badge>
                              )}
                            </div>

                            {/* Stock info */}
                            <div className="flex items-center gap-4 mt-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Stock :</span>
                                <span className={`text-sm font-bold tabular-nums ${getStockColor(product.currentStock, product.minStockThreshold)}`}>
                                  {product.currentStock}
                                </span>
                                <span className="text-xs text-muted-foreground">/</span>
                                <span className="text-xs text-muted-foreground">min {product.minStockThreshold}</span>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Stock +/- buttons */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleUpdateStock(product.id, -1, product.currentStock)}
                              disabled={product.currentStock <= 0}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleUpdateStock(product.id, 1, product.currentStock)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>

                            {/* Expand / Collapse instances */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleExpand(product.id)}
                              title={isExpanded ? 'Masquer les instances' : 'Voir les instances'}
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>

                            {/* Delete */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteProduct(product.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded instances sub-list */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-medium text-muted-foreground">
                                Instances ({product.productInstances.length})
                              </p>
                              {/* Add instance dialog */}
                              <Dialog
                                open={instanceDialogProduct?.id === product.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    setInstanceDialogProduct(product);
                                    setInstPurchaseDate('');
                                    setInstExpiryDate('');
                                  } else {
                                    setInstanceDialogProduct(null);
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                    <Plus className="h-3 w-3" />
                                    Ajouter instance
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[400px]">
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                      <Package className="h-5 w-5 text-orange-500" />
                                      Nouvelle instance — {product.name}
                                    </DialogTitle>
                                  </DialogHeader>

                                  <div className="space-y-4 py-2">
                                    <div className="space-y-2">
                                      <Label htmlFor="inst-purchase-date">Date d'achat</Label>
                                      <Input
                                        id="inst-purchase-date"
                                        type="date"
                                        value={instPurchaseDate}
                                        onChange={(e) => setInstPurchaseDate(e.target.value)}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="inst-expiry-date">Date de péremption (DLC)</Label>
                                      <Input
                                        id="inst-expiry-date"
                                        type="date"
                                        value={instExpiryDate}
                                        onChange={(e) => setInstExpiryDate(e.target.value)}
                                      />
                                    </div>
                                  </div>

                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setInstanceDialogProduct(null)}>
                                      Annuler
                                    </Button>
                                    <Button
                                      onClick={handleAddInstance}
                                      disabled={instanceSubmitting}
                                      className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white"
                                    >
                                      {instanceSubmitting ? 'Ajout...' : 'Ajouter'}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>

                            {product.productInstances.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-3">
                                Aucune instance enregistrée
                              </p>
                            ) : (
                              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {product.productInstances.map((inst) => {
                                  const statusCfg = STATUS_CONFIG[inst.status] || STATUS_CONFIG.fresh;
                                  const daysLeft = getDaysUntilExpiry(inst.expiryDate);

                                  return (
                                    <div
                                      key={inst.id}
                                      className="rounded-lg border p-3 bg-muted/30"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex-1 min-w-0 space-y-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <Badge className={`text-[10px] px-1.5 py-0 ${statusCfg.className}`}>
                                              {statusCfg.label}
                                            </Badge>
                                            {inst.status === 'fresh' && daysLeft !== null && daysLeft <= 3 && daysLeft >= 0 && (
                                              <Badge className={`text-[10px] px-1.5 py-0 ${getDlcColor(daysLeft)}`}>
                                                <Clock className="h-2.5 w-2.5 mr-0.5" />
                                                J-{daysLeft}
                                              </Badge>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            {inst.purchaseDate && (
                                              <span>Achat : {new Date(inst.purchaseDate).toLocaleDateString('fr-FR')}</span>
                                            )}
                                            {inst.expiryDate && (
                                              <span>DLC : {new Date(inst.expiryDate).toLocaleDateString('fr-FR')}</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* ── Tab: Alertes DLC ── */}
          {activeTab === 'dlc' && (
            <div className="space-y-3">
              {currentTabProducts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-emerald-300" />
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    Aucune alerte DLC
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tous vos produits sont frais !
                  </p>
                </div>
              ) : (
                currentTabProducts.map((product) => {
                  const freshExpiring = getFreshInstances(product);

                  return (
                    <Card key={product.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30 shrink-0">
                            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm">{product.name}</h4>
                            {product.category && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 mt-1 border-0 ${CATEGORY_COLORS[product.category] || CATEGORY_COLORS['Autre']}`}
                              >
                                {product.category}
                              </Badge>
                            )}

                            {/* Expiring instances list */}
                            <div className="mt-3 space-y-2">
                              {freshExpiring.map((inst) => {
                                const daysLeft = getDaysUntilExpiry(inst.expiryDate);
                                if (daysLeft === null || daysLeft < 0 || daysLeft > 3) return null;

                                return (
                                  <div
                                    key={inst.id}
                                    className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/30"
                                  >
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      <span>DLC : {new Date(inst.expiryDate!).toLocaleDateString('fr-FR')}</span>
                                    </div>
                                    <Badge className={`text-[10px] px-2 py-0 ${getDlcColor(daysLeft)}`}>
                                      J-{daysLeft}
                                    </Badge>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* ── Tab: Stock Bas ── */}
          {activeTab === 'stock' && (
            <div className="space-y-3">
              {currentTabProducts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 text-emerald-300" />
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    Tous les stocks sont suffisants
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aucun produit en dessous de son seuil minimum
                  </p>
                </div>
              ) : (
                currentTabProducts.map((product) => {
                  const stockPercent = product.minStockThreshold > 0
                    ? Math.min(100, (product.currentStock / product.minStockThreshold) * 100)
                    : (product.currentStock > 0 ? 100 : 0);

                  return (
                    <Card key={product.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-sm">{product.name}</h4>
                              {product.category && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 border-0 ${CATEGORY_COLORS[product.category] || CATEGORY_COLORS['Autre']}`}
                                >
                                  {product.category}
                                </Badge>
                              )}
                              {product.isOnShoppingList && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                                  <ShoppingCart className="h-2.5 w-2.5 mr-0.5" />
                                  Ajouté à la liste de courses
                                </Badge>
                              )}
                            </div>

                            {/* Stock bar */}
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-muted-foreground">Stock actuel</span>
                                <span className={`font-bold tabular-nums ${getStockColor(product.currentStock, product.minStockThreshold)}`}>
                                  {product.currentStock} / {product.minStockThreshold}
                                </span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${getStockProgressColor(product.currentStock, product.minStockThreshold)}`}
                                  style={{ width: `${stockPercent}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Quick restock buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleUpdateStock(product.id, -1, product.currentStock)}
                              disabled={product.currentStock <= 0}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleUpdateStock(product.id, 1, product.currentStock)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

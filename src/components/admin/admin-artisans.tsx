'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Star,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { CATEGORIES } from '@/types/database';

// ── Types ──────────────────────────────────────────────────────
interface ServiceData {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  priceUnit: string;
  durationMinutes: number | null;
  isUrgent: boolean;
  isActive: boolean;
}

interface ProfessionalData {
  id: string;
  userId: string;
  businessName: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  location: string | null;
  serviceRadiusKm: number;
  hourlyRate: number | null;
  isUrgentAvailable: boolean;
  isVerified: boolean;
  ratingAvg: number;
  totalReviews: number;
  responseTimeMinutes: number | null;
  totalJobsCompleted: number;
  isActive: boolean;
  services: ServiceData[];
}

interface FormFields {
  businessName: string;
  category: string;
  subcategory: string;
  description: string;
  location: string;
  serviceRadiusKm: number;
  hourlyRate: string;
  isUrgentAvailable: boolean;
  isVerified: boolean;
}

const EMPTY_FORM: FormFields = {
  businessName: '',
  category: '',
  subcategory: '',
  description: '',
  location: '',
  serviceRadiusKm: 30,
  hourlyRate: '',
  isUrgentAvailable: false,
  isVerified: false,
};

// ── Helpers ────────────────────────────────────────────────────
function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'fill-muted text-muted-foreground/30'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">({rating.toFixed(1)})</span>
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────
export function AdminArtisans() {
  // Data state
  const [professionals, setProfessionals] = useState<ProfessionalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<boolean | null>(null);

  // Create / Edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPro, setDetailPro] = useState<ProfessionalData | null>(null);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toggle loading states
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingField, setTogglingField] = useState<'isActive' | 'isVerified' | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────
  const fetchProfessionals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (verifiedFilter !== null) params.set('isVerified', String(verifiedFilter));

      const res = await fetch(`/api/client/professionals?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur lors du chargement des professionnels');
      const data = await res.json();
      setProfessionals(Array.isArray(data) ? data : data.professionals ?? data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, verifiedFilter]);

  useEffect(() => {
    fetchProfessionals();
  }, [fetchProfessionals]);

  // ── Stats ─────────────────────────────────────────────────────
  const totalPros = professionals.length;
  const verifiedCount = professionals.filter((p) => p.isVerified).length;
  const activeCount = professionals.filter((p) => p.isActive).length;

  // ── Form helpers ──────────────────────────────────────────────
  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (pro: ProfessionalData) => {
    setEditingId(pro.id);
    setForm({
      businessName: pro.businessName,
      category: pro.category,
      subcategory: pro.subcategory ?? '',
      description: pro.description ?? '',
      location: pro.location ?? '',
      serviceRadiusKm: pro.serviceRadiusKm,
      hourlyRate: pro.hourlyRate != null ? String(pro.hourlyRate) : '',
      isUrgentAvailable: pro.isUrgentAvailable,
      isVerified: pro.isVerified,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.businessName.trim() || !form.category) {
      setFormError('Le nom de l\'entreprise et la catégorie sont requis');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);

      const payload = {
        businessName: form.businessName.trim(),
        category: form.category,
        subcategory: form.subcategory.trim() || null,
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        serviceRadiusKm: form.serviceRadiusKm,
        hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
        isUrgentAvailable: form.isUrgentAvailable,
        isVerified: form.isVerified,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/client/professionals/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/client/professionals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Erreur lors de l\'enregistrement');
        return;
      }

      setFormOpen(false);
      fetchProfessionals();
    } catch {
      setFormError('Erreur réseau, veuillez réessayer');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Toggle handler ────────────────────────────────────────────
  const handleToggle = async (id: string, field: 'isActive' | 'isVerified', currentValue: boolean) => {
    setTogglingId(id);
    setTogglingField(field);
    try {
      const res = await fetch(`/api/client/professionals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: !currentValue }),
      });
      if (!res.ok) throw new Error();
      fetchProfessionals();
    } catch {
      // silent fail — will revert visually on next fetch
    } finally {
      setTogglingId(null);
      setTogglingField(null);
    }
  };

  // ── Delete handler ────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setDeleteLoading(true);
      const res = await fetch(`/api/client/professionals/${deleteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error();
      setDeleteOpen(false);
      setDeleteId(null);
      fetchProfessionals();
    } catch {
      // silent
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Professionnels</CardTitle>
            <CardDescription>
              Gestion complète des artisans et professionnels de la plateforme
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreateForm}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un professionnel
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Stats Bar ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <Users className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalPros}</p>
              <p className="text-xs text-muted-foreground">Total professionnels</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{verifiedCount}</p>
              <p className="text-xs text-muted-foreground">Vérifiés</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Actifs</p>
            </div>
          </div>
        </div>

        {/* ── Filters ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou lieu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label htmlFor="verified-filter" className="text-sm whitespace-nowrap">
              Vérifiés uniquement
            </Label>
            <Switch
              id="verified-filter"
              checked={verifiedFilter === true}
              onCheckedChange={(checked) => setVerifiedFilter(checked ? true : null)}
            />
          </div>
        </div>

        {/* ── Loading ───────────────────────────────────────────── */}
        {loading && <TableSkeleton />}

        {/* ── Error ─────────────────────────────────────────────── */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchProfessionals}>
              Réessayer
            </Button>
          </div>
        )}

        {/* ── Empty ─────────────────────────────────────────────── */}
        {!loading && !error && professionals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">Aucun professionnel</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Aucun professionnel ne correspond à vos filtres.
            </p>
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────── */}
        {!loading && !error && professionals.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="hidden md:table-cell">Lieu</TableHead>
                  <TableHead className="text-right">Taux horaire</TableHead>
                  <TableHead className="hidden sm:table-cell">Note</TableHead>
                  <TableHead className="text-center">Vérifié</TableHead>
                  <TableHead className="text-center">Actif</TableHead>
                  <TableHead className="hidden lg:table-cell text-center">Travaux</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {professionals.map((pro) => (
                  <TableRow key={pro.id}>
                    <TableCell className="font-medium">{pro.businessName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {pro.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {pro.location || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {pro.hourlyRate != null ? `${pro.hourlyRate}€` : '—'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Stars rating={pro.ratingAvg} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={pro.isVerified}
                        disabled={togglingId === pro.id && togglingField === 'isVerified'}
                        onCheckedChange={() => handleToggle(pro.id, 'isVerified', pro.isVerified)}
                    />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={pro.isActive}
                        disabled={togglingId === pro.id && togglingField === 'isActive'}
                        onCheckedChange={() => handleToggle(pro.id, 'isActive', pro.isActive)}
                    />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-center">
                      {pro.totalJobsCompleted}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setDetailPro(pro);
                            setDetailOpen(true);
                          }}
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditForm(pro)}
                          title="Modifier"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeleteId(pro.id);
                            setDeleteOpen(true);
                          }}
                          title="Désactiver"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* ── Create / Edit Dialog ────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(open) => {
        setFormOpen(open);
        if (!open) {
          setFormError(null);
          setEditingId(null);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Modifier le professionnel' : 'Nouveau professionnel'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Modifiez les informations du professionnel'
                : 'Ajoutez un nouveau professionnel à la plateforme'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="form-businessName">Nom de l\'entreprise *</Label>
              <Input
                id="form-businessName"
                placeholder="Martin Plomberie"
                value={form.businessName}
                onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="form-category">Catégorie *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="form-subcategory">Sous-catégorie</Label>
                <Input
                  id="form-subcategory"
                  placeholder="Débouchage"
                  value={form.subcategory}
                  onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="form-description">Description</Label>
              <Textarea
                id="form-description"
                placeholder="Description des services proposés..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="form-location">Localisation</Label>
                <Input
                  id="form-location"
                  placeholder="Paris 11e"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="form-radius">Rayon (km)</Label>
                <Input
                  id="form-radius"
                  type="number"
                  min={1}
                  value={form.serviceRadiusKm}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      serviceRadiusKm: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="form-rate">Taux horaire (€)</Label>
                <Input
                  id="form-rate"
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="45"
                  value={form.hourlyRate}
                  onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Label htmlFor="form-urgent" className="cursor-pointer text-sm">
                  Disponible pour les urgences
                </Label>
              </div>
              <Switch
                id="form-urgent"
                checked={form.isUrgentAvailable}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isUrgentAvailable: checked }))
                }
              />
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Label htmlFor="form-verified" className="cursor-pointer text-sm">
                  Professionnel vérifié
                </Label>
              </div>
              <Switch
                id="form-verified"
                checked={form.isVerified}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isVerified: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={formLoading}>
              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ───────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detailPro && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-xl">{detailPro.businessName}</DialogTitle>
                  {detailPro.isVerified && (
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 border-0">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      Vérifié
                    </Badge>
                  )}
                  {detailPro.isActive ? (
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0">
                      Actif
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0">
                      Inactif
                    </Badge>
                  )}
                </div>
                <DialogDescription>{detailPro.category}{detailPro.subcategory ? ` — ${detailPro.subcategory}` : ''}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 py-2">
                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Localisation</p>
                    <p className="text-sm font-medium">{detailPro.location || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Rayon de service</p>
                    <p className="text-sm font-medium">{detailPro.serviceRadiusKm} km</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Taux horaire</p>
                    <p className="text-sm font-medium">{detailPro.hourlyRate != null ? `${detailPro.hourlyRate}€/h` : '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Note moyenne</p>
                    <div>
                      <Stars rating={detailPro.ratingAvg} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Avis</p>
                    <p className="text-sm font-medium">{detailPro.totalReviews}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Travaux réalisés</p>
                    <p className="text-sm font-medium">{detailPro.totalJobsCompleted}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Temps de réponse</p>
                    <p className="text-sm font-medium">
                      {detailPro.responseTimeMinutes != null
                        ? `${detailPro.responseTimeMinutes} min`
                        : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Urgences</p>
                    <p className="text-sm font-medium">
                      {detailPro.isUrgentAvailable ? '✓ Disponible' : '✗ Non disponible'}
                    </p>
                  </div>
                </div>

                {/* Description */}
                {detailPro.description && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Description</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {detailPro.description}
                    </p>
                  </div>
                )}

                {/* Services list */}
                {detailPro.services && detailPro.services.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Services ({detailPro.services.length})</p>
                    <div className="max-h-48 overflow-y-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Service</th>
                            <th className="px-3 py-2 text-right font-medium">Prix</th>
                            <th className="hidden sm:table-cell px-3 py-2 text-right font-medium">Durée</th>
                            <th className="px-3 py-2 text-center font-medium">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {detailPro.services.map((svc) => (
                            <tr key={svc.id}>
                              <td className="px-3 py-2">
                                <span className="font-medium">{svc.name}</span>
                                {svc.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {svc.description}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                {svc.basePrice}€
                                <span className="text-xs text-muted-foreground">
                                  {svc.priceUnit === 'hour'
                                    ? '/h'
                                    : svc.priceUnit === 'flat_rate'
                                      ? ' forfait'
                                      : ' estimé'}
                                </span>
                              </td>
                              <td className="hidden sm:table-cell px-3 py-2 text-right text-muted-foreground">
                                {svc.durationMinutes != null ? `${svc.durationMinutes} min` : '—'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {svc.isActive ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0 text-xs">
                                      Actif
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs">
                                      Inactif
                                    </Badge>
                                  )}
                                  {svc.isUrgent && (
                                    <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-0 text-xs">
                                      Urgent
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ───────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce professionnel ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce professionnel sera marqué comme inactif. Il n\'apparaîtra plus dans les
              résultats de recherche des clients. Cette action est réversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

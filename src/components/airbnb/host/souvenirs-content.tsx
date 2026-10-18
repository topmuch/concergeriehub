'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SOUVENIR_CATEGORIES, type SouvenirCategory } from '@/lib/smart-notifications';
import { cn } from '@/lib/utils';

// =============================================================
// v4.74 « BOUTIQUE DE SOUVENIRS » — CRUD CÔTÉ HÔTE
// Page /airbnb/properties/[id]/souvenirs : les produits vendus aux
// invités (SouvenirProduct), proposés dans la tuile « Boutique de
// souvenirs » du Hub Invité et mis en avant la veille de leur départ.
//   GET/POST  → /api/airbnb/properties/[id]/souvenirs
//   PATCH/DEL → /api/airbnb/properties/[id]/souvenirs/[productId]
//   Upload    → /api/airbnb/concierge/upload?propertyId=… (5 Mo max,
//               PNG/JPEG/WebP/GIF — affichage via <img>, route API).
// v5.2 « SAPHIR LUXE » — refonte design (aucune logique modifiée) :
// cartes lux-card, monogramme serif sans photo, prix en lux-num or,
// chips typographiques, dialog sombre bleuté. Seuls les produits
// ACTIFS apparaissent aux invités.
// =============================================================

const MAX_PRODUCTS = 40; // même plafond que l'API POST

// ── Types ──

interface SouvenirProductDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  category: SouvenirCategory;
  isActive: boolean;
  sort: number;
}

interface SouvenirsGetResponse {
  ok?: boolean;
  products?: SouvenirProductDto[];
  error?: string;
}

interface SouvenirMutationResponse {
  ok?: boolean;
  product?: SouvenirProductDto;
  error?: string;
}

interface PropertiesGetResponse {
  properties?: { id: string; name: string }[];
  error?: string;
}

// ── Brouillon du dialog (price en string — saisie libre, virgule ok) ──

interface ProductForm {
  name: string;
  description: string;
  price: string;
  category: SouvenirCategory;
  imageUrl: string;
}

const EMPTY_FORM: ProductForm = { name: '', description: '', price: '', category: 'food', imageUrl: '' };

// ── Méta catégories (libellé) ──

const CATEGORY_META: Record<SouvenirCategory, { label: string }> = {
  food: { label: 'Nourriture artisanale' },
  wine: { label: 'Vins & spiritueux' },
  craft: { label: 'Artisanat' },
  other: { label: 'Autres' },
};

function asCategory(value: string): SouvenirCategory {
  return (SOUVENIR_CATEGORIES as readonly string[]).includes(value) ? (value as SouvenirCategory) : 'food';
}

/** « 12.5 » → « 12,50 € » (format FR stable, sans Intl → zéro souci d'hydratation). */
function formatPrice(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

/** Saisie libre (virgule ou point) → prix valide 0–10 000 € arrondi au centime, sinon null. */
function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return null;
  return Math.round(n * 100) / 100;
}

export function SouvenirsContent({ initialPropertyId }: { initialPropertyId: string }) {
  const router = useRouter();

  // ── État global page ──
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<SouvenirProductDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Suppression (confirmation 2 clics inline) ──
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dialog création / édition ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(
    () => () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
    },
    [],
  );

  // ── Chargement des produits du bien ──
  // silent = rafraîchissement discret après une mutation (pas de skeleton).
  const fetchProducts = useCallback(async (pid: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const res = await fetch(`/api/airbnb/properties/${encodeURIComponent(pid)}/souvenirs`, {
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as SouvenirsGetResponse | null;
      if (!res.ok || !json?.ok || !json.products) {
        if (silent) {
          toast.error(json?.error || 'Impossible de rafraîchir la boutique.');
        } else {
          setError(json?.error || 'Impossible de charger la boutique de souvenirs.');
          setProducts([]);
        }
        return;
      }
      setProducts(json.products);
      setPropertyId(pid);
    } catch {
      if (silent) {
        toast.error('Connexion impossible. Réessayez.');
      } else {
        setError('Connexion impossible. Réessayez.');
        setProducts([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialPropertyId) void fetchProducts(initialPropertyId);
  }, [initialPropertyId, fetchProducts]);

  // ── Liste des biens pour le switcher (GET /api/airbnb/properties) ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/airbnb/properties', { cache: 'no-store' });
        const json = (await res.json().catch(() => null)) as PropertiesGetResponse | null;
        if (!cancelled && res.ok && json?.properties) {
          setProperties(json.properties.map((p) => ({ id: p.id, name: p.name })));
        }
      } catch {
        // silencieux : le switcher reste simplement masqué
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Le bien courant doit toujours être sélectionnable (ex : bien d'équipe
  // fraîchement ouvert en direct par URL).
  useEffect(() => {
    if (!propertyId) return;
    setProperties((prev) =>
      prev.some((p) => p.id === propertyId) ? prev : [{ id: propertyId, name: 'Bien courant' }, ...prev],
    );
  }, [propertyId]);

  const changeProperty = (pid: string) => {
    if (pid === propertyId) return;
    setDialogOpen(false);
    cancelDelete();
    router.push(`/airbnb/properties/${encodeURIComponent(pid)}/souvenirs`);
  };

  // ── Suppression en 2 clics (confirmation inline) ──
  function cancelDelete() {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    setPendingDeleteId(null);
  }

  const askDelete = (id: string) => {
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    setPendingDeleteId(id);
    deleteTimer.current = setTimeout(() => setPendingDeleteId(null), 4000);
  };

  const confirmDelete = async (product: SouvenirProductDto) => {
    if (deletingId) return;
    cancelDelete();
    setDeletingId(product.id);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(propertyId)}/souvenirs/${encodeURIComponent(product.id)}`,
        { method: 'DELETE' },
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || 'Suppression impossible.');
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      toast.success('Souvenir supprimé');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Activation / désactivation (optimiste + PATCH) ──
  const toggleActive = async (product: SouvenirProductDto, next: boolean) => {
    if (togglingId) return;
    setTogglingId(product.id);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, isActive: next } : p)));
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(propertyId)}/souvenirs/${encodeURIComponent(product.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: next }),
        },
      );
      const json = (await res.json().catch(() => null)) as SouvenirMutationResponse | null;
      const updated = json?.product;
      if (!res.ok || !json?.ok || !updated) {
        // revert
        setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, isActive: !next } : p)));
        toast.error(json?.error || 'Mise à jour impossible.');
        return;
      }
      setProducts((prev) => prev.map((p) => (p.id === product.id ? updated : p)));
      toast.success(next ? 'Souvenir visible par vos invités ✓' : 'Souvenir masqué pour vos invités');
    } catch {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, isActive: !next } : p)));
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Dialog ──
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (product: SouvenirProductDto) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description ?? '',
      price: String(product.price).replace('.', ','),
      category: asCategory(product.category),
      imageUrl: product.imageUrl ?? '',
    });
    setDialogOpen(true);
  };

  // Upload photo — même flux que guest-experience-content (input file
  // créé dynamiquement, FormData vers /api/airbnb/concierge/upload).
  const uploadImage = async (file: File) => {
    if (!propertyId) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/airbnb/concierge/upload?propertyId=${encodeURIComponent(propertyId)}`, {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      const uploadedUrl = json?.url;
      if (!res.ok || !json?.ok || !uploadedUrl) {
        toast.error(json?.error || 'Upload impossible.');
        return;
      }
      setForm((f) => ({ ...f, imageUrl: uploadedUrl }));
      toast.success('Photo ajoutée.');
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setUploadingImage(false);
    }
  };

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void uploadImage(f);
    };
    input.click();
  };

  const saveProduct = async () => {
    if (!propertyId || saving || uploadingImage) return;

    const name = form.name.trim();
    if (!name) {
      toast.error('Le nom du produit est requis.');
      return;
    }
    if (name.length > 60) {
      toast.error('60 caractères maximum pour le nom.');
      return;
    }
    const price = parsePrice(form.price);
    if (price === null) {
      toast.error('Indiquez un prix valide (0 à 10 000 €).');
      return;
    }
    const description = form.description.trim();
    if (description.length > 280) {
      toast.error('280 caractères maximum pour la description.');
      return;
    }
    const imageUrl = form.imageUrl.trim();
    if (imageUrl.length > 500) {
      toast.error('URL de l’image trop longue.');
      return;
    }

    setSaving(true);
    try {
      const isEdit = editingId !== null;
      const url = isEdit
        ? `/api/airbnb/properties/${encodeURIComponent(propertyId)}/souvenirs/${encodeURIComponent(editingId)}`
        : `/api/airbnb/properties/${encodeURIComponent(propertyId)}/souvenirs`;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          price,
          imageUrl: imageUrl || null,
          category: form.category,
        }),
      });
      const json = (await res.json().catch(() => null)) as SouvenirMutationResponse | null;
      if (!res.ok || !json?.ok || !json.product) {
        toast.error(json?.error || (isEdit ? 'Mise à jour impossible.' : 'Ajout impossible.'));
        return;
      }
      toast.success(isEdit ? 'Souvenir mis à jour ✓' : 'Souvenir ajouté ✓');
      setDialogOpen(false);
      setForm({ ...EMPTY_FORM });
      setEditingId(null);
      void fetchProducts(propertyId, true);
    } catch {
      toast.error('Connexion impossible. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  // ── Dérivés ──
  const total = products.length;
  const activeCount = products.filter((p) => p.isActive).length;
  const atCapacity = total >= MAX_PRODUCTS;
  const currentProperty = properties.find((p) => p.id === propertyId) ?? null;

  // ── Skeleton (chargement initial) ──
  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8" aria-busy="true" aria-label="Chargement de la boutique de souvenirs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-8 w-72 rounded-full bg-white/8" aria-hidden="true" />
            <Skeleton className="mt-2 h-4 w-full max-w-xl rounded-full bg-white/8" aria-hidden="true" />
          </div>
          <Skeleton className="h-9 w-56 rounded-full bg-white/8" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl bg-white/8" aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-8">
      {/* ----- En-tête + switch propriété + CTA ----- */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="min-w-0">
          <p className="lux-eyebrow">Espace hôte</p>
          <h1 className="lux-display mt-1.5 flex flex-wrap items-center gap-3 text-2xl font-semibold text-white">
            Boutique de souvenirs
            {!error && (
              <span
                className="lux-chip"
                aria-label={`${total} souvenir${total > 1 ? 's' : ''} au total, ${activeCount} actif${activeCount > 1 ? 's' : ''}`}
              >
                <span className="lux-dot" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
                {total} souvenir{total > 1 ? 's' : ''} · {activeCount} actif{activeCount > 1 ? 's' : ''}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-[#8fa0c2]">
            Vendez vos produits locaux (confitures, vins, artisanat) à vos invités — proposés dans leur hub et mis
            en avant la veille de leur départ. Seuls les produits <strong className="font-semibold text-white">actifs</strong>{' '}
            sont visibles par vos invités.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {properties.length > 0 && (
            <Select value={propertyId} onValueChange={changeProperty}>
              <SelectTrigger
                className="w-full rounded-full border-white/12 bg-white/[0.04] text-white sm:w-56"
                aria-label="Choisir le bien"
              >
                <SelectValue placeholder="Choisir un bien" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="focus:bg-white/8 focus:text-white">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            type="button"
            onClick={openCreate}
            disabled={atCapacity}
            title={atCapacity ? `Maximum ${MAX_PRODUCTS} souvenirs par bien.` : 'Ajouter un souvenir'}
            className="lux-btn disabled:pointer-events-none disabled:opacity-50"
          >
            Ajouter un souvenir
          </button>
        </div>
      </motion.div>

      {/* ----- Erreur de chargement ----- */}
      {error && (
        <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl p-8 text-center" role="alert">
          <p className="lux-display text-lg font-semibold text-white">{error}</p>
          <button
            type="button"
            onClick={() => void fetchProducts(propertyId)}
            className="lux-btn-ghost"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ----- État vide ----- */}
      {!error && products.length === 0 && (
        <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
          <p className="lux-display text-lg font-semibold text-white">
            Aucun souvenir{currentProperty ? ` pour ${currentProperty.name}` : ''} pour le moment
          </p>
          <p className="max-w-md text-sm text-[#8fa0c2]">
            Confitures maison, miel, bouteilles du domaine, poteries locales… Ajoutez vos produits : vos invités les
            découvriront dans leur hub et la boutique sera mise en avant la veille de leur départ.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="lux-btn"
          >
            Ajouter un souvenir
          </button>
        </div>
      )}

      {/* ----- Grille produits ----- */}
      {!error && products.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const meta = CATEGORY_META[asCategory(product.category)];
            const pendingDelete = pendingDeleteId === product.id;
            const isDeleting = deletingId === product.id;
            return (
              <Card
                key={product.id}
                className={cn(
                  'lux-card lux-card-hover gap-0 overflow-hidden rounded-2xl py-0',
                  !product.isActive && 'opacity-80',
                )}
              >
                {/* Visuel (photo ou monogramme typographique) */}
                <div className="relative h-40 w-full shrink-0 overflow-hidden border-b border-white/8 bg-white/[0.03]">
                  {product.imageUrl ? (
                    // Route API d'upload → <img> volontairement (pas next/image).
                     
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      aria-hidden="true"
                    >
                      <span className="lux-display text-5xl text-white/25">
                        {product.name.charAt(0).toUpperCase() || '·'}
                      </span>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-[#0b1226]/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur">
                    {meta.label}
                  </span>
                  {!product.isActive && (
                    <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-[#0b1226]/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60 backdrop-blur">
                      Masqué
                    </span>
                  )}
                </div>

                <CardContent className="flex flex-1 flex-col gap-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-sm font-semibold leading-snug text-white" title={product.name}>
                      {product.name}
                    </h3>
                    <span className="lux-num shrink-0 text-base font-semibold text-[#e9c47c]">
                      {formatPrice(product.price)}
                    </span>
                  </div>
                  {product.description && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-[#8fa0c2]">
                      {product.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <label className="flex cursor-pointer items-center gap-2">
                      <Switch
                        checked={product.isActive}
                        disabled={togglingId === product.id}
                        onCheckedChange={(v) => void toggleActive(product, v)}
                        aria-label={
                          product.isActive
                            ? `Masquer « ${product.name} » pour les invités`
                            : `Rendre « ${product.name} » visible par les invités`
                        }
                      />
                      <span className="text-xs font-semibold text-[#8fa0c2]">
                        {product.isActive ? 'Visible' : 'Masqué'}
                      </span>
                    </label>
                    {togglingId === product.id && (
                      <span
                        className="lux-dot animate-pulse"
                        style={{ backgroundColor: '#8fa0c2' }}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2 border-t border-white/8 pt-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 rounded-full border-white/12 bg-transparent text-xs font-semibold text-[#a9c4ff] hover:bg-white/[0.06] hover:text-white"
                      onClick={() => openEdit(product)}
                      aria-label={`Modifier « ${product.name} »`}
                    >
                      Modifier
                    </Button>
                    {pendingDelete ? (
                      <div className="flex flex-1 items-center gap-1.5">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 flex-1 rounded-full border border-[#f07d6a]/35 bg-[#f07d6a]/10 text-xs font-bold text-[#f07d6a] hover:bg-[#f07d6a]/20 hover:text-[#ffab92]"
                          onClick={() => void confirmDelete(product)}
                          disabled={isDeleting}
                          aria-label={`Confirmer la suppression de « ${product.name} »`}
                        >
                          {isDeleting && (
                            <span
                              className="lux-dot animate-pulse"
                              style={{ backgroundColor: '#f07d6a' }}
                              aria-hidden="true"
                            />
                          )}
                          Confirmer ?
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full px-2.5 text-xs text-[#8fa0c2] hover:bg-white/8 hover:text-white"
                          onClick={cancelDelete}
                          aria-label="Annuler la suppression"
                        >
                          <span aria-hidden="true">✕</span>
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 flex-1 rounded-full text-xs font-semibold text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                        onClick={() => askDelete(product.id)}
                        aria-label={`Supprimer « ${product.name} »`}
                      >
                        Supprimer
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ----- Dialog création / édition ----- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditingId(null);
            setForm({ ...EMPTY_FORM });
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto border-white/10 bg-[#0b1226] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="lux-display text-xl font-semibold text-white">
              {editingId ? 'Modifier le souvenir' : 'Nouveau souvenir'}
            </DialogTitle>
            <DialogDescription className="text-[#8fa0c2]">
              {editingId
                ? 'Ajustez les informations du produit — les modifications sont visibles immédiatement côté invité.'
                : 'Proposez un produit local à vos invités — il apparaîtra dans leur hub s’il est actif.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* ── Image (upload) ── */}
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                {form.imageUrl ? (
                   
                  <img
                    src={form.imageUrl}
                    alt="Aperçu de l’image du souvenir"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="lux-display text-3xl text-white/30">
                    {(form.name.trim().charAt(0) || CATEGORY_META[form.category].label.charAt(0)).toUpperCase() || '·'}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-white/12 bg-transparent text-xs font-semibold text-[#a9c4ff] hover:bg-white/[0.06] hover:text-white"
                    onClick={pickImage}
                    disabled={uploadingImage}
                  >
                    {uploadingImage && (
                      <span
                        className="lux-dot animate-pulse"
                        style={{ backgroundColor: '#a9c4ff' }}
                        aria-hidden="true"
                      />
                    )}
                    {uploadingImage ? 'Envoi…' : 'Choisir une image'}
                  </Button>
                  {form.imageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-2.5 text-xs text-[#8fa0c2] hover:bg-white/8 hover:text-white"
                      onClick={() => setForm((f) => ({ ...f, imageUrl: '' }))}
                    >
                      Retirer
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-[#8fa0c2]/70">
                  PNG, JPEG, WebP ou GIF — 5 Mo max. Sans photo, l’initiale du produit est affichée.
                </p>
              </div>
            </div>

            {/* ── Nom ── */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="souvenir-name">Nom du produit *</Label>
              <Input
                id="souvenir-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={60}
                placeholder="ex : Confiture de figues maison"
                autoComplete="off"
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
              <p className="text-[11px] text-[#8fa0c2]/70">{form.name.length}/60</p>
            </div>

            {/* ── Description ── */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="souvenir-description">Description (optionnelle)</Label>
              <Textarea
                id="souvenir-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={280}
                rows={3}
                placeholder="ex : Cuite au chaudron avec les figues du jardin, pot de 220 g."
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
              />
              <p className="text-[11px] text-[#8fa0c2]/70">{form.description.length}/280</p>
            </div>

            {/* ── Prix + catégorie ── */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="souvenir-price">Prix (€) *</Label>
                <Input
                  id="souvenir-price"
                  type="number"
                  min={0}
                  max={10000}
                  step={0.01}
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="ex : 8,50"
                  autoComplete="off"
                  className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="souvenir-category">Catégorie</Label>
                <Select
                  value={form.category}
                  onValueChange={(v: string) => setForm((f) => ({ ...f, category: asCategory(v) }))}
                >
                  <SelectTrigger id="souvenir-category" className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white" aria-label="Choisir la catégorie">
                    <SelectValue placeholder="Choisir une catégorie" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0b1226] text-white">
                    {SOUVENIR_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="focus:bg-white/8 focus:text-white">
                        {CATEGORY_META[c].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-white/12 bg-transparent text-[#8fa0c2] hover:bg-white/[0.06] hover:text-white"
              onClick={() => setDialogOpen(false)}
              disabled={saving || uploadingImage}
            >
              Annuler
            </Button>
            <button
              type="button"
              onClick={() => void saveProduct()}
              disabled={saving || uploadingImage}
              className="lux-btn disabled:pointer-events-none disabled:opacity-50"
            >
              {saving && (
                <span
                  className="lux-dot animate-pulse"
                  style={{ backgroundColor: '#a9c4ff' }}
                  aria-hidden="true"
                />
              )}
              {editingId ? 'Enregistrer' : 'Ajouter le souvenir'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

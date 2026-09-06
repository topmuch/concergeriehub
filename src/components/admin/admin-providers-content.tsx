'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Pencil, Plus, RefreshCw, Trash2, MapPin, Search } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { EmojiIcon } from '@/components/ui/emoji-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { cn } from '@/lib/utils';
import {
  PROVIDER_CATEGORY_META,
  PROVIDER_AUDIENCE_META,
  providerCategoryMeta,
  formatEur,
  type ProviderAudience,
} from '@/lib/b2b';

// =============================================================
// AdminProvidersContent — ÉTAPE 9.2 : gestion des prestataires.
// RÈGLE D'OR : seul le Superadmin ajoute / géolocalise /
// modifie les prestataires (formulaires + carte interactive).
// =============================================================

// Carte Leaflet — rendu 100 % client uniquement
const AdminProvidersMap = dynamic(() => import('./admin-providers-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full rounded-xl" />,
});

interface ProviderRow {
  id: string;
  businessName: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceRadiusKm: number;
  audience: string;
  hourlyRate: number | null;
  isUrgentAvailable: boolean;
  isVerified: boolean;
  isActive: boolean;
  portfolioImages: string;
  ratingAvg: number;
  totalReviews: number;
  totalJobsCompleted: number;
  email: string;
  userIsActive: boolean;
  serviceRequestsCount: number;
  reviewsCount: number;
  createdAt: string;
}

// ---------- État du formulaire (création + édition) ----------
interface ProviderForm {
  businessName: string;
  category: string;
  audience: ProviderAudience;
  description: string;
  location: string;
  latitude: string;
  longitude: string;
  serviceRadiusKm: string;
  hourlyRate: string;
  isUrgentAvailable: boolean;
  isVerified: boolean;
  isActive: boolean;
  email: string;
  portfolioText: string; // 1 URL par ligne
}

const EMPTY_FORM: ProviderForm = {
  businessName: '',
  category: 'menage',
  audience: 'OWNER_SERVICE',
  description: '',
  location: '',
  latitude: '',
  longitude: '',
  serviceRadiusKm: '10',
  hourlyRate: '',
  isUrgentAvailable: false,
  isVerified: false,
  isActive: true,
  email: '',
  portfolioText: '',
};

// ---------- FIX-4 : documents de vérification (convention API) ----------
type VerificationDocKind = 'KBIS' | 'ASSURANCE' | 'OTHER';
type VerificationDocStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

interface VerificationDocument {
  id: string;
  kind: VerificationDocKind;
  name: string;
  url: string;
  uploadedAt: string;
  status: VerificationDocStatus;
}

const DOC_KIND_META: Record<VerificationDocKind, { label: string; emoji: string }> = {
  KBIS: { label: 'Kbis', emoji: '🏛️' },
  ASSURANCE: { label: 'Assurance', emoji: '🛡️' },
  OTHER: { label: 'Autre', emoji: '📎' },
};

const DOC_STATUS_META: Record<VerificationDocStatus, { label: string; cls: string }> = {
  PENDING: { label: 'En attente', cls: 'bg-amber-50 border-amber-300 text-amber-800' },
  VERIFIED: { label: 'Validé', cls: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
  REJECTED: { label: 'Rejeté', cls: 'bg-red-50 border-red-200 text-red-600' },
};

/** Parse défensif côté client (l'API filtre déjà strictement). */
function parseVerificationDocuments(raw: unknown): VerificationDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is VerificationDocument =>
      typeof d === 'object' &&
      d !== null &&
      typeof (d as VerificationDocument).id === 'string' &&
      typeof (d as VerificationDocument).url === 'string' &&
      typeof (d as VerificationDocument).uploadedAt === 'string' &&
      (d as VerificationDocument).kind in DOC_KIND_META &&
      (d as VerificationDocument).status in DOC_STATUS_META,
  );
}

export function AdminProvidersContent() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ----- Formulaire -----
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // ----- Suppression -----
  const [deleteTarget, setDeleteTarget] = useState<ProviderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ----- FIX-4 : documents de vérification (fiche d'édition) -----
  const [documents, setDocuments] = useState<VerificationDocument[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/providers-admin');
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as { providers: ProviderRow[] };
      setProviders(json.providers);
    } catch {
      setError('Impossible de charger les prestataires. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ----- FIX-4 : charge les documents du prestataire ouvert dans la Sheet
  // (GET /api/admin/providers-admin/[id] — la liste n'expose pas ce JSON)
  // et resynchronise le switch « Vérifié » du formulaire avec le badge réel.
  const fetchDocuments = useCallback(async (providerId: string) => {
    setDocsLoading(true);
    try {
      const res = await fetch(`/api/admin/providers-admin/${providerId}`);
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as { documents?: unknown; isVerified?: boolean };
      setDocuments(parseVerificationDocuments(json.documents));
      if (typeof json.isVerified === 'boolean') {
        setForm((f) => ({ ...f, isVerified: json.isVerified as boolean }));
      }
    } catch {
      setDocuments(null);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  // ----- Filtres -----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (audienceFilter !== 'all' && p.audience !== audienceFilter) return false;
      if (!q) return true;
      const catLabel = providerCategoryMeta(p.category).label.toLowerCase();
      return (
        p.businessName.toLowerCase().includes(q) ||
        (p.location ?? '').toLowerCase().includes(q) ||
        catLabel.includes(q)
      );
    });
  }, [providers, search, audienceFilter]);

  const mapProviders = useMemo(
    () =>
      filtered
        .filter((p): p is ProviderRow & { latitude: number; longitude: number } =>
          p.latitude != null && p.longitude != null,
        )
        .map((p) => ({
          id: p.id,
          businessName: p.businessName,
          category: p.category,
          audience: p.audience,
          latitude: p.latitude,
          longitude: p.longitude,
          serviceRadiusKm: p.serviceRadiusKm,
          isActive: p.isActive,
        })),
    [filtered],
  );

  // ---------- Formulaire : ouverture ----------
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDocuments(null); // pas de fiche existante → pas de documents
    setDialogOpen(true);
  };

  const openEdit = (p: ProviderRow) => {
    setEditingId(p.id);
    setForm({
      businessName: p.businessName,
      category: p.category,
      audience: (p.audience as ProviderAudience) ?? 'OWNER_SERVICE',
      description: p.description ?? '',
      location: p.location ?? '',
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : '',
      serviceRadiusKm: String(p.serviceRadiusKm),
      hourlyRate: p.hourlyRate != null ? String(p.hourlyRate) : '',
      isUrgentAvailable: p.isUrgentAvailable,
      isVerified: p.isVerified,
      isActive: p.isActive,
      email: p.email,
      portfolioText: parsePortfolio(p).join('\n'),
    });
    setFormError('');
    setDialogOpen(true);
    void fetchDocuments(p.id);
  };

  // ---------- FIX-4 : review d'un document (✓ Valider / ✕ Rejeter) ----------
  const reviewDocument = async (doc: VerificationDocument, decision: 'VERIFIED' | 'REJECTED') => {
    if (!editingId) return;
    setReviewingDocId(doc.id);
    try {
      const res = await fetch(`/api/admin/providers-admin/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review-document', documentId: doc.id, decision }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur');
      toast.success(
        decision === 'VERIFIED'
          ? `${DOC_KIND_META[doc.kind].label} validé ✅`
          : `${DOC_KIND_META[doc.kind].label} rejeté`,
        { description: 'Le badge ✓ Vérifié du prestataire est recalculé automatiquement.' },
      );
      // Refetch : documents + fiche (badge) + liste (badge inline)
      await fetchDocuments(editingId);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'La review a échoué.');
    } finally {
      setReviewingDocId(null);
    }
  };

  // ---------- Formulaire : soumission ----------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.businessName.trim() || form.businessName.trim().length < 2) {
      setFormError('Le nom du prestataire est requis.');
      return;
    }
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || form.latitude === '' || form.longitude === '') {
      setFormError('Latitude et Longitude sont requises — cliquez sur la carte ou saisissez les valeurs.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        businessName: form.businessName.trim(),
        category: form.category,
        audience: form.audience,
        description: form.description.trim(),
        location: form.location.trim(),
        latitude: lat,
        longitude: lng,
        serviceRadiusKm: Number(form.serviceRadiusKm) || 10,
        hourlyRate: form.hourlyRate === '' ? null : Number(form.hourlyRate),
        isUrgentAvailable: form.isUrgentAvailable,
        isVerified: form.isVerified,
        isActive: form.isActive,
        email: form.email.trim() || undefined,
        portfolioImages: form.portfolioText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };

      const res = await fetch(
        editingId ? `/api/admin/providers-admin/${editingId}` : '/api/admin/providers-admin',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Erreur serveur');
      }

      toast.success(
        editingId ? 'Prestataire mis à jour ✅' : `${form.businessName.trim()} ajouté ✅`,
        { description: 'La carte et les listes des hôtes sont déjà à jour.' },
      );
      setDialogOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Statut actif / inactif (switch inline) ----------
  const toggleActive = async (p: ProviderRow, next: boolean) => {
    setProviders((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: next } : x)));
    try {
      const res = await fetch(`/api/admin/providers-admin/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) throw new Error('http');
      toast.success(next ? `${p.businessName} réactivé` : `${p.businessName} désactivé`);
    } catch {
      setProviders((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: !next } : x)));
      toast.error('Modification impossible. Réessayez.');
    }
  };

  // ---------- Suppression ----------
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/providers-admin/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Erreur serveur');
      }
      toast.success(`${deleteTarget.businessName} supprimé`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setDeleting(false);
    }
  };

  const draftRadius = Number(form.serviceRadiusKm) || 10;
  const draftPosition =
    form.latitude !== '' && form.longitude !== '' && Number.isFinite(Number(form.latitude))
      ? { latitude: Number(form.latitude), longitude: Number(form.longitude) }
      : null;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
      {/* ================= En-tête ================= */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Prestataires 🧹
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Le catalogue central — ajout, géolocalisation et audiences réservés au Superadmin.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-slate-900 hover:bg-slate-800 text-white font-semibold h-11"
        >
          <Plus className="h-4 w-4" /> Ajouter un prestataire
        </Button>
      </section>

      {/* ================= Carte ================= */}
      <section aria-label="Carte interactive des prestataires">
        <AdminProvidersMap
          providers={mapProviders}
          selectedId={selectedId}
          onSelect={setSelectedId}
          placingMode={dialogOpen}
          draftPosition={draftPosition}
          draftRadiusKm={draftRadius}
          onMapClick={(lat, lng) => {
            if (!dialogOpen) return;
            setForm((f) => ({
              ...f,
              latitude: lat.toFixed(6),
              longitude: lng.toFixed(6),
            }));
          }}
        />
        <p className="mt-2 text-xs text-slate-400 text-center">
          Cliquez sur un marqueur pour le sélectionner · un clic sur la carte remplit les
          coordonnées quand le formulaire est ouvert.
        </p>
      </section>

      {/* ================= Filtres ================= */}
      <section className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom, une catégorie, une ville…"
            aria-label="Rechercher un prestataire"
            className="pl-9 bg-white"
          />
        </div>
        <Select value={audienceFilter} onValueChange={setAudienceFilter}>
          <SelectTrigger aria-label="Filtrer par audience" className="w-full sm:w-[240px] bg-white font-semibold">
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">🌐 Toutes les audiences</SelectItem>
            <SelectItem value="OWNER_SERVICE">🔧 Services Propriétaire</SelectItem>
            <SelectItem value="GUEST_EXPERIENCE">🥂 Expériences Invité</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={load} className="bg-white" aria-label="Rafraîchir la liste">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Actualiser
        </Button>
      </section>

      {/* ================= Liste ================= */}
      <section aria-label="Liste des prestataires" className="pb-6">
        {loading && providers.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <B2BCard className="text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <Button onClick={load} className="mt-3 bg-slate-900 hover:bg-slate-800 text-white">
              <RefreshCw className="h-4 w-4" /> Réessayer
            </Button>
          </B2BCard>
        ) : filtered.length === 0 ? (
          <B2BCard className="text-center">
            <p className="text-3xl" aria-hidden="true">🔍</p>
            <p className="mt-2 font-semibold text-slate-900">Aucun prestataire trouvé</p>
            <p className="text-sm text-slate-600 mt-1">
              Modifiez la recherche ou ajoutez un nouveau prestataire.
            </p>
          </B2BCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((p) => {
              const meta = providerCategoryMeta(p.category);
              const audienceMeta = PROVIDER_AUDIENCE_META[p.audience as ProviderAudience];
              const selected = p.id === selectedId;
              return (
                <B2BCard
                  key={p.id}
                  hover
                  className={cn(
                    'cursor-pointer transition-colors',
                    selected && 'ring-2 ring-slate-900 ring-offset-2',
                    !p.isActive && 'opacity-75',
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Sélectionner ${p.businessName} sur la carte`}
                    onClick={() => setSelectedId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedId(p.id);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <EmojiIcon emoji={meta.emoji} size="md" variant="accent" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900">{p.businessName}</h3>
                          {!p.isActive && (
                            <Badge variant="outline" className="bg-red-50 border-red-200 text-red-600 font-semibold">
                              ⛔ Inactif
                            </Badge>
                          )}
                          {p.isVerified && (
                            <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold">
                              ✓ Vérifié
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {meta.label}
                          {p.location ? ` · ${p.location}` : ''}
                          {p.audience && audienceMeta ? ` · ${audienceMeta.emoji} ${audienceMeta.label}` : ''}
                        </p>
                        {p.description && (
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                            {p.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {p.latitude?.toFixed(3)}, {p.longitude?.toFixed(3)} · rayon {p.serviceRadiusKm} km
                          </span>
                          {p.hourlyRate != null && <span>· {formatEur(p.hourlyRate)}/h</span>}
                          {p.isUrgentAvailable && <span>· ⚡ urgences</span>}
                          <span>· ⭐ {p.ratingAvg.toFixed(1).replace('.', ',')} ({p.totalReviews})</span>
                          <span>· {p.totalJobsCompleted} missions</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer" aria-label={`Statut actif de ${p.businessName}`}>
                      <Switch
                        checked={p.isActive}
                        onCheckedChange={(v) => toggleActive(p, v)}
                        aria-label={`${p.businessName} actif`}
                      />
                      <span className="text-xs font-semibold text-slate-600">
                        {p.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(p)}
                        className="h-8 text-xs bg-white"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(p)}
                        aria-label={`Supprimer ${p.businessName}`}
                        className="h-8 text-xs bg-white text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </B2BCard>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= Sheet création / édition (non-modal → carte cliquable) ================= */}
      <Sheet open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)} modal={false}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto bg-white"
          aria-describedby="provider-form-desc"
          // Le clic sur la carte (hors Sheet) ne doit pas fermer le formulaire :
          // on bloque la fermeture "extérieure" — Annuler / X / Échap restent actifs.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {editingId ? '✏️ Modifier le prestataire' : '➕ Nouveau prestataire'}
            </SheetTitle>
            <SheetDescription id="provider-form-desc" className="text-sm text-slate-600">
              {editingId
                ? 'Ajustez la fiche : géolocalisation, rayon, audience ou statut.'
                : 'Règle d’or : seul le Superadmin crée et géolocalise les prestataires. La carte reste cliquable à gauche.'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* ----- Identité ----- */}
            <fieldset className="space-y-3">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Identité</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-name">Nom de l&apos;entreprise *</Label>
                  <Input
                    id="pf-name"
                    value={form.businessName}
                    onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                    placeholder="CleanSuite Paris"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-category">Catégorie *</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger id="pf-category" aria-label="Catégorie du prestataire">
                      <SelectValue placeholder="Choisir une catégorie" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {Object.entries(PROVIDER_CATEGORY_META).map(([key, meta]) => (
                        <SelectItem key={key} value={key}>
                          {meta.emoji} {meta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pf-description">Description</Label>
                <Textarea
                  id="pf-description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Prestation proposée, zone couverte, points forts…"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-location">Adresse / ville affichée</Label>
                  <Input
                    id="pf-location"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Montmartre, Paris 18e"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-email">Email de contact (optionnel)</Label>
                  <Input
                    id="pf-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="auto-généré si vide"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pf-photos">Photos (URLs — une par ligne)</Label>
                <Textarea
                  id="pf-photos"
                  value={form.portfolioText}
                  onChange={(e) => setForm((f) => ({ ...f, portfolioText: e.target.value }))}
                  placeholder={'https://exemple.fr/photo1.jpg\nhttps://exemple.fr/photo2.jpg'}
                  rows={2}
                />
                <p className="text-[11px] text-slate-400">6 URLs max — affichées dans la fiche prestataire.</p>
              </div>
            </fieldset>

            {/* ----- Audience (2 choix stricts) ----- */}
            <fieldset className="space-y-3">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Audience — où ce prestataire apparaît-il ?
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  ['OWNER_SERVICE', 'GUEST_EXPERIENCE'] as const
                ).map((aud) => {
                  const meta = PROVIDER_AUDIENCE_META[aud];
                  const active = form.audience === aud;
                  return (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, audience: aud }))}
                      aria-pressed={active}
                      className={cn(
                        'text-left border rounded-xl p-3.5 transition-all',
                        active
                          ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <p className="text-sm font-bold">
                        {meta.emoji} {meta.label}
                      </p>
                      <p className={cn('text-xs mt-1 leading-relaxed', active ? 'text-slate-300' : 'text-slate-500')}>
                        {meta.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* ----- Géolocalisation ----- */}
            <fieldset className="space-y-3">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Géolocalisation — cliquez sur la carte en arrière-plan
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-lat">Latitude *</Label>
                  <Input
                    id="pf-lat"
                    inputMode="decimal"
                    value={form.latitude}
                    onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                    placeholder="48.886700"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-lng">Longitude *</Label>
                  <Input
                    id="pf-lng"
                    inputMode="decimal"
                    value={form.longitude}
                    onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                    placeholder="2.343100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-radius">Rayon d&apos;action (km)</Label>
                  <Input
                    id="pf-radius"
                    inputMode="numeric"
                    value={form.serviceRadiusKm}
                    onChange={(e) => setForm((f) => ({ ...f, serviceRadiusKm: e.target.value }))}
                    placeholder="10"
                  />
                </div>
              </div>
            </fieldset>

            {/* ----- Conditions ----- */}
            <fieldset className="space-y-3">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Conditions & statut
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-rate">Tarif horaire (€, optionnel)</Label>
                  <Input
                    id="pf-rate"
                    inputMode="decimal"
                    value={form.hourlyRate}
                    onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
                    placeholder="28"
                  />
                </div>
                <div className="flex flex-col justify-center gap-2.5">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm font-semibold text-slate-700">⚡ Disponible en urgence</span>
                    <Switch
                      checked={form.isUrgentAvailable}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, isUrgentAvailable: v }))}
                      aria-label="Disponible en urgence"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm font-semibold text-slate-700">✓ Prestataire vérifié</span>
                    <Switch
                      checked={form.isVerified}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, isVerified: v }))}
                      aria-label="Prestataire vérifié"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm font-semibold text-slate-700">🟢 Actif</span>
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                      aria-label="Prestataire actif"
                    />
                  </label>
                </div>
              </div>
            </fieldset>

            {/* ----- FIX-4 : Documents de vérification (fiche existante uniquement) ----- */}
            {editingId ? (
              <section
                aria-label="Documents de vérification"
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    📄 Documents de vérification
                  </h3>
                  {documents && documents.length > 0 && (
                    <span className="text-[11px] text-slate-400">
                      {documents.length}/5
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Uploadés par le prestataire depuis son portail. Validez ou rejetez chaque
                  document — le badge ✓ Vérifié est recalculé automatiquement.
                </p>

                {docsLoading && !documents ? (
                  <div className="space-y-2" aria-busy="true">
                    <Skeleton className="h-12 rounded-lg" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                ) : !documents || documents.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
                    Aucun document fourni
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {documents.map((doc) => {
                      const kindMeta = DOC_KIND_META[doc.kind];
                      const statusMeta = DOC_STATUS_META[doc.status];
                      const busy = reviewingDocId === doc.id;
                      return (
                        <li
                          key={doc.id}
                          className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                                <span aria-hidden="true">{kindMeta.emoji}</span> {kindMeta.label}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-full">
                                {doc.name} · {formatFrDate(doc.uploadedAt)}
                              </p>
                            </div>
                            <Badge variant="outline" className={`${statusMeta.cls} border font-semibold shrink-0`}>
                              {statusMeta.label}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900"
                            >
                              Voir le document ↗
                            </a>
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                disabled={busy || doc.status === 'VERIFIED'}
                                onClick={() => reviewDocument(doc, 'VERIFIED')}
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                ✓ Valider
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy || doc.status === 'REJECTED'}
                                onClick={() => reviewDocument(doc, 'REJECTED')}
                                className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 bg-white"
                              >
                                ✕ Rejeter
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : (
              <p className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                💡 Les documents de vérification (Kbis, assurance…) sont envoyés par le
                prestataire depuis son portail, puis validés ici — d&apos;abord créez la fiche.
              </p>
            )}

            {formError && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="bg-white">
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold min-w-40"
              >
                {saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Créer le prestataire'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ================= Confirmation suppression ================= */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">
              Supprimer « {deleteTarget?.businessName} » ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              Le prestataire et son compte technique seront définitivement supprimés
              (les demandes de service associées aussi). Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? 'Suppression…' : 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** portfolio_images est stocké en JSON string en SQLite. */
function parsePortfolio(p: ProviderRow): string[] {
  try {
    const arr = JSON.parse(p.portfolioImages ?? '[]') as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((u): u is string => typeof u === 'string');
  } catch {
    return [];
  }
}

/** Date courte FR pour l'affichage des documents (ex. « 12 févr. 2025 »). */
function formatFrDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

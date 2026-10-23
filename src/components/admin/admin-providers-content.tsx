'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
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
import {
  // FIX-11 — convention documents FIX-4 + statut quadri-état dérivé
  // (En attente / En revue / Rejeté / Vérifié) partagée API + UI.
  DOC_KIND_META,
  DOC_STATUS_META,
  PROVIDER_REVIEW_STATUS_META,
  deriveProviderReviewStatus,
  parseVerificationDocuments,
  type ProviderReviewStatus,
  type VerificationDocument,
} from '@/lib/provider-verification';

// =============================================================
// AdminProvidersContent — ÉTAPE 9.2 : gestion des prestataires.
// RÈGLE D'OR : seul le Superadmin ajoute / géolocalise /
// modifie les prestataires (formulaires + carte interactive).
// =============================================================

// Carte Leaflet — rendu 100 % client uniquement
const AdminProvidersMap = dynamic(() => import('./admin-providers-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full rounded-xl bg-white/8" />,
});

// ---------- Design « Saphir Luxe » : champ de formulaire (portails & surfaces sombres) ----------
const LUX_FIELD =
  'rounded-xl! border-white/12! bg-white/[0.04]! text-white! placeholder:text-[#8fabc2]/60! focus-visible:ring-[#5cadf0]/50!';
const LUX_SELECT_TRIGGER =
  'rounded-xl! border-white/12! bg-white/[0.04]! text-white! font-semibold focus-visible:ring-[#5cadf0]/50!';
const LUX_SELECT_CONTENT = 'border-white/10! bg-[#0b1226]! text-white!';
const LUX_SELECT_ITEM = 'focus:bg-white/8! focus:text-white!';

// Pastilles de statut (design) — données PROVIDER_REVIEW_STATUS_META / DOC_STATUS_META inchangées.
const REVIEW_STATUS_DOT: Record<ProviderReviewStatus, string> = {
  PENDING: '#8fabc2',
  IN_REVIEW: '#fbbf24',
  REJECTED: '#f07d6a',
  VERIFIED: '#34d399',
};

const DOC_STATUS_DOT: Record<string, string> = {
  PENDING: '#fbbf24',
  VERIFIED: '#34d399',
  REJECTED: '#f07d6a',
};

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
  // FIX-11 — JSON FIX-4 déjà parsé par l'API de liste (lecture seule)
  verificationDocuments: VerificationDocument[];
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

// ---------- FIX-4/FIX-11 : documents de vérification ----------
// Types + parse défensif + méta déplacés dans src/lib/provider-verification.ts
// (partagés avec l'API de liste et la dérivation du statut quadri-état).

export function AdminProvidersContent() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<string>('all');
  // FIX-11 — filtre par statut de vérification (quadri-état dérivé)
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProviderReviewStatus>('ALL');
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
  // FIX-11 — statut dérivé par prestataire (données DB réelles :
  // isVerified + verificationDocuments), compteur par état.
  const reviewStatuses = useMemo(() => {
    const map = new Map<string, ProviderReviewStatus>();
    for (const p of providers) {
      map.set(
        p.id,
        deriveProviderReviewStatus(p.isVerified, parseVerificationDocuments(p.verificationDocuments)),
      );
    }
    return map;
  }, [providers]);

  const statusCounts = useMemo(() => {
    const counts: Record<ProviderReviewStatus, number> = {
      PENDING: 0,
      IN_REVIEW: 0,
      REJECTED: 0,
      VERIFIED: 0,
    };
    for (const st of reviewStatuses.values()) counts[st] += 1;
    return counts;
  }, [reviewStatuses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (audienceFilter !== 'all' && p.audience !== audienceFilter) return false;
      // FIX-11 — filtre par statut dérivé (quadri-état)
      if (statusFilter !== 'ALL' && reviewStatuses.get(p.id) !== statusFilter) return false;
      if (!q) return true;
      const catLabel = providerCategoryMeta(p.category).label.toLowerCase();
      return (
        p.businessName.toLowerCase().includes(q) ||
        (p.location ?? '').toLowerCase().includes(q) ||
        catLabel.includes(q)
      );
    });
  }, [providers, search, audienceFilter, statusFilter, reviewStatuses]);

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

  // FIX-11 — statut quadri-état de la fiche ouverte (fiche = source
  // fraîche : documents refetchés + isVerified resynchronisé). Rend
  // l'état « En revue » visible dans l'UI de review FIX-4.
  const sheetReviewStatus = deriveProviderReviewStatus(
    form.isVerified,
    documents ?? [],
  );
  const sheetStatusMeta = PROVIDER_REVIEW_STATUS_META[sheetReviewStatus];

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
      {/* ================= En-tête ================= */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="lux-eyebrow">Catalogue plateforme</p>
          <h1 className="lux-display mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Prestataires
          </h1>
          <p className="mt-2 text-sm text-[#8fabc2]">
            Le catalogue central — ajout, géolocalisation et audiences réservés au Superadmin.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="lux-btn shrink-0">
          Ajouter un prestataire
        </button>
      </section>

      {/* ================= Carte ================= */}
      <section aria-label="Carte interactive des prestataires">
        <div className="overflow-hidden rounded-xl border border-white/10">
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
        </div>
        <p className="mt-2 text-center text-xs text-[#8fabc2]/70">
          Cliquez sur un marqueur pour le sélectionner · un clic sur la carte remplit les
          coordonnées quand le formulaire est ouvert.
        </p>
      </section>

      {/* ================= Filtres ================= */}
      <section className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un nom, une catégorie, une ville…"
          aria-label="Rechercher un prestataire"
          className={`flex-1 ${LUX_FIELD}`}
        />
        <Select value={audienceFilter} onValueChange={setAudienceFilter}>
          <SelectTrigger aria-label="Filtrer par audience" className={`w-full sm:w-[220px] ${LUX_SELECT_TRIGGER}`}>
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent className={LUX_SELECT_CONTENT}>
            <SelectItem value="all" className={LUX_SELECT_ITEM}>Toutes les audiences</SelectItem>
            <SelectItem value="OWNER_SERVICE" className={LUX_SELECT_ITEM}>Services Propriétaire</SelectItem>
            <SelectItem value="GUEST_EXPERIENCE" className={LUX_SELECT_ITEM}>Expériences Invité</SelectItem>
          </SelectContent>
        </Select>
        {/* FIX-11 — filtre par statut de vérification (quadri-état dérivé
            des documents réels) avec compteur par état. */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'ALL' | ProviderReviewStatus)}>
          <SelectTrigger aria-label="Filtrer par statut de vérification" className={`w-full sm:w-[220px] ${LUX_SELECT_TRIGGER}`}>
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent className={LUX_SELECT_CONTENT}>
            <SelectItem value="ALL" className={LUX_SELECT_ITEM}>
              Tous les statuts ({providers.length})
            </SelectItem>
            {(Object.keys(PROVIDER_REVIEW_STATUS_META) as ProviderReviewStatus[]).map((st) => {
              const meta = PROVIDER_REVIEW_STATUS_META[st];
              return (
                <SelectItem key={st} value={st} className={LUX_SELECT_ITEM}>
                  {meta.label} ({statusCounts[st]})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <button type="button" onClick={load} className="lux-btn-ghost shrink-0" aria-label="Rafraîchir la liste">
          Actualiser
        </button>
      </section>

      {/* ================= Liste ================= */}
      <section aria-label="Liste des prestataires" className="pb-6">
        {loading && providers.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl bg-white/8" />
            ))}
          </div>
        ) : error ? (
          <div className="lux-card p-8 text-center" role="alert">
            <span className="lux-dot mx-auto" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
            <p className="mt-3 text-sm text-[#8fabc2]">{error}</p>
            <button type="button" onClick={load} className="lux-btn mt-5">
              Réessayer
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="lux-empty mt-2 rounded-2xl px-4 py-10 text-center">
            <p className="text-sm font-semibold text-white">Aucun prestataire trouvé</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[#8fabc2]">
              Modifiez la recherche ou ajoutez un nouveau prestataire.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((p) => {
              const meta = providerCategoryMeta(p.category);
              const audienceMeta = PROVIDER_AUDIENCE_META[p.audience as ProviderAudience];
              const selected = p.id === selectedId;
              // FIX-11 — statut quadri-état dérivé (remplace le badge
              // binaire « ✓ Vérifié » seul) : données réelles isVerified
              // + verificationDocuments, même convention que la review.
              const reviewStatus =
                reviewStatuses.get(p.id) ??
                deriveProviderReviewStatus(p.isVerified, parseVerificationDocuments(p.verificationDocuments));
              const statusMeta = PROVIDER_REVIEW_STATUS_META[reviewStatus];
              return (
                <div
                  key={p.id}
                  className={cn(
                    'lux-card lux-card-hover p-5',
                    selected && 'ring-1 ring-[#5cadf0]/60',
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
                      <span
                        className="lux-num flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3d97e0]/15 text-base text-[#a9d8ff] ring-1 ring-[#5cadf0]/25"
                        aria-hidden="true"
                      >
                        {meta.label.charAt(0)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-white">{p.businessName}</h3>
                          {!p.isActive && (
                            <span className="lux-chip px-2! py-0.5! text-[10px]!">
                              <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
                              Inactif
                            </span>
                          )}
                          <span
                            className="lux-chip px-2! py-0.5! text-[10px]!"
                            aria-label={`Statut de vérification : ${statusMeta.label}`}
                          >
                            <span
                              className="lux-dot"
                              style={{ backgroundColor: REVIEW_STATUS_DOT[reviewStatus] }}
                              aria-hidden="true"
                            />
                            {statusMeta.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#8fabc2]">
                          {meta.label}
                          {p.location ? ` · ${p.location}` : ''}
                          {p.audience && audienceMeta ? ` · ${audienceMeta.label}` : ''}
                        </p>
                        {p.description && (
                          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#8fabc2]">
                            {p.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#8fabc2]/80">
                          <span>
                            {p.latitude?.toFixed(3)}, {p.longitude?.toFixed(3)} · rayon {p.serviceRadiusKm} km
                          </span>
                          {p.hourlyRate != null && <span>· {formatEur(p.hourlyRate)}/h</span>}
                          {p.isUrgentAvailable && <span>· urgences</span>}
                          <span>· {p.ratingAvg.toFixed(1).replace('.', ',')} ({p.totalReviews})</span>
                          <span>· {p.totalJobsCompleted} missions</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3">
                    <label className="flex cursor-pointer items-center gap-2" aria-label={`Statut actif de ${p.businessName}`}>
                      <Switch
                        checked={p.isActive}
                        onCheckedChange={(v) => toggleActive(p, v)}
                        aria-label={`${p.businessName} actif`}
                      />
                      <span className="text-xs font-semibold text-[#8fabc2]">
                        {p.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white transition-colors hover:bg-white/[0.08]"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        aria-label={`Supprimer ${p.businessName}`}
                        className="inline-flex h-8 items-center rounded-full border border-[#f07d6a]/25 bg-[#f07d6a]/10 px-3 text-xs font-semibold text-[#f07d6a] transition-colors hover:bg-[#f07d6a]/20"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ================= Sheet création / édition (non-modal → carte cliquable) ================= */}
      <Sheet open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)} modal={false}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-white/10! bg-[#0b1226]! text-white! sm:max-w-xl"
          aria-describedby="provider-form-desc"
          // Le clic sur la carte (hors Sheet) ne doit pas fermer le formulaire :
          // on bloque la fermeture "extérieure" — Annuler / X / Échap restent actifs.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle className="lux-display text-lg font-semibold text-white">
              {editingId ? 'Modifier le prestataire' : 'Nouveau prestataire'}
            </SheetTitle>
            <SheetDescription id="provider-form-desc" className="text-sm text-[#8fabc2]">
              {editingId
                ? 'Ajustez la fiche : géolocalisation, rayon, audience ou statut.'
                : 'Règle d’or : seul le Superadmin crée et géolocalise les prestataires. La carte reste cliquable à gauche.'}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* ----- Identité ----- */}
            <fieldset className="space-y-3">
              <legend className="lux-eyebrow">Identité</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-name">Nom de l&apos;entreprise *</Label>
                  <Input
                    id="pf-name"
                    value={form.businessName}
                    onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
                    placeholder="CleanSuite Paris"
                    required
                    className={LUX_FIELD}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-category">Catégorie *</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  >
                    <SelectTrigger id="pf-category" aria-label="Catégorie du prestataire" className={LUX_SELECT_TRIGGER}>
                      <SelectValue placeholder="Choisir une catégorie" />
                    </SelectTrigger>
                    <SelectContent className={`max-h-72 ${LUX_SELECT_CONTENT}`}>
                      {Object.entries(PROVIDER_CATEGORY_META).map(([key, meta]) => (
                        <SelectItem key={key} value={key} className={LUX_SELECT_ITEM}>
                          {meta.label}
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
                  className={LUX_FIELD}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-location">Adresse / ville affichée</Label>
                  <Input
                    id="pf-location"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Montmartre, Paris 18e"
                    className={LUX_FIELD}
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
                    className={LUX_FIELD}
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
                  className={LUX_FIELD}
                />
                <p className="text-[11px] text-[#8fabc2]/70">6 URLs max — affichées dans la fiche prestataire.</p>
              </div>
            </fieldset>

            {/* ----- Audience (2 choix stricts) ----- */}
            <fieldset className="space-y-3">
              <legend className="lux-eyebrow">
                Audience — où ce prestataire apparaît-il ?
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                        'rounded-xl border p-3.5 text-left transition-all',
                        active
                          ? 'border-[#5cadf0]/60 bg-[#5cadf0]/15 text-white shadow-[0_10px_30px_-14px_rgba(61,111,224,0.6)]'
                          : 'border-white/10 bg-white/[0.03] text-white hover:border-white/20 hover:bg-white/[0.05]',
                      )}
                    >
                      <p className="text-sm font-bold">{meta.label}</p>
                      <p className={cn('mt-1 text-xs leading-relaxed', active ? 'text-[#a9d8ff]' : 'text-[#8fabc2]')}>
                        {meta.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* ----- Géolocalisation ----- */}
            <fieldset className="space-y-3">
              <legend className="lux-eyebrow">
                Géolocalisation — cliquez sur la carte en arrière-plan
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-lat">Latitude *</Label>
                  <Input
                    id="pf-lat"
                    inputMode="decimal"
                    value={form.latitude}
                    onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                    placeholder="48.886700"
                    className={LUX_FIELD}
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
                    className={LUX_FIELD}
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
                    className={LUX_FIELD}
                  />
                </div>
              </div>
            </fieldset>

            {/* ----- Conditions ----- */}
            <fieldset className="space-y-3">
              <legend className="lux-eyebrow">
                Conditions &amp; statut
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pf-rate">Tarif horaire (€, optionnel)</Label>
                  <Input
                    id="pf-rate"
                    inputMode="decimal"
                    value={form.hourlyRate}
                    onChange={(e) => setForm((f) => ({ ...f, hourlyRate: e.target.value }))}
                    placeholder="28"
                    className={LUX_FIELD}
                  />
                </div>
                <div className="flex flex-col justify-center gap-2.5">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white/90">Disponible en urgence</span>
                    <Switch
                      checked={form.isUrgentAvailable}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, isUrgentAvailable: v }))}
                      aria-label="Disponible en urgence"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white/90">✓ Prestataire vérifié</span>
                    <Switch
                      checked={form.isVerified}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, isVerified: v }))}
                      aria-label="Prestataire vérifié"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white/90">Actif</span>
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
                className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="lux-eyebrow">Documents de vérification</h3>
                  <div className="flex items-center gap-2">
                    {/* FIX-11 — statut global cohérent avec les badges de la liste
                        (Vérifié / Rejeté / En revue / En attente) */}
                    <span className="lux-chip px-2! py-0.5! text-[10px]!">
                      <span
                        className="lux-dot"
                        style={{ backgroundColor: REVIEW_STATUS_DOT[sheetReviewStatus] }}
                        aria-hidden="true"
                      />
                      {sheetStatusMeta.label}
                    </span>
                    {documents && documents.length > 0 && (
                      <span className="text-[11px] text-[#8fabc2]/70">
                        {documents.length}/5
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-[#8fabc2]">
                  Uploadés par le prestataire depuis son portail. Validez ou rejetez chaque
                  document — le badge ✓ Vérifié est recalculé automatiquement.
                </p>

                {docsLoading && !documents ? (
                  <div className="space-y-2" aria-busy="true">
                    <Skeleton className="h-12 rounded-lg bg-white/8" />
                    <Skeleton className="h-12 rounded-lg bg-white/8" />
                  </div>
                ) : !documents || documents.length === 0 ? (
                  <p className="lux-empty rounded-lg px-3 py-4 text-center text-xs text-[#8fabc2]">
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
                          className="flex flex-col gap-2 rounded-lg border border-white/8 bg-white/[0.04] p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                                {kindMeta.label}
                              </p>
                              <p className="mt-0.5 max-w-full truncate text-[11px] text-[#8fabc2]">
                                {doc.name} · {formatFrDate(doc.uploadedAt)}
                              </p>
                            </div>
                            <span className="lux-chip px-2! py-0.5! text-[10px]!">
                              <span
                                className="lux-dot"
                                style={{ backgroundColor: DOC_STATUS_DOT[doc.status] ?? '#8fabc2' }}
                                aria-hidden="true"
                              />
                              {statusMeta.label}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-[#a9d8ff] underline underline-offset-2 hover:text-white"
                            >
                              Voir le document ↗
                            </a>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busy || doc.status === 'VERIFIED'}
                                onClick={() => reviewDocument(doc, 'VERIFIED')}
                                className="inline-flex h-8 items-center rounded-full bg-gradient-to-br from-[#3d97e0] to-[#24479c] px-3 text-xs font-semibold text-white shadow-[0_8px_20px_-10px_rgba(61,111,224,0.6)] transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                ✓ Valider
                              </button>
                              <button
                                type="button"
                                disabled={busy || doc.status === 'REJECTED'}
                                onClick={() => reviewDocument(doc, 'REJECTED')}
                                className="inline-flex h-8 items-center rounded-full border border-[#f07d6a]/25 bg-[#f07d6a]/10 px-3 text-xs font-semibold text-[#f07d6a] transition-colors hover:bg-[#f07d6a]/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                ✕ Rejeter
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : (
              <p className="rounded-lg border border-[#5cadf0]/25 bg-[#5cadf0]/10 px-3 py-2 text-xs text-[#a9d8ff]">
                Les documents de vérification (Kbis, assurance…) sont envoyés par le
                prestataire depuis son portail, puis validés ici — d&apos;abord créez la fiche.
              </p>
            )}

            {formError && (
              <p role="alert" className="rounded-lg border border-[#f07d6a]/25 bg-[#f07d6a]/10 px-3 py-2 text-sm text-[#f07d6a]">
                {formError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="lux-btn-ghost"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="lux-btn min-w-40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Créer le prestataire'}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ================= Confirmation suppression ================= */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/10! bg-[#0b1226]! text-white!">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display text-xl font-semibold text-white">
              Supprimer « {deleteTarget?.businessName} » ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#8fabc2]">
              Le prestataire et son compte technique seront définitivement supprimés
              (les demandes de service associées aussi). Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full! border-white/10! bg-white/[0.04]! text-[#8fabc2]! hover:bg-white/[0.08]! hover:text-white!">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="rounded-full! bg-[#f07d6a]! text-[#1a0d09]! hover:bg-[#f07d6a]/85!"
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

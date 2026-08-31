'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BadgeCheck, Clock, Mail, MapPin, Pencil, Star, Trash2, Zap } from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { EmojiIcon } from '@/components/ui/emoji-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatDistance, formatEur, PROPERTY_TYPE_META } from '@/lib/b2b';

// =============================================================
// ProvidersContent — onglet "Prestataires" de l'Espace Hôte.
// 2 sections : 🔧 Services Propriétaire / 🥂 Expériences Invité.
// Les prestataires sont filtrés par rayon d'intervention autour
// du bien (haversine ≤ serviceRadiusKm, cf. API).
// ÉTAPE 17.5 — Catalogue fin : pour chaque expérience invité, un
// dialog "Catalogue" permet de gérer les offres commandables de
// CE prestataire pour CE bien (prix = autorité de facturation).
// =============================================================

interface ProviderDTO {
  id: string;
  audience: 'OWNER_SERVICE' | 'GUEST_EXPERIENCE';
  businessName: string;
  category: string;
  categoryEmoji: string;
  categoryLabel: string;
  subcategory: string | null;
  description: string | null;
  location: string | null;
  ratingAvg: number;
  totalReviews: number;
  distanceKm: number;
  serviceRadiusKm: number;
  hourlyRate: number | null;
  isVerified: boolean;
  isUrgentAvailable: boolean;
  responseTimeMinutes: number | null;
  totalJobsCompleted: number;
  contactName: string | null;
  contactEmail: string | null;
}

interface ProvidersData {
  properties: { id: string; name: string; propertyType: string }[];
  property: { id: string; name: string; propertyType: string; address: string | null; hasGeoloc?: boolean } | null;
  hasGeoloc: boolean;
  ownerServices: ProviderDTO[];
  guestExperiences: ProviderDTO[];
}

export function ProvidersContent() {
  const [data, setData] = useState<ProvidersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ProviderDTO | null>(null);
  const [catalogFor, setCatalogFor] = useState<ProviderDTO | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/airbnb/providers');
        if (!res.ok) throw new Error('http');
        setData((await res.json()) as ProvidersData);
      } catch {
        setError('Impossible de charger les prestataires. Réessayez.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6" aria-busy="true" aria-label="Chargement des prestataires">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-10 w-[320px] rounded-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-16 flex justify-center">
        <B2BCard className="max-w-md w-full text-center">
          <p className="text-3xl" aria-hidden="true">😵</p>
          <p className="mt-2 font-semibold text-slate-900">Erreur de chargement</p>
          <p className="text-sm text-slate-600 mt-1">{error || 'Données indisponibles.'}</p>
        </B2BCard>
      </div>
    );
  }

  const { property, hasGeoloc, ownerServices, guestExperiences } = data;
  const typeMeta = property ? PROPERTY_TYPE_META[property.propertyType] : null;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
      {/* ===== En-tête ===== */}
      <section aria-labelledby="providers-title">
        <h1 id="providers-title" className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Prestataires 🧭
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {property && (
            <>
              Autour de{' '}
              <span className="font-semibold text-slate-900">
                {typeMeta?.emoji} {property.name}
              </span>{' '}
              — triés par distance, dans leur rayon d&apos;intervention.
            </>
          )}
        </p>
      </section>

      {/* ===== Bien sans géoloc ===== */}
      {!hasGeoloc && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3" role="status">
          <span className="text-xl" aria-hidden="true">📍</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">Géolocalisation requise</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Ajoutez les coordonnées GPS de votre bien pour activer la recherche de prestataires
              par rayon d&apos;intervention (ménage, plomberie, petit-déjeuner…).
            </p>
          </div>
        </div>
      )}

      {hasGeoloc && (
        <Tabs defaultValue="OWNER_SERVICE" className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-2 h-11 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <TabsTrigger
              value="OWNER_SERVICE"
              className="rounded-lg font-semibold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
            >
              🔧 Services Propriétaire
              <span className="ml-1.5 text-[11px] font-bold opacity-70">({ownerServices.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="GUEST_EXPERIENCE"
              className="rounded-lg font-semibold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
            >
              🥂 Expériences Invité
              <span className="ml-1.5 text-[11px] font-bold opacity-70">({guestExperiences.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="OWNER_SERVICE" className="mt-4">
            <p className="text-xs text-slate-500 mb-3">
              Ménage, plomberie, pressing… des intervenants pour entretenir votre bien. Visibles
              uniquement par vous et votre équipe.
            </p>
            <ProviderGrid providers={ownerServices} onView={setSelected} audienceHint="prop" />
          </TabsContent>

          <TabsContent value="GUEST_EXPERIENCE" className="mt-4">
            <p className="text-xs text-slate-500 mb-3">
              Petit-déjeuner, sommelier, transferts… proposés à vos voyageurs via le QR code —
              chaque commande génère un revenu upselling. Gérez les formules commandables de
              chaque partenaire avec «&nbsp;Catalogue&nbsp;».
            </p>
            <ProviderGrid
              providers={guestExperiences}
              onView={setSelected}
              onCatalog={setCatalogFor}
              audienceHint="guest"
            />
          </TabsContent>
        </Tabs>
      )}

      {/* ===== Dialog détail prestataire ===== */}
      <ProviderDetailDialog provider={selected} onClose={() => setSelected(null)} />

      {/* ===== Dialog catalogue fin (ÉTAPE 17.5) ===== */}
      {catalogFor && property && (
        <CatalogDialog
          provider={catalogFor}
          propertyId={property.id}
          propertyName={property.name}
          onClose={() => setCatalogFor(null)}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Grille de cartes prestataires (+ état vide)
// -------------------------------------------------------------
function ProviderGrid({
  providers,
  onView,
  onCatalog,
  audienceHint,
}: {
  providers: ProviderDTO[];
  onView: (p: ProviderDTO) => void;
  onCatalog?: (p: ProviderDTO) => void;
  audienceHint: 'prop' | 'guest';
}) {
  if (providers.length === 0) {
    return (
      <B2BCard className="text-center py-10">
        <p className="text-4xl" aria-hidden="true">{audienceHint === 'prop' ? '🧰' : '🥂'}</p>
        <h3 className="mt-3 text-sm font-bold text-slate-900">
          Aucun prestataire dans votre rayon
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
          Les prestataires s&apos;affichent ici dès qu&apos;ils interviennent à moins de leur
          rayon d&apos;intervention de votre bien. L&apos;annuaire s&apos;étoffe au fil des
          inscriptions.
        </p>
      </B2BCard>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {providers.map((p) => (
        <ProviderCard key={p.id} provider={p} onView={onView} onCatalog={onCatalog} />
      ))}
    </div>
  );
}

// -------------------------------------------------------------
// Carte prestataire
// -------------------------------------------------------------
function ProviderCard({
  provider: p,
  onView,
  onCatalog,
}: {
  provider: ProviderDTO;
  onView: (p: ProviderDTO) => void;
  onCatalog?: (p: ProviderDTO) => void;
}) {
  return (
    <B2BCard hover className="flex flex-col h-full">
      {/* Identité */}
      <div className="flex items-start gap-3">
        <EmojiIcon emoji={p.categoryEmoji} size="lg" variant="accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900 truncate">{p.businessName}</h3>
            {p.isVerified && (
              <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0" aria-label="Prestataire vérifié" />
            )}
          </div>
          <p className="text-xs text-slate-500">
            {p.categoryLabel}
            {p.subcategory ? ` · ${p.subcategory}` : ''}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="text-xs font-bold text-slate-900 tabular-nums">
              {p.ratingAvg > 0 ? p.ratingAvg.toFixed(1).replace('.', ',') : '—'}
            </span>
            <span className="text-[11px] text-slate-400">
              ({p.totalReviews} avis)
            </span>
          </div>
        </div>
      </div>

      {/* Infos géo + prix */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold">
          📍 à {formatDistance(p.distanceKm)}
        </Badge>
        <Badge className="bg-white border-slate-200 text-slate-600 hover:bg-white font-medium">
          Rayon {p.serviceRadiusKm} km
        </Badge>
        {p.hourlyRate != null && (
          <Badge className="bg-white border-slate-200 text-slate-700 hover:bg-white font-semibold">
            dès {formatEur(p.hourlyRate)}
            <span className="font-normal text-slate-400">
              {p.audience === 'OWNER_SERVICE' ? '/h' : ' /pers.'}
            </span>
          </Badge>
        )}
        {p.isUrgentAvailable && (
          <Badge className="bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold">
            <Zap className="h-3 w-3 mr-0.5" aria-hidden="true" /> Urgent
          </Badge>
        )}
        {p.responseTimeMinutes != null && (
          <Badge className="bg-white border-slate-200 text-slate-500 hover:bg-white font-medium">
            <Clock className="h-3 w-3 mr-0.5" aria-hidden="true" /> ~{p.responseTimeMinutes} min
          </Badge>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-600 leading-relaxed line-clamp-2 flex-1">
        {p.description ?? 'Aucune description disponible.'}
      </p>

      {/* Actions */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 border-slate-300 text-slate-700 hover:bg-slate-50"
          onClick={() => {
            if (p.contactEmail) {
              window.location.href = `mailto:${p.contactEmail}?subject=${encodeURIComponent(
                `Conciergerie Hub — Demande de service (${p.businessName})`,
              )}`;
            } else {
              toast.info('Contact non disponible', {
                description: 'Ce prestataire n’a pas encore renseigné de email de contact.',
              });
            }
          }}
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Contacter
        </Button>
        <Button
          size="sm"
          className="h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
          onClick={() => onView(p)}
        >
          Voir
        </Button>
      </div>

      {/* ÉTAPE 17.5 — Catalogue fin (expériences invité uniquement) */}
      {p.audience === 'GUEST_EXPERIENCE' && onCatalog && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full h-9 border-teal-600/40 text-teal-700 hover:bg-teal-50 font-semibold"
          onClick={() => onCatalog(p)}
          aria-label={`Gérer le catalogue de ${p.businessName}`}
        >
          🧾 Gérer le catalogue
        </Button>
      )}
    </B2BCard>
  );
}

// -------------------------------------------------------------
// Dialog détail prestataire ("Voir")
// -------------------------------------------------------------
function ProviderDetailDialog({
  provider,
  onClose,
}: {
  provider: ProviderDTO | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={provider !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-white border border-slate-200 rounded-xl sm:rounded-xl max-h-[85vh] overflow-y-auto">
        {provider && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <EmojiIcon emoji={provider.categoryEmoji} size="lg" variant="accent" />
                <div className="min-w-0">
                  <DialogTitle className="text-base font-bold text-slate-900 text-left flex items-center gap-1.5">
                    {provider.businessName}
                    {provider.isVerified && (
                      <BadgeCheck className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 text-left">
                    {provider.categoryLabel}
                    {provider.subcategory ? ` · ${provider.subcategory}` : ''} —{' '}
                    {provider.location}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold">
                  📍 à {formatDistance(provider.distanceKm)} du bien
                </Badge>
                <Badge className="bg-white border-slate-200 text-slate-600">
                  ⭐ {provider.ratingAvg.toFixed(1).replace('.', ',')} ({provider.totalReviews} avis)
                </Badge>
                <Badge className="bg-white border-slate-200 text-slate-600">
                  🧰 {provider.totalJobsCompleted} missions
                </Badge>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                {provider.description ?? 'Aucune description disponible.'}
              </p>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-xs text-slate-600">
                <p>
                  <span className="font-semibold text-slate-800">Rayon d&apos;intervention :</span>{' '}
                  {provider.serviceRadiusKm} km
                </p>
                {provider.hourlyRate != null && (
                  <p>
                    <span className="font-semibold text-slate-800">Tarif indicatif :</span> dès{' '}
                    {formatEur(provider.hourlyRate)}
                    {provider.audience === 'OWNER_SERVICE' ? ' /h' : ' /pers.'}
                  </p>
                )}
                {provider.responseTimeMinutes != null && (
                  <p>
                    <span className="font-semibold text-slate-800">Temps de réponse moyen :</span> ~
                    {provider.responseTimeMinutes} min
                  </p>
                )}
                {provider.contactEmail && (
                  <p className="truncate">
                    <span className="font-semibold text-slate-800">Contact :</span>{' '}
                    <a
                      className="underline underline-offset-2 hover:text-slate-900"
                      href={`mailto:${provider.contactEmail}`}
                    >
                      {provider.contactEmail}
                    </a>
                  </p>
                )}
              </div>

              <Button
                className={cn('w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold')}
                onClick={() => {
                  if (provider.contactEmail) {
                    window.location.href = `mailto:${provider.contactEmail}?subject=${encodeURIComponent(
                      `Conciergerie Hub — Demande de service (${provider.businessName})`,
                    )}`;
                  } else {
                    toast.info('Contact non disponible pour ce prestataire.');
                  }
                }}
              >
                <Mail className="h-4 w-4" aria-hidden="true" /> Contacter ce prestataire
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------
// ÉTAPE 17.5 — Dialog "Catalogue" d'un prestataire pour le bien
// Liste des offres commandables + ajout / édition / visibilité /
// suppression. Le prix de ces offres est l'AUTORITÉ de facturation
// (re-résolu serveur au POST de commande — jamais cru côté client).
// -------------------------------------------------------------
interface OfferDTO {
  id: string;
  providerId: string;
  name: string;
  description: string | null;
  unitPrice: number;
  unit: string;
  isActive: boolean;
  provider: { businessName: string; category: string };
}

function CatalogDialog({
  provider,
  propertyId,
  propertyName,
  onClose,
}: {
  provider: ProviderDTO;
  propertyId: string;
  propertyName: string;
  onClose: () => void;
}) {
  const [offers, setOffers] = useState<OfferDTO[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('prestation');
  const [description, setDescription] = useState('');

  const resetForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setPrice('');
    setUnit('prestation');
    setDescription('');
    setFormError('');
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    fetch(
      `/api/airbnb/service-offers?propertyId=${encodeURIComponent(propertyId)}&providerId=${encodeURIComponent(provider.id)}`,
    )
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error('http');
        if (!cancelled) {
          setOffers(Array.isArray(j.offers) ? j.offers : []);
          setLoadError('');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Impossible de charger le catalogue.');
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, provider.id]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  const startEdit = (o: OfferDTO) => {
    setEditingId(o.id);
    setName(o.name);
    setPrice(String(o.unitPrice));
    setUnit(o.unit);
    setDescription(o.description ?? '');
    setFormError('');
  };

  const submit = () => {
    if (saving) return;
    const p = parseFloat(price.replace(',', '.'));
    if (!name.trim()) {
      setFormError('Le nom de l\u2019offre est requis.');
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      setFormError('Prix invalide — ex : 12 ou 12,50.');
      return;
    }
    setSaving(true);
    setFormError('');
    const url = editingId
      ? `/api/airbnb/service-offers?id=${encodeURIComponent(editingId)}`
      : `/api/airbnb/service-offers?propertyId=${encodeURIComponent(propertyId)}`;
    fetch(url, {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: provider.id,
        name: name.trim(),
        unitPrice: p,
        unit: unit.trim() || 'prestation',
        description: description.trim() || null,
      }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          setFormError(j?.error || 'Enregistrement impossible.');
          return;
        }
        toast.success(editingId ? 'Offre mise à jour' : 'Offre ajoutée au catalogue');
        resetForm();
        load();
      })
      .catch(() => setFormError('Connexion impossible.'))
      .finally(() => setSaving(false));
  };

  const toggleActive = (o: OfferDTO) => {
    // Optimiste avec rollback silencieux via rechargement
    setOffers((prev) =>
      prev ? prev.map((x) => (x.id === o.id ? { ...x, isActive: !o.isActive } : x)) : prev,
    );
    fetch(`/api/airbnb/service-offers?id=${encodeURIComponent(o.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !o.isActive }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('http');
        toast.success(!o.isActive ? 'Offre visible par les invités' : 'Offre masquée');
      })
      .catch(() => {
        toast.error('Impossible de changer la visibilité.');
        load();
      });
  };

  const remove = (o: OfferDTO) => {
    setOffers((prev) => (prev ? prev.filter((x) => x.id !== o.id) : prev));
    fetch(`/api/airbnb/service-offers?id=${encodeURIComponent(o.id)}`, { method: 'DELETE' })
      .then(async (r) => {
        if (!r.ok) throw new Error('http');
        toast.success('Offre supprimée');
      })
      .catch(() => {
        toast.error('Suppression impossible.');
        load();
      });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-white border border-slate-200 rounded-xl sm:rounded-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900 text-left">
            🧾 Catalogue — {provider.businessName}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 text-left">
            Formules commandables par vos invités dans <span className="font-semibold">{propertyName}</span>.
            Le prix ci-dessous fait foi à la commande (recalculé côté serveur).
          </DialogDescription>
        </DialogHeader>

        {/* Liste des offres */}
        <div className="space-y-2" aria-busy={offers === null}>
          {offers === null && (
            <>
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </>
          )}
          {offers !== null && offers.length === 0 && !loadError && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
              <p className="text-2xl" aria-hidden="true">🗂️</p>
              <p className="text-xs text-slate-500 mt-1">
                Aucune offre pour l&apos;instant — ajoutez la première formule ci-dessous.
              </p>
            </div>
          )}
          {offers !== null &&
            offers.map((o) => (
              <div
                key={o.id}
                className={cn(
                  'rounded-xl border p-3 flex items-start gap-3',
                  o.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{o.name}</p>
                  {o.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{o.description}</p>
                  )}
                  <p className="text-xs font-semibold text-teal-700 mt-1">
                    {formatEur(o.unitPrice)} <span className="font-normal text-slate-400">/ {o.unit}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500">{o.isActive ? 'Visible' : 'Masquée'}</span>
                    <Switch
                      checked={o.isActive}
                      onCheckedChange={() => toggleActive(o)}
                      aria-label={`Visibilité de l'offre ${o.name}`}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 border-slate-300 text-slate-600 hover:bg-slate-50"
                      onClick={() => startEdit(o)}
                      aria-label={`Modifier l'offre ${o.name}`}
                    >
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 border-rose-200 text-rose-600 hover:bg-rose-50"
                      onClick={() => remove(o)}
                      aria-label={`Supprimer l'offre ${o.name}`}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          {loadError && (
            <p className="text-xs font-semibold text-rose-600" role="alert">{loadError}</p>
          )}
        </div>

        {/* Formulaire ajout / édition */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
          <p className="text-xs font-bold text-slate-800">
            {editingId ? '✏️ Modifier l\u2019offre' : '➕ Nouvelle offre'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-name" className="text-xs font-semibold text-slate-700">Nom de l&apos;offre</Label>
              <Input
                id="offer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Morning Box M (2 pers.)"
                maxLength={80}
                className="h-9 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-price" className="text-xs font-semibold text-slate-700">Prix (€)</Label>
              <Input
                id="offer-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="12,50"
                className="h-9 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-unit" className="text-xs font-semibold text-slate-700">Unité</Label>
              <Input
                id="offer-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="prestation, box, personne…"
                maxLength={30}
                className="h-9 bg-white"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-desc" className="text-xs font-semibold text-slate-700">
                Description <span className="font-normal text-slate-400">(facultatif)</span>
              </Label>
              <Input
                id="offer-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Viennoiseries artisanales, jus pressés…"
                maxLength={300}
                className="h-9 bg-white"
              />
            </div>
          </div>
          {formError && (
            <p className="text-xs font-semibold text-rose-600" role="alert">{formError}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              className="h-9 flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
              disabled={saving}
              onClick={submit}
            >
              {saving ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Ajouter au catalogue'}
            </Button>
            {editingId && (
              <Button
                variant="outline"
                className="h-9 border-slate-300 text-slate-600 hover:bg-white"
                onClick={resetForm}
              >
                Annuler
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

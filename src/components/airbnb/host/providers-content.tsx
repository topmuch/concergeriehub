'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock3, MapPin, Send, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { useProviders, type NearbyProvider } from '@/hooks/use-providers';
import { PROVIDER_AUDIENCE_META, type ProviderAudience } from '@/lib/b2b';
import { StatusBadge } from '@/components/airbnb/host/status-badge';
import { FormDialog } from '@/components/airbnb/host/form-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// =============================================================
// ProvidersContent — page « Prestataires » du Dashboard Client
// (H4 — T4c, spécification QRTags Pro)
//
// • Données : hook useProviders (alimenté par le sélecteur du
//   header) → /api/airbnb/providers (haversine, tri distance).
// • 2 onglets : Services Propriétaire / Expériences Invité.
// • Bannière ambre si le bien n'a pas de géolocalisation.
// • Modale « Demander un prestataire » → SupportTicket réel
//   (POST /api/airbnb/provider-requests), visible superadmin.
// =============================================================

const BRAND = '#E23F2B';
/** Fenêtre de recherche serveur (bounding box) — sert au libellé d'empty state. */
const SEARCH_RADIUS_KM = 100;

type TabKey = ProviderAudience;

function formatEur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
}

// -------------------------------------------------------------
// Carte prestataire
// -------------------------------------------------------------
function ProviderCard({ provider }: { provider: NearbyProvider }) {
  const mailto = provider.contactEmail
    ? `mailto:${provider.contactEmail}?subject=${encodeURIComponent(
        `Demande via Conciergerie Hub — ${provider.businessName}`,
      )}`
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
      aria-label={`Prestataire ${provider.businessName}`}
    >
      {/* --- En-tête : emoji + nom + badges --- */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-100"
        >
          {provider.categoryEmoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold text-slate-900">{provider.businessName}</h3>
          <p className="truncate text-xs text-slate-500">
            {provider.categoryLabel}
            {provider.subcategory ? ` · ${provider.subcategory}` : ''}
          </p>
        </div>
      </div>

      {/* --- Note + badges --- */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {provider.totalReviews > 0 ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-slate-700">
            <span aria-hidden="true">⭐</span>
            {provider.ratingAvg.toFixed(1)}/5
            <span className="font-normal text-slate-500">({provider.totalReviews} avis)</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-slate-700">
            <span aria-hidden="true">🌱</span> Nouveau
          </span>
        )}
        {provider.isVerified && <StatusBadge status="verified" label="✓ Vérifié" />}
        {provider.isUrgentAvailable && (
          <StatusBadge status="unverified" tone="danger" label="🚨 Urgences" />
        )}
      </div>

      {/* --- Distance / rayon / taux / missions / réponse --- */}
      <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <li className="inline-flex min-w-0 items-center gap-1" title="Distance depuis votre bien">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          à {provider.distanceKm.toFixed(1)} km · rayon {provider.serviceRadiusKm} km
        </li>
        {provider.hourlyRate != null && (
          <li className="inline-flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            {formatEur(provider.hourlyRate)}/h
          </li>
        )}
        <li className="inline-flex items-center gap-1">
          <span aria-hidden="true">🧰</span>
          {provider.totalJobsCompleted} mission{provider.totalJobsCompleted > 1 ? 's' : ''} réalisée
          {provider.totalJobsCompleted > 1 ? 's' : ''}
        </li>
        {provider.responseTimeMinutes != null && (
          <li className="inline-flex items-center gap-1">
            <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            répond en {provider.responseTimeMinutes} min
          </li>
        )}
      </ul>

      {provider.description && (
        <p className="line-clamp-2 text-sm text-slate-600">{provider.description}</p>
      )}

      {/* --- Contact --- */}
      <div className="mt-auto pt-1">
        {mailto ? (
          <Button variant="outline" size="sm" asChild className="h-9 w-full border-slate-200 text-slate-700 sm:w-auto">
            <a
              href={mailto}
              aria-label={`Contacter ${provider.businessName} par email`}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Contacter
            </a>
          </Button>
        ) : (
          <Tooltip>
            {/* Le trigger est un span : les boutons disabled ne déclenchent
                pas les événements souris dans plusieurs navigateurs. */}
            <TooltipTrigger asChild>
              <span className="inline-block w-full sm:w-auto" tabIndex={0}>
                <Button variant="outline" size="sm" disabled className="h-9 w-full border-slate-200 sm:w-auto">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Contact via plateforme
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coordonnées gérées par le superadmin</TooltipContent>
          </Tooltip>
        )}
      </div>
    </motion.article>
  );
}

// -------------------------------------------------------------
// Conteneur de page
// -------------------------------------------------------------
export function ProvidersContent() {
  const { properties, selectedProperty, propertiesLoading } = useHostContext();
  const { ownerServices, guestExperiences, property, hasGeoloc, loading, error } = useProviders();

  const [tab, setTab] = useState<TabKey>('OWNER_SERVICE');
  const [requestOpen, setRequestOpen] = useState(false);

  const audienceMeta = PROVIDER_AUDIENCE_META;
  const counts: Record<TabKey, number> = {
    OWNER_SERVICE: ownerServices.length,
    GUEST_EXPERIENCE: guestExperiences.length,
  };

  // Bien par défaut de la modale : sélection du header, sinon celui
  // utilisé par l'annuaire (fallback properties[0] côté API), sinon 1er.
  const defaultPropertyId = useMemo(() => {
    return (
      selectedProperty?.id ??
      property?.id ??
      properties[0]?.id ??
      ''
    );
  }, [selectedProperty, property, properties]);

  const subtitle = property
    ? `autour de ${property.name}`
    : propertiesLoading
      ? 'chargement…'
      : 'sélectionnez un bien';

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Prestataires
          </h1>
          <p className="mt-1 truncate text-sm text-slate-600">{subtitle}</p>
        </div>
        <Button
          size="sm"
          className="h-9 gap-2 text-white sm:h-10 sm:px-5"
          style={{ backgroundColor: BRAND }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#C93524')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND)}
          onClick={() => setRequestOpen(true)}
          aria-label="Demander un prestataire"
        >
          <span aria-hidden="true">✉️</span>
          Demander un prestataire
        </Button>
      </div>

      {/* ---------- Bannière géolocalisation manquante ---------- */}
      {!loading && property && !hasGeoloc && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center"
          role="status"
        >
          <p className="min-w-0 flex-1 text-sm text-amber-900">
            <span aria-hidden="true">📍</span> Ajoutez la géolocalisation de votre bien pour
            découvrir les prestataires autour de lui
          </p>
          <Link
            href="/airbnb/properties"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-amber-600 px-3 text-xs font-bold text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40"
            aria-label="Modifier le bien pour ajouter la géolocalisation"
          >
            Modifier le bien
          </Link>
        </motion.div>
      )}

      {/* ---------- Erreur API ---------- */}
      {error && (
        <div
          className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          <span aria-hidden="true">⚠️</span>
          {error}
        </div>
      )}

      {/* ---------- Aucun bien ---------- */}
      {!propertiesLoading && properties.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
          <span aria-hidden="true" className="text-4xl">🏠</span>
          <p className="font-semibold text-slate-900">Aucun bien dans votre portfolio</p>
          <p className="max-w-md text-sm text-slate-600">
            Ajoutez votre première propriété pour découvrir les prestataires autour d&apos;elle.
          </p>
          <Button size="sm" asChild className="text-white" style={{ backgroundColor: BRAND }}>
            <Link href="/airbnb/properties?new=1">Ajouter une propriété</Link>
          </Button>
        </div>
      )}

      {/* ---------- Onglets + grille ---------- */}
      {!propertiesLoading && properties.length > 0 && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="min-w-0">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1 sm:w-fit">
            {(Object.keys(audienceMeta) as TabKey[]).map((key) => {
              const meta = audienceMeta[key];
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="gap-1.5 rounded-lg px-3 py-2 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  aria-label={`${meta.label} : ${counts[key]} prestataire${counts[key] > 1 ? 's' : ''}`}
                >
                  <span aria-hidden="true">{meta.emoji}</span>
                  <span className="hidden sm:inline">{meta.label}</span>
                  <span className="sm:hidden">{meta.label.split(' ')[1] ?? meta.label}</span>
                  <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[11px] font-bold text-slate-700">
                    {counts[key]}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(audienceMeta) as TabKey[]).map((key) => {
            const meta = audienceMeta[key];
            const list = key === 'OWNER_SERVICE' ? ownerServices : guestExperiences;
            return (
              <TabsContent key={key} value={key} className="mt-4 min-w-0">
                <p className="mb-4 text-sm text-slate-600">{meta.hint}</p>

                {loading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Chargement des prestataires">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-11 w-11 rounded-xl" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                        <Skeleton className="mt-4 h-3 w-2/3" />
                        <Skeleton className="mt-2 h-3 w-1/2" />
                        <Skeleton className="mt-4 h-9 w-28 rounded-lg" />
                      </div>
                    ))}
                  </div>
                ) : list.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                    <span aria-hidden="true" className="text-4xl">{meta.emoji}</span>
                    <p className="font-semibold text-slate-900">
                      Aucun prestataire {meta.label.toLowerCase()} à moins de {SEARCH_RADIUS_KM} km
                      autour de ce bien
                    </p>
                    <p className="max-w-md text-sm text-slate-600">{meta.hint}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-200 text-slate-700"
                      onClick={() => setRequestOpen(true)}
                      aria-label="Demander un prestataire"
                    >
                      <span aria-hidden="true">✉️</span> Demander un prestataire
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((p) => (
                      <ProviderCard key={p.id} provider={p} />
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* ---------- Modale « Demander un prestataire » ---------- */}
      {/* Montage conditionnel : useState s'initialise avec le bien par
          défaut courant (les données du contexte sont déjà chargées). */}
      {requestOpen && (
        <RequestProviderDialog
          open
          onOpenChange={setRequestOpen}
          defaultPropertyId={defaultPropertyId}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Modale de demande → SupportTicket réel
// -------------------------------------------------------------
function RequestProviderDialog({
  open,
  onOpenChange,
  defaultPropertyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPropertyId: string;
}) {
  const { properties } = useHostContext();
  const [propertyId, setPropertyId] = useState(defaultPropertyId);
  const [service, setService] = useState('');
  const [audience, setAudience] = useState<ProviderAudience>('OWNER_SERVICE');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const valid = service.trim().length >= 2 && propertyId !== '';

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/airbnb/provider-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          service: service.trim(),
          audience,
          details: details.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        'Demande envoyée — l’équipe Conciergerie Hub vous recontacte sous 24 h',
      );
      onOpenChange(false);
      setService('');
      setDetails('');
    } catch (err) {
      console.error('[ProvidersContent] provider request failed:', err);
      toast.error(
        err instanceof Error && err.message !== 'Loading failed'
          ? `Envoi impossible : ${err.message}`
          : 'Envoi impossible — réessayez dans un instant.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="✉️ Demander un prestataire"
      description="Décrivez votre besoin : l'équipe Conciergerie Hub recherche un prestataire vérifié pour vous et vous recontacte sous 24 h."
      size="sm"
      footer={
        <>
          <Button
            variant="outline"
            className="border-slate-200 text-slate-700"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            className="text-white"
            style={{ backgroundColor: BRAND }}
            onClick={() => void submit()}
            disabled={!valid || submitting}
            aria-label="Envoyer la demande de prestataire"
          >
            {submitting ? 'Envoi…' : 'Envoyer la demande'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-request-property">Bien concerné</Label>
        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger id="provider-request-property" className="w-full border-slate-200">
            <SelectValue placeholder="Choisissez un bien" />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-request-service">Service recherché</Label>
        <Input
          id="provider-request-service"
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="ex : Plombier"
          maxLength={120}
          autoComplete="off"
          aria-required="true"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-request-audience">Type de prestation</Label>
        <Select
          value={audience}
          onValueChange={(v) => setAudience(v as ProviderAudience)}
        >
          <SelectTrigger id="provider-request-audience" className="w-full border-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PROVIDER_AUDIENCE_META) as ProviderAudience[]).map((key) => (
              <SelectItem key={key} value={key}>
                {PROVIDER_AUDIENCE_META[key].emoji} {PROVIDER_AUDIENCE_META[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-request-details">Détails &amp; disponibilités</Label>
        <Textarea
          id="provider-request-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="ex : Fuite sous l'évier, disponible en fin de journée…"
          rows={4}
          maxLength={1500}
        />
        <p className="text-xs text-slate-400">{details.length}/1500 caractères</p>
      </div>
    </FormDialog>
  );
}

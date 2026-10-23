'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { useProviders, type NearbyProvider } from '@/hooks/use-providers';
import { PROVIDER_AUDIENCE_META, type ProviderAudience } from '@/lib/b2b';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/airbnb/host/status-badge';
import { FormDialog } from '@/components/airbnb/host/form-dialog';
import { Badge } from '@/components/ui/badge';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
// v4.60 « AIRBNB PRO » — refonte visuelle (logique intacte) : cartes
// annuaire air-shadow + air-hoverlift à bulle de catégorie, CTA
// air-gradient, empty states .air-empty, tokens dark-safe.
// v4.69 — PHASE 2 · « AJOUTER MON PROPRE PRESTATAIRE » : bouton
// primaire « + Mon prestataire » → HostProvider CRUD (POST/PATCH/
// DELETE /api/airbnb/host-providers), cartes « Mon prestataire »
// en tête de CHACUN des 2 onglets (toggle isActive, édition,
// suppression AlertDialog), emoji picker, audience hôte/invité.
//
// • Données : hook useProviders (alimenté par le sélecteur du
//   header) → /api/airbnb/providers (haversine, tri distance) +
//   /api/airbnb/host-providers?propertyId= (même bien résolu).
// • 2 onglets : Services Propriétaire / Expériences Invité.
// • Bannière ambre si le bien n'a pas de géolocalisation.
// • Modale « Demander un prestataire » → SupportTicket réel
//   (POST /api/airbnb/provider-requests), visible superadmin.
//
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
//   nuit saphir, SANS icônes lucide ni emojis décoratifs (les
//   pastilles emoji restent des DONNÉES éditables), cartes
//   .lux-card, CTA .lux-btn, onglets pilules — logique intacte.
// =============================================================

/** Fenêtre de recherche serveur (bounding box) — sert au libellé d'empty state. */
const SEARCH_RADIUS_KM = 100;

// -------------------------------------------------------------
// v4.69 — PHASE 2 · « AJOUTER MON PROPRE PRESTATAIRE » (HostProvider)
// Prestataire ajouté manuellement par l'hôte pour UN bien précis,
// hors annuaire plateforme (son plombier, sa baby-sitter…). Selon
// l'audience il apparaît EN PREMIER dans l'onglet correspondant et,
// s'il est GUEST_EXPERIENCE + actif, dans les services invités du
// hub public (fusion côté /api/public/hub/[slug]).
// -------------------------------------------------------------

/** Picker emoji : rangée de 10 pastilles. */
const HOST_PROVIDER_EMOJIS = ['🔧', '⚡', '🧹', '🛠️', '👶', '🚕', '👨‍🍳', '💅', '🧳', '❓'];

/** Catégories proposées (défaut « Autre »). */
const HOST_PROVIDER_CATEGORIES = [
  'Nettoyage',
  'Plomberie',
  'Électricité',
  'Maintenance',
  'Baby-sitting',
  'Transport',
  'Cuisine',
  'Bien-être',
  'Jardinage',
  'Autre',
];

/** Miroir du modèle HostProvider (cf. /api/airbnb/host-providers). */
interface HostProviderItem {
  id: string;
  propertyId: string;
  name: string;
  emoji: string;
  category: string;
  description: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  audience: ProviderAudience;
  isUrgentAvailable: boolean;
  isActive: boolean;
  createdAt: string;
}

/** Forme du formulaire (création comme édition). */
interface HostProviderFormValues {
  propertyId: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  audience: ProviderAudience;
  isUrgentAvailable: boolean;
}

const EMPTY_FORM: HostProviderFormValues = {
  propertyId: '',
  name: '',
  emoji: '🔧',
  category: 'Autre',
  description: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  audience: 'OWNER_SERVICE',
  isUrgentAvailable: false,
};

/** Validation client minimale : nom requis (2-80), email formaté si saisi. */
function hostProviderFormError(values: HostProviderFormValues): string | null {
  const name = values.name.trim();
  if (name.length < 2) return 'Le nom du prestataire est requis (2 caractères minimum).';
  if (name.length > 80) return 'Le nom ne peut pas dépasser 80 caractères.';
  const email = values.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Adresse email invalide.';
  }
  return null;
}

/** Classes CTA « saphir luxe » — alignées sur le design system v5.2. */
const AIR_CTA_CLASS = 'lux-btn h-9 px-4 text-xs';

type TabKey = ProviderAudience;

function formatEur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
}

// -------------------------------------------------------------
// Carte prestataire
// -------------------------------------------------------------
function ProviderCard({
  provider,
  onToggle,
  toggling,
}: {
  provider: NearbyProvider;
  /** v4.32 — ACTIVER / DÉSACTIVER (demande client : l'hôte peut ne pas
   *  vouloir activer un prestataire). Désactivé = masqué côté invités. */
  onToggle: (provider: NearbyProvider, enabled: boolean) => void;
  toggling: boolean;
}) {
  const mailto = provider.contactEmail
    ? `mailto:${provider.contactEmail}?subject=${encodeURIComponent(
        `Demande via RoomScan — ${provider.businessName}`,
      )}`
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="lux-card lux-card-hover flex min-w-0 flex-col gap-3 p-4 sm:p-5"
      aria-label={`Prestataire ${provider.businessName}`}
    >
      {/* --- En-tête : pastille (donnée) + nom + badges --- */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg',
            provider.audience === 'GUEST_EXPERIENCE'
              ? 'bg-[#3d97e0]/15 text-[#a9d8ff] ring-1 ring-[#5cadf0]/25'
              : 'bg-white/[0.05] text-[#c7d3ec] ring-1 ring-white/10',
          )}
        >
          {provider.categoryEmoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-white">{provider.businessName}</h3>
          <p className="truncate text-xs text-[#8fabc2]">
            {provider.categoryLabel}
            {provider.subcategory ? ` · ${provider.subcategory}` : ''}
          </p>
        </div>
        {/* v4.32 — toggle ACTIVER / DÉSACTIVER */}
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Switch
            checked={provider.enabled}
            disabled={toggling}
            onCheckedChange={(v) => onToggle(provider, v)}
            aria-label={
              provider.enabled
                ? `Désactiver ${provider.businessName} pour ce bien`
                : `Activer ${provider.businessName} pour ce bien`
            }
          />
          <span
            className={cn(
              'text-[9px] font-bold uppercase tracking-wide',
              provider.enabled ? 'text-[#34d399]' : 'text-[#8fabc2]',
            )}
          >
            {provider.enabled ? 'Activé' : 'Désactivé'}
          </span>
        </span>
      </div>

      {/* --- Note + badges --- */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {provider.totalReviews > 0 ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-white">
            {provider.ratingAvg.toFixed(1)}/5
            <span className="font-normal text-[#8fabc2]">({provider.totalReviews} avis)</span>
          </span>
        ) : (
          <span className="lux-chip whitespace-nowrap">
            <span className="lux-dot" style={{ backgroundColor: '#86e9cb' }} aria-hidden="true" />
            Nouveau
          </span>
        )}
        {provider.isVerified && <StatusBadge status="verified" label="✓ Vérifié" />}
        {provider.isUrgentAvailable && (
          <StatusBadge status="unverified" tone="danger" label="Urgences" />
        )}
      </div>

      {/* --- Distance / rayon / taux / missions / réponse --- */}
      <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8fabc2]">
        <li className="inline-flex min-w-0 items-center gap-1" title="Distance depuis votre bien">
          à {provider.distanceKm.toFixed(1)} km · rayon {provider.serviceRadiusKm} km
        </li>
        {provider.hourlyRate != null && (
          <li className="inline-flex items-center gap-1">
            <span className="lux-num text-[#e9c47c]">{formatEur(provider.hourlyRate)}</span>/h
          </li>
        )}
        <li className="inline-flex items-center gap-1">
          {provider.totalJobsCompleted} mission{provider.totalJobsCompleted > 1 ? 's' : ''} réalisée
          {provider.totalJobsCompleted > 1 ? 's' : ''}
        </li>
        {provider.responseTimeMinutes != null && (
          <li className="inline-flex items-center gap-1">
            répond en {provider.responseTimeMinutes} min
          </li>
        )}
      </ul>

      {provider.description && (
        <p className="line-clamp-2 text-sm text-[#8fabc2]">{provider.description}</p>
      )}

      {/* --- Contact --- */}
      <div className="mt-auto pt-1">
        {mailto ? (
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-9 w-full rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white sm:w-auto"
          >
            <a
              href={mailto}
              aria-label={`Contacter ${provider.businessName} par email`}
            >
              Contacter
            </a>
          </Button>
        ) : (
          <Tooltip>
            {/* Le trigger est un span : les boutons disabled ne déclenchent
                pas les événements souris dans plusieurs navigateurs. */}
            <TooltipTrigger asChild>
              <span className="inline-block w-full sm:w-auto" tabIndex={0}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="h-9 w-full rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white sm:w-auto"
                >
                  Contact via plateforme
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="border border-white/10 bg-[#0b1226] text-[#c7d3ec]">
              Coordonnées gérées par le superadmin
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </motion.article>
  );
}

// -------------------------------------------------------------
// Carte « Mon prestataire » (HostProvider) — même grille que les
// cartes annuaire, avec badge distinctif + édition / suppression.
// -------------------------------------------------------------
function HostProviderCard({
  provider,
  onToggle,
  onEdit,
  onDelete,
  toggling,
}: {
  provider: HostProviderItem;
  onToggle: (provider: HostProviderItem, isActive: boolean) => void;
  onEdit: (provider: HostProviderItem) => void;
  onDelete: (provider: HostProviderItem) => void;
  toggling: boolean;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="lux-card lux-card-hover flex min-w-0 flex-col gap-3 p-4 sm:p-5"
      aria-label={`Mon prestataire ${provider.name}`}
    >
      {/* --- En-tête : pastille (donnée) + nom + badge perso --- */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg',
            provider.audience === 'GUEST_EXPERIENCE'
              ? 'bg-[#3d97e0]/15 text-[#a9d8ff] ring-1 ring-[#5cadf0]/25'
              : 'bg-white/[0.05] text-[#c7d3ec] ring-1 ring-white/10',
          )}
        >
          {provider.emoji || '🔧'}
        </span>
        <div className="min-w-0 flex-1">
          <Badge
            variant="outline"
            className="mb-1 w-fit rounded-full border-[#e9c47c]/30 bg-[#e9c47c]/10 text-[10px] font-bold uppercase tracking-[0.08em] text-[#e9c47c]"
          >
            Mon prestataire
          </Badge>
          <h3 className="truncate font-semibold text-white">{provider.name}</h3>
          <p className="truncate text-xs text-[#8fabc2]">{provider.category || 'Autre'}</p>
        </div>
        {/* Toggle d'activation — isActive=false = masqué côté invités. */}
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Switch
            checked={provider.isActive}
            disabled={toggling}
            onCheckedChange={(v) => onToggle(provider, v)}
            aria-label={
              provider.isActive
                ? `Désactiver ${provider.name} pour ce bien`
                : `Activer ${provider.name} pour ce bien`
            }
          />
          <span
            className={cn(
              'text-[9px] font-bold uppercase tracking-wide',
              provider.isActive ? 'text-[#34d399]' : 'text-[#8fabc2]',
            )}
          >
            {provider.isActive ? 'Activé' : 'Désactivé'}
          </span>
        </span>
      </div>

      {/* --- Badge urgences --- */}
      {provider.isUrgentAvailable && <StatusBadge status="unverified" tone="danger" label="Urgences" />}

      {provider.description && (
        <p className="line-clamp-2 text-sm text-[#8fabc2]">{provider.description}</p>
      )}

      {/* --- Contacts : email / téléphone / site --- */}
      {(provider.contactEmail || provider.contactPhone || provider.website) && (
        <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8fabc2]">
          {provider.contactName && (
            <li className="inline-flex items-center gap-1 text-[#c7d3ec]">
              {provider.contactName}
            </li>
          )}
          {provider.contactEmail && (
            <li>
              <a
                href={`mailto:${provider.contactEmail}`}
                className="font-medium text-[#a9d8ff] hover:underline"
                aria-label={`Envoyer un email à ${provider.name}`}
              >
                Email
              </a>
            </li>
          )}
          {provider.contactPhone && (
            <li>
              <a
                href={`tel:${provider.contactPhone.replace(/\s+/g, '')}`}
                className="font-medium text-white hover:underline"
                aria-label={`Appeler ${provider.name}`}
              >
                {provider.contactPhone}
              </a>
            </li>
          )}
          {provider.website && (
            <li>
              <a
                href={provider.website.startsWith('http') ? provider.website : `https://${provider.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#a9d8ff] hover:underline"
                aria-label={`Visiter le site de ${provider.name}`}
              >
                Site web
              </a>
            </li>
          )}
        </ul>
      )}

      {/* --- Actions : modifier / supprimer --- */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 flex-1 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
          onClick={() => onEdit(provider)}
          aria-label={`Modifier ${provider.name}`}
        >
          Modifier
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-[#f07d6a]/25 bg-[#f07d6a]/8 text-xs font-semibold text-[#f6a293] hover:bg-[#f07d6a]/15 hover:text-[#f6a293]"
          onClick={() => onDelete(provider)}
          aria-label={`Supprimer ${provider.name}`}
        >
          Supprimer
        </Button>
      </div>
    </motion.article>
  );
}

// -------------------------------------------------------------
// Modale « Mon prestataire » — création ET édition (POST / PATCH)
// -------------------------------------------------------------
function HostProviderDialog({
  open,
  onOpenChange,
  editing,
  defaultPropertyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Présent = édition (PATCH ?id=), absent = création (POST). */
  editing: HostProviderItem | null;
  defaultPropertyId: string;
  onSaved: () => Promise<void> | void;
}) {
  const { properties } = useHostContext();
  const [values, setValues] = useState<HostProviderFormValues>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Pré-remplissage à l'ouverture (édition) ou reset (création).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setValues({
        propertyId: editing.propertyId,
        name: editing.name,
        emoji: editing.emoji || '🔧',
        category: editing.category || 'Autre',
        description: editing.description ?? '',
        contactName: editing.contactName ?? '',
        contactEmail: editing.contactEmail ?? '',
        contactPhone: editing.contactPhone ?? '',
        website: editing.website ?? '',
        audience: editing.audience,
        isUrgentAvailable: editing.isUrgentAvailable,
      });
    } else {
      setValues({ ...EMPTY_FORM, propertyId: defaultPropertyId });
    }
  }, [open, editing, defaultPropertyId]);

  const set = <K extends keyof HostProviderFormValues>(key: K, value: HostProviderFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const valid = hostProviderFormError(values) === null && values.propertyId !== '';

  async function submit() {
    if (!valid || submitting) return;
    const clientError = hostProviderFormError(values);
    if (clientError) {
      toast.error(clientError);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        editing ? `/api/airbnb/host-providers?id=${encodeURIComponent(editing.id)}` : '/api/airbnb/host-providers',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId: values.propertyId,
            name: values.name.trim(),
            emoji: values.emoji,
            category: values.category,
            description: values.description.trim(),
            contactName: values.contactName.trim(),
            contactEmail: values.contactEmail.trim(),
            contactPhone: values.contactPhone.trim(),
            website: values.website.trim(),
            audience: values.audience,
            isUrgentAvailable: values.isUrgentAvailable,
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        editing
          ? `${values.name.trim()} mis à jour ✓`
          : `${values.name.trim()} ajouté à « ${properties.find((p) => p.id === values.propertyId)?.name ?? 'votre bien'} » ✓`,
      );
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      console.error('[ProvidersContent] host provider save failed:', err);
      toast.error(
        err instanceof Error && err.message !== 'Loading failed'
          ? `Enregistrement impossible : ${err.message}`
          : 'Enregistrement impossible — réessayez dans un instant.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Modifier mon prestataire' : 'Ajouter mon prestataire'}
      description="Votre propre prestataire (plombier, baby-sitter…) rattaché à un bien précis, hors annuaire RoomScan. Selon l'audience choisie, il peut apparaître dans le hub de vos invités."
      size="md"
      footer={
        <>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <button
            type="button"
            className={AIR_CTA_CLASS}
            onClick={() => void submit()}
            disabled={!valid || submitting}
            aria-label={editing ? 'Enregistrer les modifications' : 'Ajouter ce prestataire'}
          >
            {submitting ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter le prestataire'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-provider-property">Bien concerné</Label>
        <Select value={values.propertyId} onValueChange={(v) => set('propertyId', v)} disabled={Boolean(editing)}>
          <SelectTrigger id="host-provider-property" className="w-full">
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
        <Label htmlFor="host-provider-name">Nom du prestataire *</Label>
        <Input
          id="host-provider-name"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="ex : Plomberie Dupont"
          maxLength={80}
          autoComplete="off"
          aria-required="true"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Pastille</Label>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Choisir une pastille emoji">
          {HOST_PROVIDER_EMOJIS.map((emoji) => {
            const active = values.emoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => set('emoji', emoji)}
                aria-pressed={active}
                aria-label={`Pastille ${emoji}`}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/50',
                  active
                    ? 'border-[#5cadf0]/60 bg-[#5cadf0]/10 shadow-sm'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-provider-category">Catégorie</Label>
        <Select value={values.category} onValueChange={(v) => set('category', v)}>
          <SelectTrigger id="host-provider-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOST_PROVIDER_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-provider-description">Description / note de l&apos;hôte</Label>
        <Textarea
          id="host-provider-description"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="ex : Mon plombier depuis 5 ans, intervient le jour même — dire que l'on vient de la part de Marie."
          rows={3}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">{values.description.length}/500 caractères</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="host-provider-contact-name">Contact (nom)</Label>
          <Input
            id="host-provider-contact-name"
            value={values.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            placeholder="ex : Paul Dupont"
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="host-provider-contact-email">Email</Label>
          <Input
            id="host-provider-contact-email"
            type="email"
            value={values.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            placeholder="contact@exemple.fr"
            maxLength={120}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="host-provider-contact-phone">Téléphone</Label>
          <Input
            id="host-provider-contact-phone"
            type="tel"
            value={values.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
            placeholder="+33 6 12 34 56 78"
            maxLength={30}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="host-provider-website">Site web</Label>
          <Input
            id="host-provider-website"
            value={values.website}
            onChange={(e) => set('website', e.target.value)}
            placeholder="plomberie-dupont.fr"
            maxLength={200}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-provider-audience">Audience</Label>
        <Select
          value={values.audience}
          onValueChange={(v) => set('audience', v as ProviderAudience)}
        >
          <SelectTrigger id="host-provider-audience" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OWNER_SERVICE">Pour moi (hôte)</SelectItem>
            <SelectItem value="GUEST_EXPERIENCE">Expérience invité</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          « Expérience invité » rend le prestataire visible dans le hub de vos voyageurs (s&apos;il est activé).
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2.5">
        <div className="min-w-0">
          <Label htmlFor="host-provider-urgent" className="font-semibold text-foreground">
            Disponible pour les urgences
          </Label>
          <p className="text-xs text-muted-foreground">Intervention rapide en cas de problème (fuite, panne…).</p>
        </div>
        <Switch
          id="host-provider-urgent"
          checked={values.isUrgentAvailable}
          onCheckedChange={(v) => set('isUrgentAvailable', v)}
          aria-label="Disponible pour les urgences"
        />
      </div>
    </FormDialog>
  );
}

// -------------------------------------------------------------
// Conteneur de page
// -------------------------------------------------------------
export function ProvidersContent() {
  const { properties, selectedProperty, propertiesLoading } = useHostContext();
  const { ownerServices, guestExperiences, property, hasGeoloc, loading, error, refetch } = useProviders();

  const [tab, setTab] = useState<TabKey>('OWNER_SERVICE');
  const [requestOpen, setRequestOpen] = useState(false);
  // v4.32 — toggle ACTIVER/DÉSACTIVER par prestataire (optimiste).
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── v4.69 — PHASE 2 · « Mon prestataire » (HostProvider) ──
  // Même bien que l'annuaire : sélection du header, sinon le bien
  // résolu par useProviders (fallback properties[0] côté API).
  const targetPropertyId = useMemo(
    () => selectedProperty?.id ?? property?.id ?? properties[0]?.id ?? '',
    [selectedProperty, property, properties],
  );
  const [hostProviders, setHostProviders] = useState<HostProviderItem[]>([]);
  const [hostLoading, setHostLoading] = useState(false);
  const [hostDialogOpen, setHostDialogOpen] = useState(false);
  const [editingHostProvider, setEditingHostProvider] = useState<HostProviderItem | null>(null);
  const [deletingHostProvider, setDeletingHostProvider] = useState<HostProviderItem | null>(null);
  const [hostTogglingId, setHostTogglingId] = useState<string | null>(null);
  const [hostDeleting, setHostDeleting] = useState(false);

  const loadHostProviders = useCallback(async () => {
    if (!targetPropertyId) {
      setHostProviders([]);
      return;
    }
    setHostLoading(true);
    try {
      const res = await fetch(
        `/api/airbnb/host-providers?propertyId=${encodeURIComponent(targetPropertyId)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: HostProviderItem[] };
      setHostProviders(data.items ?? []);
    } catch (err) {
      console.error('[ProvidersContent] host providers fetch failed:', err);
      toast.error('Impossible de charger vos prestataires perso.');
    } finally {
      setHostLoading(false);
    }
  }, [targetPropertyId]);

  useEffect(() => {
    void loadHostProviders();
  }, [loadHostProviders]);

  const handleHostToggle = async (provider: HostProviderItem, isActive: boolean) => {
    setHostTogglingId(provider.id);
    try {
      const res = await fetch(`/api/airbnb/host-providers?id=${encodeURIComponent(provider.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(j.error || 'Action impossible.');
        return;
      }
      toast.success(
        isActive
          ? `${provider.name} activé ✓ — visible dans les services invités.`
          : `${provider.name} désactivé — masqué côté invité.`,
      );
      await loadHostProviders();
    } catch {
      toast.error('Erreur réseau. Réessayez.');
    } finally {
      setHostTogglingId(null);
    }
  };

  const handleHostDelete = async () => {
    const provider = deletingHostProvider;
    if (!provider || hostDeleting) return;
    setHostDeleting(true);
    try {
      const res = await fetch(`/api/airbnb/host-providers?id=${encodeURIComponent(provider.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(j.error || 'Suppression impossible.');
        return;
      }
      toast.success(`${provider.name} supprimé.`);
      setDeletingHostProvider(null);
      await loadHostProviders();
    } catch {
      toast.error('Erreur réseau. Réessayez.');
    } finally {
      setHostDeleting(false);
    }
  };

  const openCreateHostProvider = () => {
    setEditingHostProvider(null);
    setHostDialogOpen(true);
  };

  const openEditHostProvider = (provider: HostProviderItem) => {
    setEditingHostProvider(provider);
    setHostDialogOpen(true);
  };

  const handleToggle = async (provider: NearbyProvider, enabled: boolean) => {
    setTogglingId(provider.id);
    try {
      const res = await fetch('/api/airbnb/providers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: provider.id, enabled }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(j.error || 'Action impossible.');
        return;
      }
      toast.success(
        enabled
          ? `${provider.businessName} activé ✓ — visible côté invité.`
          : `${provider.businessName} désactivé — masqué côté invité.`,
      );
      await refetch();
    } catch {
      toast.error('Erreur réseau. Réessayez.');
    } finally {
      setTogglingId(null);
    }
  };

  const audienceMeta = PROVIDER_AUDIENCE_META;
  const counts: Record<TabKey, number> = {
    OWNER_SERVICE: ownerServices.length + hostProviders.filter((h) => h.audience === 'OWNER_SERVICE').length,
    GUEST_EXPERIENCE: guestExperiences.length + hostProviders.filter((h) => h.audience === 'GUEST_EXPERIENCE').length,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="lux-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Prestataires
          </h1>
          <p className="mt-1.5 truncate text-sm text-[#8fabc2]">{subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* v4.69 — PHASE 2 · bouton primaire « Mon prestataire » */}
          <button
            type="button"
            className={cn(AIR_CTA_CLASS, 'shrink-0')}
            onClick={openCreateHostProvider}
            aria-label="Ajouter mon propre prestataire"
          >
            Mon prestataire
          </button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
            onClick={() => setRequestOpen(true)}
            aria-label="Demander un prestataire"
          >
            <span className="hidden sm:inline">Demander un prestataire</span>
            <span className="sm:hidden">Demander</span>
          </Button>
        </div>
      </div>

      {/* ---------- Bannière géolocalisation manquante ---------- */}
      {!loading && property && !hasGeoloc && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 rounded-2xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 px-4 py-3 sm:flex-row sm:items-center"
          role="status"
        >
          <p className="flex-1 text-sm text-[#f3d795]">
            <span className="font-semibold">Géolocalisation manquante</span> — ajoutez la
            géolocalisation de votre bien pour découvrir les prestataires autour de lui
          </p>
          <Link
            href="/airbnb/properties"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[#e9c47c] px-4 text-xs font-bold text-[#1a1206] shadow-sm transition-colors hover:bg-[#f3d795] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c47c]/50"
            aria-label="Modifier le bien pour ajouter la géolocalisation"
          >
            Modifier le bien
          </Link>
        </motion.div>
      )}

      {/* ---------- Erreur API ---------- */}
      {error && (
        <div
          className="lux-card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
          role="alert"
        >
          <span className="lux-dot shrink-0" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-medium text-[#f6a293]">{error}</p>
          <button
            type="button"
            className={cn(AIR_CTA_CLASS, 'shrink-0')}
            onClick={() => void refetch()}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ---------- Aucun bien ---------- */}
      {!propertiesLoading && properties.length === 0 && (
        <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
          <p className="lux-display text-lg text-white">Aucun bien dans votre portfolio</p>
          <p className="max-w-md text-sm text-[#8fabc2]">
            Ajoutez votre première propriété pour découvrir les prestataires autour d&apos;elle.
          </p>
          <Link
            href="/airbnb/properties?new=1"
            className={AIR_CTA_CLASS}
          >
            Ajouter une propriété
          </Link>
        </div>
      )}

      {/* ---------- Onglets + grille ---------- */}
      {!propertiesLoading && properties.length > 0 && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="min-w-0">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 sm:w-fit">
            {(Object.keys(audienceMeta) as TabKey[]).map((key) => {
              const meta = audienceMeta[key];
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8fabc2] data-[state=active]:bg-white/10 data-[state=active]:text-white"
                  aria-label={`${meta.label} : ${counts[key]} prestataire${counts[key] > 1 ? 's' : ''}`}
                >
                  <span className="hidden sm:inline">{meta.label}</span>
                  <span className="sm:hidden">{meta.label.split(' ')[1] ?? meta.label}</span>
                  <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/8 px-1.5 text-[10px] font-semibold text-[#8fabc2]">
                    {counts[key]}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(audienceMeta) as TabKey[]).map((key) => {
            const meta = audienceMeta[key];
            const list = key === 'OWNER_SERVICE' ? ownerServices : guestExperiences;
            // v4.69 — PHASE 2 · les « Mon prestataire » de l'audience
            // apparaissent EN PREMIER, avec badge distinctif.
            const hostList = hostProviders.filter((h) => h.audience === key);
            return (
              <TabsContent key={key} value={key} className="mt-4 min-w-0">
                <p className="mb-4 text-sm text-[#8fabc2]">{meta.hint}</p>

                {loading || hostLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Chargement des prestataires">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="lux-card p-5">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-11 w-11 rounded-xl bg-white/8" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4 bg-white/8" />
                            <Skeleton className="h-3 w-1/2 bg-white/8" />
                          </div>
                        </div>
                        <Skeleton className="mt-4 h-3 w-2/3 bg-white/8" />
                        <Skeleton className="mt-2 h-3 w-1/2 bg-white/8" />
                        <Skeleton className="mt-4 h-9 w-28 rounded-full bg-white/8" />
                      </div>
                    ))}
                  </div>
                ) : hostList.length === 0 && list.length === 0 ? (
                  <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
                    <p className="lux-display max-w-lg text-lg text-white">
                      Aucun prestataire {meta.label.toLowerCase()} à moins de {SEARCH_RADIUS_KM} km
                      autour de ce bien
                    </p>
                    <p className="max-w-md text-sm text-[#8fabc2]">{meta.hint}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        className={AIR_CTA_CLASS}
                        onClick={openCreateHostProvider}
                        aria-label="Ajouter mon propre prestataire"
                      >
                        Mon prestataire
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
                        onClick={() => setRequestOpen(true)}
                        aria-label="Demander un prestataire"
                      >
                        Demander un prestataire
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {hostList.map((h) => (
                      <HostProviderCard
                        key={h.id}
                        provider={h}
                        onToggle={(provider, isActive) => void handleHostToggle(provider, isActive)}
                        onEdit={openEditHostProvider}
                        onDelete={setDeletingHostProvider}
                        toggling={hostTogglingId === h.id}
                      />
                    ))}
                    {list.map((p) => (
                      <ProviderCard
                        key={p.id}
                        provider={p}
                        onToggle={(provider, enabled) => void handleToggle(provider, enabled)}
                        toggling={togglingId === p.id}
                      />
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

      {/* ---------- Modale « Mon prestataire » (création / édition) ---------- */}
      {hostDialogOpen && (
        <HostProviderDialog
          open
          onOpenChange={setHostDialogOpen}
          editing={editingHostProvider}
          defaultPropertyId={targetPropertyId || defaultPropertyId}
          onSaved={loadHostProviders}
        />
      )}

      {/* ---------- Confirmation de suppression d'un « Mon prestataire » ---------- */}
      <AlertDialog
        open={deletingHostProvider !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingHostProvider(null);
        }}
      >
        <AlertDialogContent className="border-white/10 bg-[#0b1226] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display text-lg font-semibold text-white">
              Supprimer ce prestataire ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#8fabc2]">
              « {deletingHostProvider?.name ?? ''} » sera définitivement retiré de ce bien
              {deletingHostProvider?.audience === 'GUEST_EXPERIENCE'
                ? ' et disparaîtra des services invités du hub.'
                : '.'}{' '}
              Action irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={hostDeleting}
              className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-[#f07d6a] text-white hover:bg-[#f8957f] focus-visible:ring-[#f07d6a]/40"
              onClick={(e) => {
                e.preventDefault();
                void handleHostDelete();
              }}
              disabled={hostDeleting}
            >
              {hostDeleting ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        'Demande envoyée — l’équipe RoomScan vous recontacte sous 24 h',
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
      title="Demander un prestataire"
      description="Décrivez votre besoin : l'équipe RoomScan recherche un prestataire vérifié pour vous et vous recontacte sous 24 h."
      size="sm"
      footer={
        <>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <button
            type="button"
            className={AIR_CTA_CLASS}
            onClick={() => void submit()}
            disabled={!valid || submitting}
            aria-label="Envoyer la demande de prestataire"
          >
            {submitting ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider-request-property">Bien concerné</Label>
        <Select value={propertyId} onValueChange={setPropertyId}>
          <SelectTrigger id="provider-request-property" className="w-full">
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
          <SelectTrigger id="provider-request-audience" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PROVIDER_AUDIENCE_META) as ProviderAudience[]).map((key) => (
              <SelectItem key={key} value={key}>
                {PROVIDER_AUDIENCE_META[key].label}
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
        <p className="text-xs text-muted-foreground">{details.length}/1500 caractères</p>
      </div>
    </FormDialog>
  );
}

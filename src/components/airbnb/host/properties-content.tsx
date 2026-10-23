'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, type Variants } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/airbnb/host/status-badge';
import { useHostContext, type HostProperty } from '@/components/airbnb/host/host-context';
// Task 42-b — modal des badges marketing (PNG HD + code HTML)
import { MarketingBadgesModal } from '@/components/airbnb/host/marketing-badges-modal';
import { useCreateProperty, type CreatePropertyResult } from '@/hooks/use-properties';
import { PROPERTY_TYPE_META, propertyTypeMeta } from '@/lib/b2b';
import { cn } from '@/lib/utils';
// v4.43 — autocomplétion d'adresse (Google Places / OpenStreetMap) :
// adresse complète + latitude/longitude exactes stockées en base.
import { AddressAutocomplete } from '@/components/airbnb/host/address-autocomplete';

// =============================================================
// PropertiesContent — page « Mes Propriétés » du Dashboard Client
// v5.2 « SAPHIR LUXE » — refonte design profonde (demande client) :
// mode sombre bleuté, SANS ICÔNES ni emojis (typographie, points
// colorés, monogrammes). Données, handlers et textes métier intacts.
//
// • Grille de PropertyCards (monogramme par bien, stats 30j réelles,
//   actions Voir / Modifier / Équipe + lien Hub public)
// • Wizard d'ajout 3 étapes (Informations → Configuration →
//   Plaque QR) branché sur useCreateProperty + POST /api/airbnb/plaques
// • Modale d'édition → PATCH /api/airbnb/properties/{id}
// • Bandeau de capacité de plan + bannière d'invitations
// =============================================================

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  MANAGER: 'Manager',
  CLEANER: 'Ménage',
  MAINTENANCE: 'Maintenance',
};

const WIZARD_STEPS = ['Informations', 'Configuration', 'Plaque QR'] as const;

/** Plaque QR renvoyée par POST /api/airbnb/plaques. */
interface GeneratedPlaque {
  id: string;
  hubSlug: string | null;
  status: string;
  activationCode: string;
}

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

// =============================================================
// Composant racine
// =============================================================

export function PropertiesContent({ openWizardOnInit = false }: { openWizardOnInit?: boolean }) {
  const router = useRouter();
  const { properties, propertiesLoading, propertiesError, plan, invitations, setSelectedId } =
    useHostContext();

  const [wizardOpen, setWizardOpen] = useState(openWizardOnInit);
  const [editTarget, setEditTarget] = useState<HostProperty | null>(null);
  // Task 42-b — propriete dont on ouvre les badges marketing
  const [badgesProperty, setBadgesProperty] = useState<HostProperty | null>(null);

  const openWizard = useCallback(() => setWizardOpen(true), []);

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Portfolio</p>
          <h1 className="lux-display mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Mes Propriétés
          </h1>
          <p className="mt-1.5 text-xs text-[#8fabc2] sm:text-sm">
            {properties.length} bien{properties.length > 1 ? 's' : ''} géré
            {properties.length > 1 ? 's' : ''}
            {plan ? (
              <>
                {' '}
                · Plan <span className="font-semibold text-white">{plan.planName}</span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={openWizard}
          className="lux-btn h-9 w-full sm:w-auto"
          aria-label="Ajouter une propriété"
        >
          Ajouter une propriété
        </button>
      </div>

      {/* ---------- Bandeau de capacité (limite de plan atteinte) ---------- */}
      {plan && !plan.canAddProperty && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 px-4 py-3"
          role="status"
        >
          <span className="lux-dot shrink-0" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-[#e9c47c]">
            <span className="font-bold">
              Limite du plan atteinte ({plan.ownedCount}/{plan.maxProperties})
            </span>{' '}
            — passez à Airbnb Pro pour gérer jusqu&apos;à 10 biens et inviter une équipe.
          </p>
          <Link
            href="/airbnb/billing"
            className="inline-flex h-8 shrink-0 items-center rounded-full bg-[#e9c47c] px-3 text-xs font-semibold text-[#1a1206] transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c47c]/50"
          >
            Découvrir les offres
          </Link>
        </motion.div>
      )}

      {/* ---------- Bannière invitations en attente ---------- */}
      {invitations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 px-4 py-3"
          role="status"
        >
          <span className="lux-dot shrink-0" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-[#e9c47c]">
            <span className="font-bold">Invitation</span> — {invitations[0].property.name} (
            {ROLE_LABELS[invitations[0].role] ?? invitations[0].role})
            {invitations.length > 1 && ` + ${invitations.length - 1} autre(s)`} — gérer dans Équipe
          </p>
          <Link
            href="/airbnb/team"
            className="inline-flex h-8 shrink-0 items-center rounded-full bg-[#e9c47c] px-3 text-xs font-semibold text-[#1a1206] transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9c47c]/50"
          >
            Voir l&apos;invitation
          </Link>
        </motion.div>
      )}

      {/* ---------- Erreur API ---------- */}
      {propertiesError && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-[#f07d6a]/25 bg-[#f07d6a]/10 px-4 py-3 text-sm text-[#f07d6a]"
          role="alert"
        >
          <span className="lux-dot shrink-0" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
          {propertiesError}
        </div>
      )}

      {/* ---------- Grille / empty state / chargement ---------- */}
      {propertiesLoading ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="Chargement des propriétés"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="lux-card overflow-hidden">
              <Skeleton className="h-20 w-full rounded-none bg-white/8" aria-hidden="true" />
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-5 w-2/3 bg-white/8" aria-hidden="true" />
                <Skeleton className="h-4 w-4/5 bg-white/8" aria-hidden="true" />
                <Skeleton className="h-10 w-full bg-white/8" aria-hidden="true" />
                <Skeleton className="h-9 w-full bg-white/8" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        <EmptyState onAdd={openWizard} />
      ) : (
        <motion.section
          aria-label="Vos propriétés"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          variants={gridVariants}
          initial="hidden"
          animate="show"
        >
          {properties.map((p, i) => (
            <PropertyCard
              key={p.id}
              property={p}
              index={i}
              onEdit={() => setEditTarget(p)}
              onView={() => {
                setSelectedId(p.id);
                router.push('/airbnb/dashboard');
              }}
              onTeam={() => router.push(`/airbnb/team?property=${p.id}`)}
              onBadges={() => setBadgesProperty(p)}
            />
          ))}
        </motion.section>
      )}

      {/* ---------- Overlays ---------- */}
      <AddPropertyWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <EditPropertyDialog
        property={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      />
      {/* Task 42-b — badges marketing (PNG HD + code HTML) */}
      <MarketingBadgesModal
        propertyId={badgesProperty?.id ?? ''}
        propertyName={badgesProperty?.name ?? ''}
        open={badgesProperty !== null}
        onClose={() => setBadgesProperty(null)}
      />
    </div>
  );
}

// =============================================================
// PropertyCard — carte d'un bien du portfolio
// =============================================================

interface PropertyCardProps {
  property: HostProperty;
  index: number;
  onView: () => void;
  onEdit: () => void;
  onTeam: () => void;
  onBadges: () => void;
}

function PropertyCard({ property: p, index, onView, onEdit, onTeam, onBadges }: PropertyCardProps) {
  const typeMeta = propertyTypeMeta(p.propertyType);
  const canManage = p.isOwner || p.myRole === 'OWNER' || p.myRole === 'MANAGER';

  return (
    <motion.article
      variants={cardVariants}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24), ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      className="lux-card lux-card-hover group flex min-w-0 flex-col overflow-hidden"
    >
      {/* Bandeau : monogramme + type + statut */}
      <div className="relative flex h-20 shrink-0 items-center gap-3 border-b border-white/8 bg-white/[0.03] px-4">
        <span
          aria-hidden="true"
          className="lux-num flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#3d97e0]/15 text-lg font-semibold text-[#a9d8ff] ring-1 ring-[#5cadf0]/25"
        >
          {p.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="lux-eyebrow !text-[9.5px]">{typeMeta.label}</p>
        </div>
        <span className="sr-only">{`Type : ${typeMeta.label}`}</span>
        <StatusBadge status={p.isActive ? 'active' : 'inactive'} className="shrink-0" />
      </div>

      {/* Corps : nom + rôle + adresse + lien hub */}
      <div className="min-w-0 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="lux-display min-w-0 truncate text-lg font-semibold text-white" title={p.name}>
            {p.name}
          </h3>
          <StatusBadge
            status={p.myRole}
            label={p.isOwner ? 'Propriétaire' : (ROLE_LABELS[p.myRole] ?? p.myRole)}
            className="shrink-0"
          />
        </div>
        <p className="mt-1.5 truncate text-sm text-[#8fabc2]" title={p.address ?? undefined}>
          {p.address ?? 'Adresse non renseignée'}
        </p>
        {p.qrHubSlug && (
          <a
            href={`/hub/${p.qrHubSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#a9d8ff] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/50"
            aria-label={`Ouvrir le Hub public de ${p.name} dans un nouvel onglet`}
          >
            <span aria-hidden="true">→</span>
            Voir le Hub public
          </a>
        )}
      </div>

      {/* Stats 30 jours */}
      <div className="grid grid-cols-4 divide-x divide-white/8 border-y border-white/8 bg-white/[0.02] px-2 py-3 text-center">
        <div className="min-w-0">
          <p className="lux-num truncate text-sm font-semibold text-white" title={`${p.stats.scans30d}`}>
            {p.stats.scans30d}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#8fabc2]/70">scans</p>
        </div>
        <div className="min-w-0">
          <p
            className="lux-num truncate text-sm font-semibold text-white"
            title={`${Math.round(p.stats.upsellRevenue30d)} €`}
          >
            {Math.round(p.stats.upsellRevenue30d)} €
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#8fabc2]/70">upsell 30j</p>
        </div>
        <div className="min-w-0">
          <p className="lux-num truncate text-sm font-semibold text-white">
            {Math.round(p.stats.occupancyRate * 100)}%
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#8fabc2]/70">occ.</p>
        </div>
        <div className="min-w-0">
          <p className="lux-num truncate text-sm font-semibold text-white" title={`${p.stats.qrCount}`}>
            {p.stats.qrCount}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#8fabc2]/70">QR</p>
        </div>
      </div>

      {/* Actions — Task 42-b : grille 2x2 sur mobile (4 boutons), rangee unique a partir de sm */}
      <div className="mt-auto grid grid-cols-2 gap-2 p-3 sm:flex">
        <Button
          variant="outline"
          className="h-9 flex-1 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
          onClick={onView}
          aria-label={`Voir le tableau de bord de ${p.name}`}
        >
          Voir
        </Button>
        {canManage && (
          <Button
            variant="outline"
            className="h-9 flex-1 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
            onClick={onEdit}
            aria-label={`Modifier ${p.name}`}
          >
            Modifier
          </Button>
        )}
        <Button
          variant="outline"
          className="h-9 flex-1 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
          onClick={onTeam}
          aria-label={`Gérer l'équipe de ${p.name}`}
        >
          Équipe
        </Button>
        <Button
          variant="outline"
          className="h-9 flex-1 rounded-full border-white/12 bg-white/[0.04] text-xs font-semibold text-[#d5def0] hover:bg-white/8 hover:text-white"
          onClick={onBadges}
          aria-label={`Badges marketing de ${p.name}`}
        >
          🏅 Badges
        </Button>
      </div>
    </motion.article>
  );
}

// =============================================================
// EmptyState — aucune propriété
// =============================================================

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="lux-empty flex flex-col items-center gap-2 px-6 py-12 text-center"
    >
      <span aria-hidden="true" className="lux-dot" style={{ backgroundColor: '#5cadf0' }} />
      <h2 className="lux-display mt-2 text-lg font-semibold text-white">
        Créez votre première propriété
      </h2>
      <p className="mx-auto mt-1 max-w-md text-xs text-[#8fabc2]">
        Ajoutez votre bien pour générer sa plaque QR, son Hub public voyageurs et centraliser
        scans, services, équipe et calendrier.
      </p>
      <button type="button" onClick={onAdd} className="lux-btn mt-4 w-full sm:w-auto" aria-label="Ajouter une première propriété">
        Ajouter une propriété
      </button>
    </motion.div>
  );
}

// =============================================================
// Stepper — 3 points numérotés reliés (wizard)
// =============================================================

function Stepper({ step }: { step: number }) {
  return (
    <ol
      className="flex items-center gap-2"
      aria-label={`Étape ${step} sur 3 : ${WIZARD_STEPS[step - 1]}`}
    >
      {WIZARD_STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                done && 'bg-[#3d97e0] text-white',
                current && 'border border-[#e9c47c] bg-[#e9c47c]/10 text-[#e9c47c]',
                !done && !current && 'bg-white/[0.05] text-[#8fabc2]',
              )}
            >
              {done ? '✓' : n}
            </span>
            <span
              className={cn(
                'hidden text-xs font-semibold sm:block',
                current ? 'text-white' : 'text-[#8fabc2]',
              )}
            >
              {label}
            </span>
            {n < WIZARD_STEPS.length && (
              <span
                aria-hidden="true"
                className={cn('h-0.5 min-w-4 flex-1 rounded-full', done ? 'bg-[#5cadf0]/50' : 'bg-white/10')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// =============================================================
// AddPropertyWizard — création en 3 étapes
// =============================================================

interface AddPropertyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AddPropertyWizard({ open, onOpenChange }: AddPropertyWizardProps) {
  const router = useRouter();
  const { createProperty } = useCreateProperty();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('AIRBNB');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [hubPin, setHubPin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [limitHit, setLimitHit] = useState<{ message: string } | null>(null);
  const [created, setCreated] = useState<NonNullable<CreatePropertyResult['property']> | null>(null);
  const [plaque, setPlaque] = useState<GeneratedPlaque | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setName('');
    setAddress('');
    setPropertyType('AIRBNB');
    setLatitude('');
    setLongitude('');
    setHubPin('');
    setErrors({});
    setSubmitting(false);
    setGenerating(false);
    setLimitHit(null);
    setCreated(null);
    setPlaque(null);
  }, []);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) reset();
    },
    [onOpenChange, reset],
  );

  // ----- Validation étape 1 -----
  const validateStep1 = useCallback((): boolean => {
    const next: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      next.name = 'Le nom doit contenir entre 2 et 80 caractères.';
    }
    if (!trimmedAddress) {
      next.address = "L'adresse du bien est requise.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [name, address]);

  // ----- Validation étape 2 (coordonnées + PIN) -----
  const validateStep2 = useCallback((): boolean => {
    const next: Record<string, string> = {};
    const lat = latitude.trim();
    const lng = longitude.trim();
    const pin = hubPin.trim();
    if (lat) {
      const num = Number(lat.replace(',', '.'));
      if (!Number.isFinite(num) || num < -90 || num > 90) {
        next.latitude = 'Latitude invalide (entre -90 et 90).';
      }
    }
    if (lng) {
      const num = Number(lng.replace(',', '.'));
      if (!Number.isFinite(num) || num < -180 || num > 180) {
        next.longitude = 'Longitude invalide (entre -180 et 180).';
      }
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      next.hubPin = 'Le PIN doit contenir exactement 4 chiffres.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [latitude, longitude, hubPin]);

  // ----- Soumission étape 2 → 3 -----
  const handleSubmit = useCallback(async () => {
    if (!validateStep2()) return;
    setSubmitting(true);
    setLimitHit(null);
    const latNum = latitude.trim() ? Number(latitude.trim().replace(',', '.')) : null;
    const lngNum = longitude.trim() ? Number(longitude.trim().replace(',', '.')) : null;
    const result = await createProperty({
      name: name.trim(),
      address: address.trim(),
      propertyType,
      latitude: latNum,
      longitude: lngNum,
      hubPin: hubPin.trim() || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      if (result.status === 403 && result.upgrade) {
        // Limite de plan atteinte : toast + rester sur l'étape 2 + offre upgrade
        toast.error(result.message ?? result.error ?? 'Limite du plan atteinte.');
        setLimitHit({
          message: result.message ?? result.error ?? 'Limite du plan atteinte.',
        });
      } else {
        toast.error(result.error ?? 'Erreur lors de la création du bien.');
      }
      return;
    }
    setCreated(result.property ?? null);
    toast.success('Bien créé avec succès 🎉');
    setStep(3);
  }, [address, createProperty, hubPin, latitude, longitude, name, propertyType, validateStep2]);

  // ----- Génération de la plaque QR (étape 3) -----
  const handleGeneratePlaque = useCallback(async () => {
    if (!created) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/airbnb/plaques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: created.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { plaque?: GeneratedPlaque; error?: string };
      if (!res.ok || !data.plaque) {
        toast.error(data.error ?? 'Erreur lors de la génération de la plaque.');
        return;
      }
      setPlaque(data.plaque);
      toast.success('Plaque QR générée 📱');
    } catch (error) {
      console.error('[AddPropertyWizard] plaque generation failed:', error);
      toast.error('Erreur réseau. Réessayez dans un instant.');
    } finally {
      setGenerating(false);
    }
  }, [created]);

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copié !`);
    } catch {
      toast.error('Copie impossible — sélectionnez le texte manuellement.');
    }
  }, []);

  const hubUrl =
    plaque?.hubSlug != null
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/hub/${plaque.hubSlug}`
      : null;

  const stepTitles: Record<number, { title: string; description: string }> = {
    1: {
      title: 'Ajouter une propriété',
      description: 'Étape 1/3 — Renseignez les informations principales de votre bien.',
    },
    2: {
      title: 'Ajouter une propriété',
      description: 'Étape 2/3 — Configuration optionnelle : géolocalisation et PIN Mode Hôte.',
    },
    3: {
      title: 'Ajouter une propriété',
      description: 'Étape 3/3 — Votre bien est créé : générez sa plaque QR pour le Hub public.',
    },
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-white/10 bg-[#0b1226] text-white shadow-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="lux-display text-xl font-semibold text-white">
            {stepTitles[step].title}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#8fabc2]">
            {stepTitles[step].description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Stepper step={step} />

          {/* ---------- Étape 1 : Informations ---------- */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wizard-name" className="text-[#8fabc2]">Nom du bien *</Label>
                <Input
                  id="wizard-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex : Loft Canal Saint-Martin"
                  maxLength={80}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'wizard-name-error' : undefined}
                  className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                />
                {errors.name && (
                  <p id="wizard-name-error" className="text-xs font-medium text-[#f07d6a]">
                    {errors.name}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wizard-address" className="text-[#8fabc2]">Adresse *</Label>
                {/* v4.43 — autocomplétion : l'hôte tape les premières lettres,
                    choisit l'adresse → texte complet + lat/lng remplis auto. */}
                <AddressAutocomplete
                  id="wizard-address"
                  value={address}
                  onChange={(v) => {
                    setAddress(v);
                  }}
                  onSelect={(pick) => {
                    setAddress(pick.label);
                    if (pick.lat != null && pick.lng != null) {
                      setLatitude(String(pick.lat));
                      setLongitude(String(pick.lng));
                    }
                  }}
                  invalid={Boolean(errors.address)}
                  describedBy={errors.address ? 'wizard-address-error' : undefined}
                />
                <p className="text-[11px] text-[#8fabc2]">
                  Tapez les premières lettres : l&apos;adresse se complète et la position GPS
                  (latitude/longitude) est extraite automatiquement — activée pour le bouton
                  « Retour à la maison » des invités.
                </p>
                {errors.address && (
                  <p id="wizard-address-error" className="text-xs font-medium text-[#f07d6a]">
                    {errors.address}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wizard-type" className="text-[#8fabc2]">Type de bien</Label>
                <Select value={propertyType} onValueChange={setPropertyType}>
                  <SelectTrigger
                    id="wizard-type"
                    className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white"
                    aria-label="Type de bien"
                  >
                    <SelectValue placeholder="Choisir un type" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                    {Object.entries(PROPERTY_TYPE_META).map(([key, meta]) => (
                      <SelectItem key={key} value={key} className="focus:bg-white/8 focus:text-white">
                        {meta.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ---------- Étape 2 : Configuration ---------- */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              {limitHit && (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e9c47c]/25 bg-[#e9c47c]/8 px-3 py-2.5 text-sm text-[#e9c47c]"
                  role="alert"
                >
                  <span className="lux-dot shrink-0" style={{ backgroundColor: '#e9c47c' }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 font-medium">{limitHit.message}</span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wizard-lat" className="text-[#8fabc2]">Latitude</Label>
                  <Input
                    id="wizard-lat"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="48.8566"
                    inputMode="decimal"
                    aria-invalid={Boolean(errors.latitude)}
                    aria-describedby={errors.latitude ? 'wizard-lat-error' : 'wizard-coords-help'}
                    className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                  />
                  {errors.latitude && (
                    <p id="wizard-lat-error" className="text-xs font-medium text-[#f07d6a]">
                      {errors.latitude}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wizard-lng" className="text-[#8fabc2]">Longitude</Label>
                  <Input
                    id="wizard-lng"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="2.3522"
                    inputMode="decimal"
                    aria-invalid={Boolean(errors.longitude)}
                    aria-describedby={errors.longitude ? 'wizard-lng-error' : 'wizard-coords-help'}
                    className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
                  />
                  {errors.longitude && (
                    <p id="wizard-lng-error" className="text-xs font-medium text-[#f07d6a]">
                      {errors.longitude}
                    </p>
                  )}
                </div>
              </div>
              <p id="wizard-coords-help" className="text-xs text-[#8fabc2]">
                Utilisez maps.google.com pour trouver les coordonnées — nécessaires pour
                l&apos;annuaire de prestataires géolocalisé.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wizard-pin" className="text-[#8fabc2]">PIN Mode Hôte (optionnel)</Label>
                <Input
                  id="wizard-pin"
                  type="password"
                  value={hubPin}
                  onChange={(e) => setHubPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.hubPin)}
                  aria-describedby={errors.hubPin ? 'wizard-pin-error' : 'wizard-pin-help'}
                  className={cn(
                    'w-40 rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50',
                    errors.hubPin && 'border-[#f07d6a]/60 focus-visible:ring-[#f07d6a]/50',
                  )}
                />
                {errors.hubPin ? (
                  <p id="wizard-pin-error" className="text-xs font-medium text-[#f07d6a]">
                    {errors.hubPin}
                  </p>
                ) : (
                  <p id="wizard-pin-help" className="text-xs text-[#8fabc2]">
                    Protège l&apos;accès tablette/QR du Hub — hashing bcrypt côté serveur.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ---------- Étape 3 : Plaque QR ---------- */}
          {step === 3 && created && (
            <div className="flex flex-col gap-4">
              {/* Résumé du bien créé */}
              <div className="flex items-start gap-3 rounded-2xl border border-[#34d399]/25 bg-[#34d399]/8 p-4">
                <span className="lux-dot mt-1.5 shrink-0" style={{ backgroundColor: '#34d399' }} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="lux-display font-semibold text-white">{created.name}</p>
                  <p className="mt-0.5 truncate text-sm text-[#8fabc2]">
                    {address.trim()} · {propertyTypeMeta(propertyType).label}
                  </p>
                </div>
              </div>

              {!plaque ? (
                <div className="lux-empty flex flex-col items-center gap-3 p-6 text-center">
                  <p className="text-xs text-[#8fabc2]">
                    Générez la plaque QR de ce bien : son Hub public sera accessible par scan
                    (Wi-Fi, guidebook, upselling…).
                  </p>
                  <button
                    type="button"
                    className="lux-btn h-9 px-4 text-xs disabled:pointer-events-none disabled:opacity-60"
                    onClick={() => void handleGeneratePlaque()}
                    disabled={generating}
                  >
                    Générer la plaque QR maintenant
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="plaque-code" className="lux-eyebrow !text-[9.5px]">
                        Code d&apos;activation
                      </Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-white/12 bg-white/[0.04] px-3 text-xs text-[#d5def0] hover:bg-white/8 hover:text-white"
                        onClick={() => void copyToClipboard(plaque.activationCode, 'Code')}
                        aria-label="Copier le code d'activation"
                      >
                        Copier
                      </Button>
                    </div>
                    <code
                      id="plaque-code"
                      className="lux-num select-all text-lg font-semibold tracking-[0.2em] text-[#e9c47c]"
                    >
                      {plaque.activationCode}
                    </code>
                  </div>

                  {hubUrl && (
                    <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="lux-eyebrow !text-[9.5px]">Lien du Hub public</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full border-white/12 bg-white/[0.04] px-3 text-xs text-[#d5def0] hover:bg-white/8 hover:text-white"
                          onClick={() => void copyToClipboard(hubUrl, 'Lien')}
                          aria-label="Copier le lien du Hub public"
                        >
                          Copier
                        </Button>
                      </div>
                      <a
                        href={`/hub/${plaque.hubSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-[#a9d8ff] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/50"
                      >
                        <span aria-hidden="true">→</span>
                        <span className="truncate font-semibold">{hubUrl}</span>
                      </a>
                    </div>
                  )}

                  <p className="text-xs text-[#8fabc2]">
                    Imprimez la plaque et posez-la dans le logement — vos voyageurs scannent, tout
                    est là.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Garde : étape 3 sans `created` (ne devrait jamais arriver) */}
          {step === 3 && !created && (
            <p className="text-sm text-[#f07d6a]" role="alert">
              Une erreur est survenue. Fermez et relancez l&apos;assistant.
            </p>
          )}
        </div>
        <DialogFooter className="mt-1 gap-2">
          {step === 1 ? (
            <>
              <Button
                variant="outline"
                className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
                onClick={() => handleClose(false)}
              >
                Annuler
              </Button>
              <button
                type="button"
                className="lux-btn h-9 px-4 text-xs"
                onClick={() => {
                  if (validateStep1()) {
                    setErrors({});
                    setStep(2);
                  } else {
                    toast.error('Veuillez corriger les champs en rouge.');
                  }
                }}
              >
                Continuer
              </button>
            </>
          ) : step === 2 ? (
            <>
              <Button
                variant="outline"
                className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                Retour
              </Button>
              {limitHit && (
                <Button
                  variant="outline"
                  asChild
                  className="rounded-full border-[#e9c47c]/30 bg-[#e9c47c]/10 text-xs font-semibold text-[#e9c47c] hover:bg-[#e9c47c]/20 hover:text-[#e9c47c]"
                >
                  <Link href="/airbnb/billing">Voir les offres</Link>
                </Button>
              )}
              <button
                type="button"
                className="lux-btn h-9 px-4 text-xs disabled:pointer-events-none disabled:opacity-60"
                onClick={() => void handleSubmit()}
                disabled={submitting}
              >
                Créer le bien
              </button>
            </>
          ) : (
            <>
              {plaque && (
                <Button
                  variant="outline"
                  className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
                  onClick={() => router.push(`/airbnb/plates/${plaque.id}/print`)}
                >
                  Imprimer la plaque
                </Button>
              )}
              <button
                type="button"
                className="lux-btn h-9 px-4 text-xs"
                onClick={() => handleClose(false)}
              >
                Terminer
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// EditPropertyDialog — modification d'un bien (PATCH)
// =============================================================

interface EditPropertyDialogProps {
  property: HostProperty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditPropertyDialog({ property, open, onOpenChange }: EditPropertyDialogProps) {
  const { refreshProperties } = useHostContext();

  // Clé = id du bien : l'état interne se réinitialise à chaque ciblage différent.
  return property ? (
    <EditPropertyDialogInner
      key={property.id}
      property={property}
      open={open}
      onOpenChange={onOpenChange}
      refreshProperties={refreshProperties}
    />
  ) : null;
}

interface EditPropertyDialogInnerProps {
  property: HostProperty;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refreshProperties: () => Promise<void>;
}

function EditPropertyDialogInner({
  property,
  open,
  onOpenChange,
  refreshProperties,
}: EditPropertyDialogInnerProps) {
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address ?? '');
  const [propertyType, setPropertyType] = useState(property.propertyType);
  const [latitude, setLatitude] = useState(
    property.latitude != null ? String(property.latitude) : '',
  );
  const [longitude, setLongitude] = useState(
    property.longitude != null ? String(property.longitude) : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setErrors({});
  }, [open]);

  const handleSave = useCallback(async () => {
    const next: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const lat = latitude.trim();
    const lng = longitude.trim();

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      next.name = 'Le nom doit contenir entre 2 et 80 caractères.';
    }
    if (!trimmedAddress) {
      next.address = "L'adresse du bien est requise.";
    }
    if (lat) {
      const num = Number(lat.replace(',', '.'));
      if (!Number.isFinite(num) || num < -90 || num > 90) {
        next.latitude = 'Latitude invalide (entre -90 et 90).';
      }
    }
    if (lng) {
      const num = Number(lng.replace(',', '.'));
      if (!Number.isFinite(num) || num < -180 || num > 180) {
        next.longitude = 'Longitude invalide (entre -180 et 180).';
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          address: trimmedAddress,
          propertyType,
          latitude: lat ? Number(lat.replace(',', '.')) : null,
          longitude: lng ? Number(lng.replace(',', '.')) : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Erreur lors de la mise à jour du bien.');
        return;
      }
      await refreshProperties();
      toast.success('Bien mis à jour ✅');
      onOpenChange(false);
    } catch (error) {
      console.error('[EditPropertyDialog] PATCH failed:', error);
      toast.error('Erreur réseau. Réessayez dans un instant.');
    } finally {
      setSaving(false);
    }
  }, [address, latitude, longitude, name, onOpenChange, property.id, propertyType, refreshProperties]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-white/10 bg-[#0b1226] text-white shadow-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="lux-display text-xl font-semibold text-white">
            {`Modifier « ${property.name} »`}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#8fabc2]">
            Les changements sont visibles immédiatement dans le Hub public.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name" className="text-[#8fabc2]">Nom du bien *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'edit-name-error' : undefined}
              className="rounded-xl border-white/12 bg-white/[0.04] text-white focus-visible:ring-[#5cadf0]/50"
            />
            {errors.name && (
              <p id="edit-name-error" className="text-xs font-medium text-[#f07d6a]">
                {errors.name}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-address" className="text-[#8fabc2]">Adresse *</Label>
            {/* v4.43 — autocomplétion : adresse complète + lat/lng exacts. */}
            <AddressAutocomplete
              id="edit-address"
              value={address}
              onChange={(v) => setAddress(v)}
              onSelect={(pick) => {
                setAddress(pick.label);
                if (pick.lat != null && pick.lng != null) {
                  setLatitude(String(pick.lat));
                  setLongitude(String(pick.lng));
                }
              }}
              invalid={Boolean(errors.address)}
              describedBy={errors.address ? 'edit-address-error' : undefined}
            />
            <p className="text-[11px] text-[#8fabc2]">
              Tapez les premières lettres : l&apos;adresse se complète et la position GPS est
              extraite automatiquement (utilisée par le bouton « Retour à la maison » des invités).
            </p>
            {errors.address && (
              <p id="edit-address-error" className="text-xs font-medium text-[#f07d6a]">
                {errors.address}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-type" className="text-[#8fabc2]">Type de bien</Label>
            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger
                id="edit-type"
                className="w-full rounded-xl border-white/12 bg-white/[0.04] text-white"
                aria-label="Type de bien"
              >
                <SelectValue placeholder="Choisir un type" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0d1530] text-white">
                {Object.entries(PROPERTY_TYPE_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key} className="focus:bg-white/8 focus:text-white">
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lat" className="text-[#8fabc2]">Latitude</Label>
              <Input
                id="edit-lat"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="48.8566"
                inputMode="decimal"
                aria-invalid={Boolean(errors.latitude)}
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
              />
              {errors.latitude && (
                <p className="text-xs font-medium text-[#f07d6a]">{errors.latitude}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lng" className="text-[#8fabc2]">Longitude</Label>
              <Input
                id="edit-lng"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="2.3522"
                inputMode="decimal"
                aria-invalid={Boolean(errors.longitude)}
                className="rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50"
              />
              {errors.longitude && (
                <p className="text-xs font-medium text-[#f07d6a]">{errors.longitude}</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="mt-1 gap-2">
          <Button
            variant="outline"
            className="rounded-full border-white/12 bg-white/[0.04] text-[#d5def0] hover:bg-white/8 hover:text-white"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <button
            type="button"
            className="lux-btn h-9 px-4 text-xs disabled:pointer-events-none disabled:opacity-60"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            Enregistrer
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

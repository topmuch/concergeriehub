'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, type Variants } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FormDialog } from '@/components/airbnb/host/form-dialog';
import { StatusBadge } from '@/components/airbnb/host/status-badge';
import { useHostContext, type HostProperty } from '@/components/airbnb/host/host-context';
import { useCreateProperty, type CreatePropertyResult } from '@/hooks/use-properties';
import { PROPERTY_TYPE_META, propertyTypeMeta } from '@/lib/b2b';
import { cn } from '@/lib/utils';

// =============================================================
// PropertiesContent — page « Mes Propriétés » du Dashboard Client
// (spécification QRTags Pro)
//
// • Grille de PropertyCards (dégradé par type, stats 30j réelles,
//   actions Voir / Modifier / Équipe + lien Hub public)
// • Wizard d'ajout 3 étapes (Informations → Configuration →
//   Plaque QR) branché sur useCreateProperty + POST /api/airbnb/plaques
// • Modale d'édition → PATCH /api/airbnb/properties/{id}
// • Bandeau de capacité de plan + bannière d'invitations
// =============================================================

const BRAND = '#E23F2B';

/** Dégradé du bandeau visuel selon le type de bien. */
const TYPE_GRADIENTS: Record<string, string> = {
  AIRBNB: 'from-[#E23F2B]/85 to-[#F97316]/70',
  BOOKING: 'from-violet-500/80 to-fuchsia-500/60',
  GITE: 'from-emerald-500/80 to-teal-500/60',
  CHAMBRE_HOTE: 'from-amber-500/80 to-orange-500/60',
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: '👑 Propriétaire',
  MANAGER: '👔 Manager',
  CLEANER: '🧹 Ménage',
  MAINTENANCE: '🔧 Maintenance',
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

  const openWizard = useCallback(() => setWizardOpen(true), []);

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Mes Propriétés
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {properties.length} bien{properties.length > 1 ? 's' : ''} géré
            {properties.length > 1 ? 's' : ''}
            {plan ? (
              <>
                {' '}
                · Plan <span className="font-semibold text-slate-900">{plan.planName}</span>
              </>
            ) : null}
          </p>
        </div>
        <Button
          onClick={openWizard}
          className="h-10 gap-2 rounded-lg bg-[#E23F2B] px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#c93623] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
          aria-label="Ajouter une propriété"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ajouter une propriété
        </Button>
      </div>

      {/* ---------- Bandeau de capacité (limite de plan atteinte) ---------- */}
      {plan && !plan.canAddProperty && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
          role="status"
        >
          <span aria-hidden="true" className="text-lg">
            🔒
          </span>
          <p className="min-w-0 flex-1 text-sm text-slate-700">
            <span className="font-bold">
              Limite du plan atteinte ({plan.ownedCount}/{plan.maxProperties})
            </span>{' '}
            — passez à Airbnb Pro pour gérer jusqu&apos;à 10 biens et inviter une équipe.
          </p>
          <Link
            href="/airbnb/billing"
            className="inline-flex h-8 shrink-0 items-center rounded-lg bg-slate-900 px-3 text-xs font-bold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
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
          className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          role="status"
        >
          <span aria-hidden="true" className="text-xl">
            ✉️
          </span>
          <p className="min-w-0 flex-1 text-sm text-amber-900">
            <span className="font-bold">Invitation</span> — {invitations[0].property.name} (
            {ROLE_LABELS[invitations[0].role] ?? invitations[0].role})
            {invitations.length > 1 && ` + ${invitations.length - 1} autre(s)`} — gérer dans Équipe
          </p>
          <Link
            href="/airbnb/team"
            className="inline-flex h-8 shrink-0 items-center rounded-lg bg-amber-600 px-3 text-xs font-bold text-white transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Voir l&apos;invitation
          </Link>
        </motion.div>
      )}

      {/* ---------- Erreur API ---------- */}
      {propertiesError && (
        <div
          className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
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
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <Skeleton className="h-24 w-full rounded-none" aria-hidden="true" />
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-5 w-2/3" aria-hidden="true" />
                <Skeleton className="h-4 w-4/5" aria-hidden="true" />
                <Skeleton className="h-10 w-full" aria-hidden="true" />
                <Skeleton className="h-9 w-full" aria-hidden="true" />
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
}

function PropertyCard({ property: p, index, onView, onEdit, onTeam }: PropertyCardProps) {
  const typeMeta = propertyTypeMeta(p.propertyType);
  const gradient = TYPE_GRADIENTS[p.propertyType] ?? 'from-slate-400/70 to-slate-500/50';
  const canManage = p.isOwner || p.myRole === 'OWNER' || p.myRole === 'MANAGER';

  return (
    <motion.article
      variants={cardVariants}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24), ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Bandeau visuel dégradé + emoji + statut */}
      <div className={cn('relative h-24 shrink-0 bg-gradient-to-br', gradient)}>
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-4xl drop-shadow-sm transition-transform duration-300 group-hover:scale-110"
        >
          {typeMeta.emoji}
        </span>
        <span className="sr-only">{`Type : ${typeMeta.label}`}</span>
        <StatusBadge
          status={p.isActive ? 'active' : 'inactive'}
          className="absolute right-2 top-2 bg-white/90 shadow-sm backdrop-blur-sm"
        />
      </div>

      {/* Corps : nom + rôle + adresse + lien hub */}
      <div className="min-w-0 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-bold text-slate-900" title={p.name}>
            {p.name}
          </h3>
          <StatusBadge
            status={p.myRole}
            label={p.isOwner ? '👑 Propriétaire' : (ROLE_LABELS[p.myRole] ?? p.myRole)}
            className="shrink-0"
          />
        </div>
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate" title={p.address ?? undefined}>
            {p.address ?? 'Adresse non renseignée'}
          </span>
        </p>
        {p.qrHubSlug && (
          <a
            href={`/hub/${p.qrHubSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-[#E23F2B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
            aria-label={`Ouvrir le Hub public de ${p.name} dans un nouvel onglet`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Voir le Hub public
          </a>
        )}
      </div>

      {/* Stats 30 jours */}
      <div className="grid grid-cols-4 divide-x divide-slate-100 border-y border-slate-100 px-2 py-3 text-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900" title={`${p.stats.scans30d}`}>
            📡 {p.stats.scans30d}
          </p>
          <p className="text-[11px] leading-tight text-slate-400">scans</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900" title={`${Math.round(p.stats.upsellRevenue30d)} €`}>
            💰 {Math.round(p.stats.upsellRevenue30d)} €
          </p>
          <p className="text-[11px] leading-tight text-slate-400">upsell 30j</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">
            📈 {Math.round(p.stats.occupancyRate * 100)}%
          </p>
          <p className="text-[11px] leading-tight text-slate-400">occ.</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900" title={`${p.stats.qrCount}`}>
            📶 {p.stats.qrCount}
          </p>
          <p className="text-[11px] leading-tight text-slate-400">QR</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex gap-2 p-3">
        <Button
          variant="outline"
          className="h-9 flex-1 gap-1.5 border-slate-200 text-xs font-semibold text-slate-700 hover:bg-[#FEF1EF] hover:text-[#E23F2B] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
          onClick={onView}
          aria-label={`Voir le tableau de bord de ${p.name}`}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Voir
        </Button>
        {canManage && (
          <Button
            variant="outline"
            className="h-9 flex-1 gap-1.5 border-slate-200 text-xs font-semibold text-slate-700 hover:bg-[#FEF1EF] hover:text-[#E23F2B] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
            onClick={onEdit}
            aria-label={`Modifier ${p.name}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Modifier
          </Button>
        )}
        <Button
          variant="outline"
          className="h-9 flex-1 gap-1.5 border-slate-200 text-xs font-semibold text-slate-700 hover:bg-[#FEF1EF] hover:text-[#E23F2B] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
          onClick={onTeam}
          aria-label={`Gérer l'équipe de ${p.name}`}
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Équipe
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
      className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"
    >
      <span aria-hidden="true" className="text-5xl">
        🏠
      </span>
      <h2 className="mt-4 text-lg font-bold text-slate-900">Créez votre première propriété</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
        Ajoutez votre bien pour générer sa plaque QR, son Hub public voyageurs et centraliser
        scans, services, équipe et calendrier.
      </p>
      <Button
        onClick={onAdd}
        className="mt-5 h-10 gap-2 rounded-lg bg-[#E23F2B] px-5 text-sm font-bold text-white transition-colors hover:bg-[#c93623] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
        aria-label="Ajouter une première propriété"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Ajouter une propriété
      </Button>
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
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                done && 'bg-[#E23F2B] text-white',
                current && 'border-2 bg-white',
                !done && !current && 'bg-slate-100 text-slate-400',
              )}
              style={current ? { borderColor: BRAND, color: BRAND } : undefined}
            >
              {done ? '✓' : n}
            </span>
            <span
              className={cn(
                'hidden text-xs font-semibold sm:block',
                current ? 'text-slate-900' : 'text-slate-400',
              )}
            >
              {label}
            </span>
            {n < WIZARD_STEPS.length && (
              <span
                aria-hidden="true"
                className={cn('h-0.5 min-w-4 flex-1 rounded-full', done ? 'bg-[#E23F2B]/60' : 'bg-slate-200')}
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

  const typeMeta = propertyTypeMeta(propertyType);
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
    <FormDialog
      open={open}
      onOpenChange={handleClose}
      title={stepTitles[step].title}
      description={stepTitles[step].description}
      size="lg"
      footer={
        step === 1 ? (
          <>
            <Button
              variant="outline"
              className="border-slate-200 text-slate-700"
              onClick={() => handleClose(false)}
            >
              Annuler
            </Button>
            <Button
              className="gap-2 bg-[#E23F2B] font-bold text-white hover:bg-[#c93623] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
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
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        ) : step === 2 ? (
          <>
            <Button
              variant="outline"
              className="gap-2 border-slate-200 text-slate-700"
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Retour
            </Button>
            {limitHit && (
              <Button
                variant="outline"
                asChild
                className="gap-2 border-amber-300 bg-amber-50 text-xs font-bold text-amber-800 hover:bg-amber-100"
              >
                <Link href="/airbnb/billing">Voir les offres</Link>
              </Button>
            )}
            <Button
              className="gap-2 bg-[#E23F2B] font-bold text-white hover:bg-[#c93623] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              Créer le bien
            </Button>
          </>
        ) : (
          <>
            {plaque && (
              <Button
                variant="outline"
                className="gap-2 border-slate-200 text-slate-700"
                onClick={() => router.push(`/airbnb/plates/${plaque.id}/print`)}
              >
                🖨️ Imprimer la plaque
              </Button>
            )}
            <Button
              className="bg-[#E23F2B] font-bold text-white hover:bg-[#c93623] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
              onClick={() => handleClose(false)}
            >
              Terminer
            </Button>
          </>
        )
      }
    >
      <Stepper step={step} />

      {/* ---------- Étape 1 : Informations ---------- */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-name">Nom du bien *</Label>
            <Input
              id="wizard-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Loft Canal Saint-Martin"
              maxLength={80}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'wizard-name-error' : undefined}
              className={cn(errors.name && 'border-rose-400 focus-visible:ring-rose-300')}
            />
            {errors.name && (
              <p id="wizard-name-error" className="text-xs font-medium text-rose-600">
                {errors.name}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-address">Adresse *</Label>
            <Textarea
              id="wizard-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="12 quai de Valmy, 75010 Paris, France"
              rows={2}
              aria-invalid={Boolean(errors.address)}
              aria-describedby={errors.address ? 'wizard-address-error' : undefined}
              className={cn(errors.address && 'border-rose-400 focus-visible:ring-rose-300')}
            />
            {errors.address && (
              <p id="wizard-address-error" className="text-xs font-medium text-rose-600">
                {errors.address}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-type">Type de bien</Label>
            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger id="wizard-type" className="w-full" aria-label="Type de bien">
                <SelectValue placeholder="Choisir un type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROPERTY_TYPE_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.emoji} {meta.label}
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
              className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
              role="alert"
            >
              <span aria-hidden="true">🔒</span>
              <span className="min-w-0 flex-1 font-medium">{limitHit.message}</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wizard-lat">Latitude</Label>
              <Input
                id="wizard-lat"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="48.8566"
                inputMode="decimal"
                aria-invalid={Boolean(errors.latitude)}
                aria-describedby={errors.latitude ? 'wizard-lat-error' : 'wizard-coords-help'}
                className={cn(errors.latitude && 'border-rose-400 focus-visible:ring-rose-300')}
              />
              {errors.latitude && (
                <p id="wizard-lat-error" className="text-xs font-medium text-rose-600">
                  {errors.latitude}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wizard-lng">Longitude</Label>
              <Input
                id="wizard-lng"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="2.3522"
                inputMode="decimal"
                aria-invalid={Boolean(errors.longitude)}
                aria-describedby={errors.longitude ? 'wizard-lng-error' : 'wizard-coords-help'}
                className={cn(errors.longitude && 'border-rose-400 focus-visible:ring-rose-300')}
              />
              {errors.longitude && (
                <p id="wizard-lng-error" className="text-xs font-medium text-rose-600">
                  {errors.longitude}
                </p>
              )}
            </div>
          </div>
          <p id="wizard-coords-help" className="text-xs text-slate-500">
            💡 Utilisez maps.google.com pour trouver les coordonnées — nécessaires pour
            l&apos;annuaire de prestataires géolocalisé.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wizard-pin">PIN Mode Hôte (optionnel)</Label>
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
              className={cn('w-40', errors.hubPin && 'border-rose-400 focus-visible:ring-rose-300')}
            />
            {errors.hubPin ? (
              <p id="wizard-pin-error" className="text-xs font-medium text-rose-600">
                {errors.hubPin}
              </p>
            ) : (
              <p id="wizard-pin-help" className="text-xs text-slate-500">
                🔐 Protège l&apos;accès tablette/QR du Hub — hashing bcrypt côté serveur.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------- Étape 3 : Plaque QR ---------- */}
      {step === 3 && created && (
        <div className="flex flex-col gap-4">
          {/* Résumé du bien créé */}
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-bold text-slate-900">
                <span aria-hidden="true">{typeMeta.emoji}</span> {created.name}
              </p>
              <p className="mt-0.5 truncate text-sm text-slate-600">
                {address.trim()} · {propertyTypeMeta(propertyType).label}
              </p>
            </div>
          </div>

          {!plaque ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <span aria-hidden="true" className="text-4xl">
                📱
              </span>
              <p className="text-sm text-slate-600">
                Générez la plaque QR de ce bien : son Hub public sera accessible par scan
                (Wi-Fi, guidebook, upselling…).
              </p>
              <Button
                className="gap-2 bg-[#E23F2B] font-bold text-white hover:bg-[#c93623] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
                onClick={() => void handleGeneratePlaque()}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                )}
                Générer la plaque QR maintenant
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="plaque-code" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Code d&apos;activation
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-slate-200 px-2 text-xs"
                    onClick={() => void copyToClipboard(plaque.activationCode, 'Code')}
                    aria-label="Copier le code d'activation"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copier
                  </Button>
                </div>
                <code
                  id="plaque-code"
                  className="select-all font-mono text-lg font-bold tracking-[0.2em] text-slate-900"
                >
                  {plaque.activationCode}
                </code>
              </div>

              {hubUrl && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Lien du Hub public
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-slate-200 px-2 text-xs"
                      onClick={() => void copyToClipboard(hubUrl, 'Lien')}
                      aria-label="Copier le lien du Hub public"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copier
                    </Button>
                  </div>
                  <a
                    href={`/hub/${plaque.hubSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-[#E23F2B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{hubUrl}</span>
                  </a>
                </div>
              )}

              <p className="text-xs text-slate-500">
                🖨️ Imprimez la plaque et posez-la dans le logement — vos voyageurs scannent, tout
                est là.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Garde : étape 3 sans `created` (ne devrait jamais arriver) */}
      {step === 3 && !created && (
        <p className="text-sm text-rose-600" role="alert">
          Une erreur est survenue. Fermez et relancez l&apos;assistant.
        </p>
      )}
    </FormDialog>
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Modifier « ${property.name} »`}
      description="Les changements sont visibles immédiatement dans le Hub public."
      size="md"
      footer={
        <>
          <Button
            variant="outline"
            className="border-slate-200 text-slate-700"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button
            className="gap-2 bg-[#E23F2B] font-bold text-white hover:bg-[#c93623] focus-visible:ring-2 focus-visible:ring-[#E23F2B]/40"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-name">Nom du bien *</Label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'edit-name-error' : undefined}
            className={cn(errors.name && 'border-rose-400 focus-visible:ring-rose-300')}
          />
          {errors.name && (
            <p id="edit-name-error" className="text-xs font-medium text-rose-600">
              {errors.name}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-address">Adresse *</Label>
          <Textarea
            id="edit-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            aria-invalid={Boolean(errors.address)}
            aria-describedby={errors.address ? 'edit-address-error' : undefined}
            className={cn(errors.address && 'border-rose-400 focus-visible:ring-rose-300')}
          />
          {errors.address && (
            <p id="edit-address-error" className="text-xs font-medium text-rose-600">
              {errors.address}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-type">Type de bien</Label>
          <Select value={propertyType} onValueChange={setPropertyType}>
            <SelectTrigger id="edit-type" className="w-full" aria-label="Type de bien">
              <SelectValue placeholder="Choisir un type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROPERTY_TYPE_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  {meta.emoji} {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-lat">Latitude</Label>
            <Input
              id="edit-lat"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="48.8566"
              inputMode="decimal"
              aria-invalid={Boolean(errors.latitude)}
              className={cn(errors.latitude && 'border-rose-400 focus-visible:ring-rose-300')}
            />
            {errors.latitude && (
              <p className="text-xs font-medium text-rose-600">{errors.latitude}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-lng">Longitude</Label>
            <Input
              id="edit-lng"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="2.3522"
              inputMode="decimal"
              aria-invalid={Boolean(errors.longitude)}
              className={cn(errors.longitude && 'border-rose-400 focus-visible:ring-rose-300')}
            />
            {errors.longitude && (
              <p className="text-xs font-medium text-rose-600">{errors.longitude}</p>
            )}
          </div>
        </div>
      </div>
    </FormDialog>
  );
}

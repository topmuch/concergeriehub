'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  QrCode,
  TrendingUp,
  Users,
} from 'lucide-react';
import { B2BCard } from '@/components/ui/b2b-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatEur, propertyTypeMeta, PROPERTY_TYPE_META } from '@/lib/b2b';
import { memberRoleMeta, type MemberRole } from '@/lib/team';
import { DashboardContent } from '@/components/airbnb/dashboard-content';

// =============================================================
// PortfolioContent — ÉTAPE 12 V2 : Dashboard multi-propriétés.
//  - Vue "Portfolio" : grille de tous les biens + stats rapides
//  - Sélecteur (chips) pour basculer / ouvrir un bien
//  - Wizard "Ajouter une propriété" (adresse → type → config QR)
//  - Invitations d'équipe (accepter / refuser)
//  - Vue "Mes interventions" pour les rôles CLEANER/MAINTENANCE
//    (accès limité par rôle)
// =============================================================

interface PortfolioStats {
  occupancyRate: number;
  bookedNights: number;
  upcomingBookings: number;
  nextBooking: { guestName: string; checkIn: string; checkOut: string } | null;
  scans30d: number;
  lastScanAt: string | null;
  upsellRevenue30d: number;
  upsellOrders30d: number;
  qrCount: number;
  membersCount: number;
  pendingInvites: number;
  unreadGuestMessages: number;
}

interface PortfolioProperty {
  id: string;
  name: string;
  propertyType: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  qrHubSlug: string | null;
  createdAt: string | null;
  myRole: MemberRole;
  isOwner: boolean;
  stats: PortfolioStats;
}

interface PortfolioInvitation {
  membershipId: string;
  role: MemberRole;
  invitedAt: string;
  property: { id: string; name: string; propertyType: string; address: string | null };
}

interface PortfolioData {
  user: { firstName: string };
  plan: {
    planId: string | null;
    planName: string;
    maxProperties: number;
    isPro: boolean;
    ownedCount: number;
    canAddProperty: boolean;
  };
  properties: PortfolioProperty[];
  totals: {
    propertiesCount: number;
    scans30d: number;
    upsellRevenue30d: number;
    avgOccupancy: number;
    qrCount: number;
  };
  invitations: PortfolioInvitation[];
}

type ViewMode = { kind: 'portfolio' } | { kind: 'property'; id: string } | { kind: 'assignments' };

export function PortfolioContent() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewMode>({ kind: 'portfolio' });
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/airbnb/properties');
      if (res.status === 401) {
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as PortfolioData;
      setData(json);
    } catch {
      setError('Impossible de charger le portfolio. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // ----- Vue "Mes interventions" par défaut pour les rôles limités -----
  const isLimitedMemberOnly = useMemo(() => {
    if (!data) return false;
    const hasOwned = data.properties.some((p) => p.isOwner);
    const hasManager = data.properties.some((p) => p.myRole === 'MANAGER');
    return !hasOwned && !hasManager && data.properties.length > 0;
  }, [data]);

  useEffect(() => {
    if (data && isLimitedMemberOnly && view.kind === 'portfolio') {
      setView({ kind: 'assignments' });
    }
  }, [data, isLimitedMemberOnly, view.kind]);

  async function acceptInvitation(inv: PortfolioInvitation) {
    const res = await fetch(
      `/api/airbnb/properties/${inv.property.id}/members/${inv.membershipId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      },
    );
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? "Impossible d'accepter l'invitation.");
      return;
    }
    toast.success(`Bienvenue dans l'équipe de ${inv.property.name} !`);
    await load();
  }

  async function declineInvitation(inv: PortfolioInvitation) {
    const res = await fetch(
      `/api/airbnb/properties/${inv.property.id}/members/${inv.membershipId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline' }),
      },
    );
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? 'Impossible de refuser l’invitation.');
      return;
    }
    toast.info('Invitation refusée.');
    await load();
  }

  function openAddWizard() {
    if (data && !data.plan.canAddProperty) {
      toast.error(
        `Limite du plan ${data.plan.planName} atteinte (${data.plan.ownedCount}/${data.plan.maxProperties} biens)`,
        {
          description:
            "Passez à l'offre Airbnb Pro (199 €/an) pour gérer jusqu'à 10 biens et une équipe.",
          action: {
            label: 'Voir les offres',
            onClick: () => router.push('/airbnb/billing'),
          },
        },
      );
      return;
    }
    setWizardOpen(true);
  }

  // ----- Loading -----
  if (loading && !data) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6" aria-busy="true" aria-label="Chargement du portfolio">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ----- Erreur -----
  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 py-16 flex justify-center">
        <B2BCard className="max-w-md w-full text-center">
          <p className="text-3xl" aria-hidden="true">😵</p>
          <p className="mt-2 font-semibold text-slate-900">Oups, une erreur est survenue</p>
          <p className="text-sm text-slate-600 mt-1">{error || 'Données indisponibles.'}</p>
          <Button onClick={load} className="mt-4 bg-slate-900 hover:bg-slate-800 text-white">
            Réessayer
          </Button>
        </B2BCard>
      </div>
    );
  }

  const { user, plan, properties, totals, invitations } = data;

  // ================= Vue détail d'un bien =================
  if (view.kind === 'property') {
    const selected = properties.find((p) => p.id === view.id);
    if (!selected) {
      setView({ kind: isLimitedMemberOnly ? 'assignments' : 'portfolio' });
      return null;
    }
    // Rôle limité → vue restreinte (pas le dashboard complet)
    if (selected.myRole === 'CLEANER' || selected.myRole === 'MAINTENANCE') {
      return (
        <AssignmentsView
          onBack={() => setView({ kind: 'assignments' })}
          filterPropertyId={selected.id}
          onBookingUpdated={load}
        />
      );
    }
    return (
      <DashboardContent
        key={selected.id}
        lockedPropertyId={selected.id}
        onBack={() => setView({ kind: 'portfolio' })}
      />
    );
  }

  // ================= Vue "Mes interventions" (rôles limités) =================
  if (view.kind === 'assignments') {
    return (
      <AssignmentsView
        onBack={isLimitedMemberOnly ? undefined : () => setView({ kind: 'portfolio' })}
        onBookingUpdated={load}
      />
    );
  }

  // ================= Vue Portfolio =================
  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
      {/* ---------- En-tête ---------- */}
      <section aria-labelledby="portfolio-greeting">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 id="portfolio-greeting" className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Bonjour, {user.firstName} 👋
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Vue Portfolio — {totals.propertiesCount} bien{totals.propertiesCount > 1 ? 's' : ''} sous gestion ·
              {' '}plan <span className="font-semibold text-slate-800">{plan.planName}</span>
              {' '}({plan.ownedCount}/{plan.maxProperties})
            </p>
          </div>
          <Button
            onClick={openAddWizard}
            className="bg-slate-900 hover:bg-slate-800 text-white self-start"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" /> Ajouter une propriété
          </Button>
        </div>
      </section>

      {/* ---------- Invitations d'équipe ---------- */}
      {invitations.length > 0 && (
        <section aria-label="Invitations d'équipe en attente" className="space-y-3">
          {invitations.map((inv) => {
            const meta = memberRoleMeta(inv.role);
            return (
              <div
                key={inv.membershipId}
                className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
              >
                <p className="text-sm text-slate-800">
                  <span className="font-bold">📩 Invitation :</span>{' '}
                  <span className="font-semibold">
                    {meta.emoji} {meta.label}
                  </span>{' '}
                  sur{' '}
                  <span className="font-semibold">
                    {propertyTypeMeta(inv.property.propertyType).emoji} {inv.property.name}
                  </span>
                  <span className="block text-xs text-amber-700 mt-0.5">
                    Vous verrez uniquement la section liée à votre rôle tant que le propriétaire ne
                    vous accorde pas plus de droits.
                  </span>
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => acceptInvitation(inv)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" /> Accepter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => declineInvitation(inv)}
                    className="bg-white border-amber-300 text-slate-600 hover:bg-amber-100"
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ---------- Totaux ---------- */}
      <section aria-label="Totaux du portfolio" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MiniStat emoji="🏘️" label="Biens gérés" value={String(totals.propertiesCount)} />
        <MiniStat emoji="📡" label="Scans (30 j)" value={String(totals.scans30d)} />
        <MiniStat emoji="💰" label="Revenus upsell (30 j)" value={formatEur(totals.upsellRevenue30d)} />
        <MiniStat
          emoji="📅"
          label="Occupation moyenne"
          value={`${Math.round(totals.avgOccupancy * 100)} %`}
        />
      </section>

      {/* ---------- Sélecteur (chips) ---------- */}
      <section aria-label="Sélecteur de bien">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <ChipButton active onClick={() => setView({ kind: 'portfolio' })}>
            🏢 Portfolio
          </ChipButton>
          {properties.map((p) => (
            <ChipButton key={p.id} onClick={() => setView({ kind: 'property', id: p.id })}>
              {propertyTypeMeta(p.propertyType).emoji} {p.name}
            </ChipButton>
          ))}
          {plan.canAddProperty && (
            <ChipButton onClick={openAddWizard} dashed>
              ＋ Ajouter
            </ChipButton>
          )}
        </div>
      </section>

      {/* ---------- Grille portfolio ---------- */}
      {properties.length === 0 ? (
        <B2BCard className="p-10 text-center">
          <p className="text-4xl" aria-hidden="true">🏘️</p>
          <h2 className="mt-3 text-lg font-bold text-slate-900">Aucun bien dans votre portfolio</h2>
          <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
            Ajoutez votre première propriété en 3 étapes : adresse, type, configuration QR.
            Votre plaque QR reste liée au bien de votre choix.
          </p>
          <Button
            onClick={openAddWizard}
            className="mt-5 bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" /> Ajouter une propriété
          </Button>
        </B2BCard>
      ) : (
        <section aria-label="Toutes les propriétés" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} onOpen={() => setView({ kind: 'property', id: p.id })} />
          ))}
        </section>
      )}

      {/* ---------- Wizard ---------- */}
      <AddPropertyWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={async () => {
          await load();
          toast.success('Bien ajouté à votre portfolio !');
        }}
        planLabel={plan.planName}
        used={plan.ownedCount}
        max={plan.maxProperties}
      />
    </div>
  );
}

// =============================================================
// Sous-composants
// =============================================================

function MiniStat({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <B2BCard hover className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-lg" aria-hidden="true">{emoji}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 text-right">
          {label}
        </span>
      </div>
      <p className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
    </B2BCard>
  );
}

function ChipButton({
  active,
  dashed,
  onClick,
  children,
}: {
  active?: boolean;
  dashed?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
        active
          ? 'bg-slate-900 text-white border-slate-900'
          : dashed
            ? 'bg-white text-slate-500 border-dashed border-slate-300 hover:border-slate-400 hover:text-slate-700'
            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}

function PropertyCard({ property, onOpen }: { property: PortfolioProperty; onOpen: () => void }) {
  const typeMeta = propertyTypeMeta(property.propertyType);
  const roleMeta = memberRoleMeta(property.myRole);
  const occupancy = Math.round(property.stats.occupancyRate * 100);
  const next = property.stats.nextBooking;
  const formatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Ouvrir le bien ${property.name}`}
      className="text-left bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 p-5 flex flex-col gap-4"
    >
      {/* En-tête */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0" aria-hidden="true">{typeMeta.emoji}</span>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">{property.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {typeMeta.label}
              {property.address ? ` · ${property.address}` : ''}
            </p>
          </div>
        </div>
        {!property.isOwner && (
          <Badge className="bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold shrink-0">
            {roleMeta.emoji} {roleMeta.label}
          </Badge>
        )}
      </div>

      {/* Occupation */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-semibold text-slate-600 flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Occupation (30 j)
          </span>
          <span className="font-bold text-slate-900 tabular-nums">{occupancy} %</span>
        </div>
        <ProgressBar value={occupancy} size="sm" />
      </div>

      {/* Stats mini */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="text-sm font-bold text-slate-900 tabular-nums">{property.stats.scans30d}</p>
          <p className="text-[10px] text-slate-500 font-medium">scans 30 j</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="text-sm font-bold text-slate-900 tabular-nums">
            {formatEur(property.stats.upsellRevenue30d)}
          </p>
          <p className="text-[10px] text-slate-500 font-medium">upsell 30 j</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="text-sm font-bold text-slate-900 tabular-nums">{property.stats.qrCount}</p>
          <p className="text-[10px] text-slate-500 font-medium">QR actifs</p>
        </div>
      </div>

      {/* Prochain séjour + équipe */}
      <div className="mt-auto space-y-2">
        {next ? (
          <p className="text-xs text-slate-600 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            Prochain séjour :{' '}
            <span className="font-semibold">
              {next.guestName} · {formatter.format(new Date(next.checkIn))} →{' '}
              {formatter.format(new Date(next.checkOut))}
            </span>
          </p>
        ) : (
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Aucun séjour à venir
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {property.stats.membersCount} membre{property.stats.membersCount > 1 ? 's' : ''}
            {property.stats.pendingInvites > 0 && (
              <Badge className="ml-1 bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold">
                {property.stats.pendingInvites} en attente
              </Badge>
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            {property.qrHubSlug ? `/hub/${property.qrHubSlug}` : 'hub non configuré'}
          </span>
        </div>
        <div className="flex items-center justify-end text-slate-400">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
            Ouvrir le bien <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </button>
  );
}

// =============================================================
// Wizard "Ajouter une propriété" — 3 étapes
// 1. Adresse  2. Type  3. Configuration QR
// =============================================================

function AddPropertyWizard({
  open,
  onOpenChange,
  onCreated,
  planLabel,
  used,
  max,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => Promise<void>;
  planLabel: string;
  used: number;
  max: number;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [propertyType, setPropertyType] = useState('AIRBNB');
  const [hubSlug, setHubSlug] = useState('');
  const [hubPin, setHubPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const steps = ['Adresse', 'Type', 'Configuration QR'];

  function autoSlug(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  function goToStep(next: number) {
    setStep(next);
    if (next === 3 && !hubSlug) {
      setHubSlug(`${autoSlug(name) || 'bien'}-${Math.random().toString(36).slice(2, 6)}`);
    }
  }

  function reset() {
    setStep(1);
    setName('');
    setAddress('');
    setLatitude('');
    setLongitude('');
    setPropertyType('AIRBNB');
    setHubSlug('');
    setHubPin('');
  }

  const step1Valid = name.trim().length >= 2 && address.trim().length > 0;
  const step3Valid =
    hubSlug.trim().length >= 3 && (hubPin === '' || /^\d{4}$/.test(hubPin));

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/airbnb/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          propertyType,
          latitude: latitude === '' ? null : latitude,
          longitude: longitude === '' ? null : longitude,
          hubPin: hubPin === '' ? null : hubPin,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        upgrade?: string;
        property?: { id: string; name: string; qrHubSlug: string | null };
      };
      if (!res.ok) {
        toast.error(json.error ?? 'Création impossible.', {
          description: json.upgrade === 'airbnb_pro' ? json.message : undefined,
          action:
            json.upgrade === 'airbnb_pro'
              ? { label: 'Voir les offres', onClick: () => (window.location.href = '/airbnb/billing') }
              : undefined,
        });
        return;
      }
      reset();
      onOpenChange(false);
      await onCreated();
    } catch {
      toast.error('Erreur réseau. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une propriété</DialogTitle>
          <DialogDescription>
            Plan {planLabel} — {used}/{max} biens utilisés. Wizard en 3 étapes.
          </DialogDescription>
        </DialogHeader>

        {/* Fil d'étapes */}
        <ol className="flex items-center gap-2" aria-label="Étapes du wizard">
          {steps.map((label, i) => {
            const n = i + 1;
            const done = step > n;
            const current = step === n;
            return (
              <li key={label} className="flex items-center gap-2 flex-1 last:flex-none">
                <span
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 border',
                    done && 'bg-emerald-50 border-emerald-200 text-emerald-700',
                    current && 'bg-slate-900 border-slate-900 text-white',
                    !done && !current && 'bg-white border-slate-200 text-slate-400',
                  )}
                >
                  <span
                    className={cn(
                      'h-4 w-4 rounded-full inline-flex items-center justify-center text-[10px] font-bold',
                      done ? 'bg-emerald-600 text-white' : current ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-500',
                    )}
                    aria-hidden="true"
                  >
                    {done ? '✓' : n}
                  </span>
                  {label}
                </span>
                {n < steps.length && <span className="flex-1 h-px bg-slate-200" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        {/* ---------- Étape 1 : Adresse ---------- */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prop-name">Nom du bien *</Label>
              <Input
                id="prop-name"
                placeholder="Loft Paris 11"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-address">Adresse complète *</Label>
              <Input
                id="prop-address"
                placeholder="24 rue de la Roquette, 75011 Paris"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Sert à géolocaliser les prestataires autour du bien.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="prop-lat">Latitude (optionnel)</Label>
                <Input
                  id="prop-lat"
                  inputMode="decimal"
                  placeholder="48.8566"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prop-lng">Longitude (optionnel)</Label>
                <Input
                  id="prop-lng"
                  inputMode="decimal"
                  placeholder="2.3522"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ---------- Étape 2 : Type ---------- */}
        {step === 2 && (
          <div className="space-y-3" role="radiogroup" aria-label="Type de bien">
            {Object.entries(PROPERTY_TYPE_META).map(([key, meta]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={propertyType === key}
                onClick={() => setPropertyType(key)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                  propertyType === key
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <span className="text-xl" aria-hidden="true">{meta.emoji}</span>
                <span className="text-sm font-semibold text-slate-900">{meta.label}</span>
                {propertyType === key && (
                  <Check className="ml-auto h-4 w-4 text-slate-900" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ---------- Étape 3 : Configuration QR ---------- */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prop-slug">Adresse du Hub QR *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400 shrink-0">/hub/</span>
                <Input
                  id="prop-slug"
                  value={hubSlug}
                  onChange={(e) => setHubSlug(autoSlug(e.target.value))}
                  placeholder="loft-paris-11"
                />
              </div>
              <p className="text-xs text-slate-500">
                URL publique de l&apos;expérience voyageur : Wi-Fi, guidebook, services, réclamations.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-pin">PIN Mode Hôte (optionnel)</Label>
              <Input
                id="prop-pin"
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
                value={hubPin}
                onChange={(e) => setHubPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <p className="text-xs text-slate-500">
                Protège l&apos;accès hôte sur la tablette du logement (4 chiffres).
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Récapitulatif</p>
              <p>🏷️ {name || '—'} · {propertyTypeMeta(propertyType).label}</p>
              <p>📍 {address || '—'}</p>
              <p>🔗 /hub/{hubSlug || '—'}</p>
              <p>🔒 PIN {hubPin ? 'configuré' : 'non configuré'}</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={submitting}>
              Retour
            </Button>
          )}
          {step < 3 && (
            <Button
              onClick={() => goToStep(step + 1)}
              disabled={step === 1 && !step1Valid}
              className="bg-slate-900 hover:bg-slate-800 text-white"
            >
              Continuer
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={submit}
              disabled={submitting || !step3Valid}
              className="bg-slate-900 hover:bg-slate-800 text-white"
            >
              {submitting ? 'Création…' : 'Créer la propriété'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// AssignmentsView — vue "Mes interventions" (CLEANER/MAINTENANCE)
// =============================================================

interface AssignmentBooking {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  cleaningStatus: string;
  status: string;
}

interface AssignmentRequest {
  id: string;
  description: string | null;
  status: string;
  urgencyLevel: string;
  preferredDate: string | null;
  createdAt: string;
  provider: { businessName: string; category: string } | null;
}

interface Assignment {
  property: { id: string; name: string; propertyType: string; address: string | null };
  role: MemberRole;
  cleaning: { upcoming: AssignmentBooking[] };
  maintenance: { open: AssignmentRequest[] };
}

const CLEANING_LABELS: Record<string, { label: string; className: string; next?: string; nextLabel?: string }> = {
  PENDING: {
    label: 'À faire',
    className: 'bg-red-50 border-red-200 text-red-600',
    next: 'IN_PROGRESS',
    nextLabel: 'Démarrer',
  },
  IN_PROGRESS: {
    label: 'En cours',
    className: 'bg-amber-50 border-amber-200 text-amber-700',
    next: 'DONE',
    nextLabel: 'Terminer',
  },
  DONE: { label: 'Terminé', className: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
};

function AssignmentsView({
  onBack,
  filterPropertyId,
  onBookingUpdated,
}: {
  onBack?: () => void;
  filterPropertyId?: string;
  onBookingUpdated?: () => Promise<void> | void;
}) {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/airbnb/my-assignments');
      if (!res.ok) throw new Error('http');
      const json = (await res.json()) as { assignments: Assignment[] };
      setAssignments(json.assignments);
    } catch {
      setError('Impossible de charger vos interventions.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setCleaning(bookingId: string, cleaningStatus: string, propertyId: string) {
    const res = await fetch(`/api/airbnb/properties/${propertyId}/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cleaningStatus }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? 'Mise à jour impossible.');
      return;
    }
    toast.success('Statut de ménage mis à jour.');
    await load();
    await onBookingUpdated?.();
  }

  const visible = (assignments ?? []).filter((a) => !filterPropertyId || a.property.id === filterPropertyId);

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8 space-y-6">
      <section aria-labelledby="assignments-title">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 id="assignments-title" className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Mes interventions 🛠️
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Accès limité à votre rôle : planning ménage et réclamations techniques.
            </p>
          </div>
          {onBack && (
            <Button variant="outline" onClick={onBack} className="bg-white border-slate-300 self-start">
              ← Portfolio
            </Button>
          )}
        </div>
      </section>

      {error && (
        <B2BCard className="p-6 text-center">
          <p className="text-sm text-slate-700">{error}</p>
          <Button onClick={load} className="mt-3 bg-slate-900 hover:bg-slate-800 text-white" size="sm">
            Réessayer
          </Button>
        </B2BCard>
      )}

      {!assignments && !error && (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      )}

      {assignments && visible.length === 0 && (
        <B2BCard className="p-10 text-center">
          <p className="text-4xl" aria-hidden="true">🗓️</p>
          <h2 className="mt-3 text-lg font-bold text-slate-900">Aucune intervention assignée</h2>
          <p className="text-sm text-slate-600 mt-2">
            Vous verrez ici les séjours (ménage) ou réclamations (maintenance) des biens où vous
            êtes membre de l&apos;équipe.
          </p>
        </B2BCard>
      )}

      <div className="space-y-6">
        {visible.map((a) => {
          const typeMeta = propertyTypeMeta(a.property.propertyType);
          const roleMeta = memberRoleMeta(a.role);
          const formatter = new Intl.DateTimeFormat('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <B2BCard key={a.property.id} className="p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-2xl" aria-hidden="true">{typeMeta.emoji}</span>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900">{a.property.name}</h2>
                  <p className="text-xs text-slate-500">{a.property.address ?? typeMeta.label}</p>
                </div>
                <Badge className="ml-auto bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold">
                  {roleMeta.emoji} {roleMeta.label}
                </Badge>
              </div>

              {/* Planning ménage */}
              {a.role !== 'MAINTENANCE' && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                    🧹 Planning ménage
                  </h3>
                  {a.cleaning.upcoming.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun séjour à venir.</p>
                  ) : (
                    <div className="space-y-2">
                      {a.cleaning.upcoming.map((b) => {
                        const cs = CLEANING_LABELS[b.cleaningStatus] ?? CLEANING_LABELS.PENDING;
                        return (
                          <div
                            key={b.id}
                            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">
                                {b.guestName}{' '}
                                <span className="text-slate-400 font-normal">
                                  · {b.guests} voyageur{b.guests > 1 ? 's' : ''}
                                </span>
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatter.format(new Date(b.checkIn))} →{' '}
                                {formatter.format(new Date(b.checkOut))}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={cn('border font-semibold hover:bg-transparent', cs.className)}>
                                {cs.label}
                              </Badge>
                              {cs.next && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="bg-white border-slate-300 h-8"
                                  onClick={() => setCleaning(b.id, cs.next!, a.property.id)}
                                >
                                  {cs.nextLabel}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Réclamations techniques */}
              {a.role !== 'CLEANER' && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
                    🔧 Réclamations techniques
                  </h3>
                  {a.maintenance.open.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucune réclamation en cours.</p>
                  ) : (
                    <div className="space-y-2">
                      {a.maintenance.open.map((r) => (
                        <div
                          key={r.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {r.description ?? 'Réclamation voyageur'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {r.provider?.businessName
                                ? `${r.provider.businessName} · `
                                : ''}
                              signalée le {formatter.format(new Date(r.createdAt))}
                              {r.urgencyLevel === 'urgent' ? ' · 🚨 urgent' : ''}
                            </p>
                          </div>
                          <Badge className="bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold shrink-0">
                            {r.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </B2BCard>
          );
        })}
      </div>
    </div>
  );
}

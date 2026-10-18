'use client';

// =============================================================
// DASHBOARD — module standalone « État des Lieux » (v4.97)
// 299 €/an, INDÉPENDANT du Hub. Onboarding 3 étapes (liste vide),
// bannière d'abonnement expiré, formulaire de création, tableau
// desktop + cartes mobiles, actions de partage (WhatsApp, email,
// copie du lien, PDF, aperçu), reprogrammation et suppression
// (confirm double-clic). Design Saphir Luxe — ZÉRO icône.
// =============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toaster } from '@/components/ui/sonner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { LuxBusyDot } from './dashboard-ui';
import { InspectionCreateForm, type CreateFormPrefill } from './create-form';
import { InspectionOnboarding, type OnboardingResult } from './onboarding';
import { ShieldManager } from '../shield/shield-manager';
import { AirbnbDisputeDialog } from '../shield/airbnb-dispute-dialog';
import {
  buildClassicDisputeMessage,
  openAirbnbResolutionCenter,
  prepareAirbnbDispute,
  sanitizeFilePart,
} from '../shield/airbnb-dispute';
import {
  INSPECTION_STATUS_META,
  formatFrDateTime,
  mailtoLink,
  whatsappLink,
  type InspectionListResponse,
  type InspectionRow,
} from './inspection-types';

// ── v4.122 — THÈME CLAIR (client : « tous les fonds noirs doivent laisser
// place au mode clair »). Constantes locales claires : elles remplacent
// LUX_FIELD / LUX_GHOST_BTN / ROW_ACTION_BTN (dashboard-ui.tsx, fichier NON
// modifié) et les badges nuit de inspection-types.ts (non modifié).
// Zéro logique : classes uniquement. Référence de style = shield-capture.tsx.
const LIGHT_FIELD =
  'rounded-xl border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:border-[#C21F26] focus-visible:ring-[#C21F26]/30 dark:bg-white dark:border-gray-300';

const LIGHT_GHOST_BTN =
  'rounded-full border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:bg-white dark:border-gray-300 dark:text-gray-700 dark:hover:bg-gray-50';

const LIGHT_ROW_ACTION_BTN =
  'min-h-[44px] rounded-full px-3 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:min-h-0 sm:py-0';

/** Badges de statut clairs AA — remplaçants de INSPECTION_STATUS_META.badgeClass (nuit). */
const STATUS_BADGE_LIGHT: Record<string, string> = {
  PENDING: 'border-amber-300 bg-amber-50 text-amber-700',
  IN_PROGRESS: 'border-teal-300 bg-teal-50 text-teal-700',
  COMPLETED: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  CANCELLED: 'border-gray-200 bg-gray-50 text-gray-500',
};

/** Badges de type clairs — remplaçants de TYPE_BADGE (nuit). */
const TYPE_BADGE_LIGHT: Record<string, string> = {
  ENTREE: 'border-teal-200 bg-teal-50 text-teal-700',
  SORTIE: 'border-red-200 bg-red-50 text-[#C21F26]',
};

interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
}

/** Badge de statut (dot + libellé, aucune icône). */
function StatusBadge({ status }: { status: string }) {
  const meta = INSPECTION_STATUS_META[status] ?? INSPECTION_STATUS_META.PENDING;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        STATUS_BADGE_LIGHT[status] ?? STATUS_BADGE_LIGHT.PENDING,
      )}
    >
      <span aria-hidden="true" className="lux-dot" style={{ backgroundColor: meta.dotColor }} />
      {meta.label}
    </span>
  );
}

/** Badge de type : ENTRÉE teal / SORTIE corail. */
function TypeBadge({ type }: { type: string }) {
  const label = type === 'SORTIE' ? 'Sortie' : 'Entrée';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]',
        TYPE_BADGE_LIGHT[type] ?? TYPE_BADGE_LIGHT.ENTREE,
      )}
    >
      {label}
    </span>
  );
}

export function InspectionDashboard({ sessionUser }: { sessionUser: SessionUser }) {
  // Onglet actif : « Bouclier automatisé » (v5.1, par défaut) ou EDL classique.
  const [tab, setTab] = useState<'shield' | 'classic'>('shield');
  const [data, setData] = useState<InspectionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<CreateFormPrefill | null>(null);
  const [onboardingActive, setOnboardingActive] = useState<boolean | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  const [rescheduleRow, setRescheduleRow] = useState<InspectionRow | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [disputeBusyId, setDisputeBusyId] = useState<string | null>(null);
  const [disputeMessage, setDisputeMessage] = useState<string | null>(null);
  const armedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Chargement de la liste ──
  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setLoading(true);
    try {
      const res = await fetch('/api/inspection/list', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as InspectionListResponse;
      setData(json);
      setOnboardingActive((prev) => (prev === null ? json.inspections.length === 0 : prev));
    } catch {
      if (mode === 'initial') {
        toast.error('Chargement du module impossible. Rechargez la page.');
      } else {
        toast.error('Actualisation impossible. Réessayez.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
    return () => {
      if (armedTimer.current) clearTimeout(armedTimer.current);
    };
  }, [load]);

  const inspections = data?.inspections ?? [];

  // ── Abonnement expiré ? (bannière corail) ──
  const subscriptionExpired = useMemo(() => {
    if (!data) return false;
    return (
      data.subscription.status !== 'active' ||
      new Date(data.subscription.endDate).getTime() < Date.now()
    );
  }, [data]);

  // ── Fin d'onboarding → formulaire pré-rempli ──
  const handleOnboardingFinish = (result: OnboardingResult) => {
    setOnboardingActive(false);
    setPrefill({
      propertyName: result.propertyName,
      propertyAddress: result.propertyAddress,
      ownerName: result.profile.fullName,
    });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Actions par ligne ──
  const copyLink = async (row: InspectionRow) => {
    try {
      await navigator.clipboard.writeText(row.shareUrl);
      toast.success('Lien copié.', { description: row.shareUrl });
    } catch {
      toast.error('Copie impossible — sélectionnez le lien manuellement.', {
        description: row.shareUrl,
      });
    }
  };

  const openEmail = (row: InspectionRow) => {
    if (!row.guestEmail) {
      toast.warning('Aucun email connu pour cet invité.', {
        description: 'Ajoutez son email ou partagez le lien par WhatsApp.',
      });
      return;
    }
    window.location.href = mailtoLink(row.guestEmail, row.guestName, row.shareUrl);
  };

  // ── Export intelligent pour litige Airbnb (1 clic) ──
  const handleAirbnbDispute = async (row: InspectionRow) => {
    if (disputeBusyId) return;
    setDisputeBusyId(row.id);
    try {
      const message = buildClassicDisputeMessage({
        propertyName: row.propertyName,
        guestName: row.guestName,
        scheduledDate: row.scheduledDate,
        sha256Hash: row.sha256Hash,
        ownerName: row.ownerName,
        shareUrl: row.shareUrl,
      });
      const { copied, popupBlocked } = await prepareAirbnbDispute({
        pdfUrl: `/api/inspection/pdf/${row.publicToken}`,
        pdfFilename: `Roomscan_Bouclier_${sanitizeFilePart(row.propertyName)}_${sanitizeFilePart(row.guestName)}.pdf`,
        message,
      });
      if (copied) {
        toast.success('Dossier Airbnb prêt !', {
          description:
            '1. Le PDF certifié a été téléchargé. 2. Le message juridique est copié — collez le texte et joignez le PDF.',
          duration: 12000,
          action: popupBlocked
            ? {
                label: 'Ouvrir Airbnb',
                onClick: () => {
                  openAirbnbResolutionCenter();
                },
              }
            : undefined,
        });
      } else {
        setDisputeMessage(message);
        toast.error('Copie automatique impossible — copiez manuellement le message affiché.', {
          duration: 9000,
        });
      }
    } finally {
      setDisputeBusyId(null);
    }
  };

  /** Dégâts constatés (ménage à nettoyer / très sale) + document signé. */
  const hasDamages = (row: InspectionRow) =>
    row.status === 'COMPLETED' &&
    (row.cleanlinessScore === 'A_NETTOYER' || row.cleanlinessScore === 'TRES_SALE');

  const patchInspection = async (
    row: InspectionRow,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    if (busyRowId) return;
    setBusyRowId(row.id);
    try {
      const res = await fetch(`/api/inspection/manage/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? 'Modification impossible.');
        return;
      }
      toast.success(successMessage);
      await load('refresh');
    } catch {
      toast.error('Modification impossible. Vérifiez votre connexion.');
    } finally {
      setBusyRowId(null);
    }
  };

  const deleteInspection = async (row: InspectionRow) => {
    if (busyRowId) return;
    setBusyRowId(row.id);
    try {
      const res = await fetch(`/api/inspection/manage/${row.id}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(json?.error ?? 'Suppression impossible.');
        return;
      }
      toast.success(`État des lieux « ${row.propertyName} » supprimé.`);
      setDeleteArmedId(null);
      await load('refresh');
    } catch {
      toast.error('Suppression impossible. Vérifiez votre connexion.');
    } finally {
      setBusyRowId(null);
    }
  };

  /** Arme la suppression (confirm double-clic, désarmement auto 5 s). */
  const armDelete = (id: string) => {
    setDeleteArmedId(id);
    if (armedTimer.current) clearTimeout(armedTimer.current);
    armedTimer.current = setTimeout(() => setDeleteArmedId(null), 5000);
  };

  const openReschedule = (row: InspectionRow) => {
    const d = new Date(row.scheduledDate);
    const pad = (n: number) => String(n).padStart(2, '0');
    setRescheduleDate(
      Number.isNaN(d.getTime())
        ? ''
        : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
    setRescheduleRow(row);
  };

  const submitReschedule = () => {
    if (!rescheduleRow || !rescheduleDate) return;
    const parsed = new Date(rescheduleDate);
    if (Number.isNaN(parsed.getTime())) {
      toast.error('La date choisie est invalide.');
      return;
    }
    void patchInspection(
      rescheduleRow,
      { scheduledDate: parsed.toISOString() },
      `Reprogrammé au ${formatFrDateTime(parsed.toISOString())}.`,
    );
    setRescheduleRow(null);
  };

  // ── Bloc actions (partagé table desktop / cartes mobiles) ──
  const renderActions = (row: InspectionRow) => {
    if (deleteArmedId === row.id) {
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void deleteInspection(row)}
            disabled={busyRowId === row.id}
            className="inline-flex min-h-[44px] items-center rounded-full bg-[#C21F26] px-3 text-xs font-bold text-white transition-colors hover:bg-[#a81a20] disabled:opacity-60 sm:min-h-0 sm:py-1"
            aria-label={`Confirmer la suppression de l'état des lieux ${row.propertyName}`}
          >
            Confirmer
          </button>
          <button
            type="button"
            onClick={() => setDeleteArmedId(null)}
            className={cn(LIGHT_ROW_ACTION_BTN, 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900')}
            aria-label="Annuler la suppression"
          >
            Annuler
          </button>
        </span>
      );
    }

    return (
      <span className="flex flex-wrap items-center gap-0.5">
        <a
          href={whatsappLink(row.guestName, row.shareUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(LIGHT_ROW_ACTION_BTN, 'text-emerald-600 hover:text-emerald-700')}
          aria-label={`Envoyer l'état des lieux par WhatsApp à ${row.guestName}`}
        >
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => openEmail(row)}
          className={cn(LIGHT_ROW_ACTION_BTN, 'text-teal-600 hover:text-teal-700')}
          aria-label={`Envoyer l'état des lieux par email à ${row.guestName}`}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => void copyLink(row)}
          className={LIGHT_ROW_ACTION_BTN}
          aria-label={`Copier le lien public de l'état des lieux ${row.propertyName}`}
        >
          Copier le lien
        </button>
        <button
          type="button"
          onClick={() => window.open(`/api/inspection/pdf/${row.publicToken}`, '_blank')}
          className={LIGHT_ROW_ACTION_BTN}
          aria-label={`Ouvrir le PDF de l'état des lieux ${row.propertyName}`}
        >
          PDF
        </button>
        <button
          type="button"
          onClick={() => window.open(`/inspection/${row.publicToken}`, '_blank')}
          className={LIGHT_ROW_ACTION_BTN}
          aria-label={`Consulter l'état des lieux ${row.propertyName}`}
        >
          Voir
        </button>

        {hasDamages(row) ? (
          <button
            type="button"
            onClick={() => void handleAirbnbDispute(row)}
            disabled={disputeBusyId !== null}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#C21F26] px-3 text-xs font-bold text-white shadow-[0_10px_28px_-12px_rgba(194,31,38,0.7)] transition-colors hover:bg-[#a81a20] disabled:opacity-60 sm:min-h-0 sm:py-1.5"
            aria-label={`Préparer le dossier Airbnb pour l'état des lieux ${row.propertyName}`}
          >
            🛡️ Préparer le dossier Airbnb
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleAirbnbDispute(row)}
            disabled={disputeBusyId !== null}
            className={cn(LIGHT_ROW_ACTION_BTN, 'text-[#C21F26] hover:text-[#a81a20]')}
            aria-label={`Préparer le dossier Airbnb pour l'état des lieux ${row.propertyName}`}
          >
            🛡️ Airbnb
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(LIGHT_ROW_ACTION_BTN, 'px-2 font-bold')}
              aria-label={`Plus d'actions pour ${row.propertyName}`}
            >
              ▾
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="border-gray-200 bg-white text-gray-900 dark:border-gray-200 dark:bg-white dark:text-gray-900"
          >
            <DropdownMenuItem
              onClick={() => openReschedule(row)}
              disabled={row.status === 'COMPLETED'}
              className="focus:bg-gray-100 focus:text-gray-900 dark:focus:bg-gray-100 dark:focus:text-gray-900"
            >
              Reprogrammer
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => armDelete(row.id)}
              className="text-red-600 focus:bg-red-50 focus:text-red-600 dark:focus:bg-red-50 dark:focus:text-red-600"
            >
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    );
  };

  // ── Onboarding (liste vide, onglet classique uniquement) ──
  if (onboardingActive && tab === 'classic' && !loading) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
        <main className="flex-1">
          <InspectionOnboarding
            sessionName={sessionUser.name}
            sessionEmail={sessionUser.email}
            onFinish={handleOnboardingFinish}
          />
        </main>
        <Toaster position="top-center" richColors theme="light" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
      {/* ----- Header de page (mode clair v4.122) ----- */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 sm:px-6">
        <Link
          href="/airbnb"
          className="hidden rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:inline-flex"
          aria-label="Retour au tableau de bord"
        >
          ‹ Retour
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="lux-display truncate text-[15px] font-semibold text-gray-900">
            RoomScan
          </span>
          <span className="hidden rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#C21F26] sm:inline">
            Module État des Lieux
          </span>
        </div>
        <span className="ml-auto text-[11px] text-gray-500">
          {loading ? (
            <LuxBusyDot className="mx-2" color="#C21F26" />
          ) : (
            <>
              {inspections.length} document{inspections.length > 1 ? 's' : ''}
            </>
          )}
        </span>
      </header>

      {/* ----- Segmented control : Bouclier automatisé / EDL classique ----- */}
      {/* v4.121 — client : « tout est flou, met couleur rouge en fond, écriture en blanc »
          → fond rouge PLEIN (plus de translucide/backdrop-blur), textes blancs. */}
      <div className="sticky top-16 z-20 border-b border-[#8f1418] bg-[#C21F26]">
        {/* ── v4.120 — ACCÈS DIRECT AU NOUVEAU PARCOURS depuis le lien EDL
            du dashboard client : /payment/success (Certificat Anti-Dégâts)
            + wizard d'onboarding dynamique 5 min — les 2 pages n'étaient
            accessibles QUE via Stripe, jamais depuis ce dashboard. ── */}
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="mt-2.5 flex flex-col gap-2 rounded-xl border border-white/25 bg-[#a81a20] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white">
                🛡️ Certificat Anti-Dégâts — votre protection en 5 minutes
              </p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug text-white">
                Configurez votre logement une seule fois (chambres, équipements, photos de
                référence), puis générez vos attestations en 90 secondes.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href="/onboarding/wizard?step=1"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-white px-4 text-xs font-bold text-[#C21F26] shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55)] transition-colors hover:bg-red-50"
                aria-label="Ouvrir le wizard d'onboarding en 5 étapes dynamiques"
              >
                ⚙️ WIZARD 5 MIN →
              </Link>
              <Link
                href="/payment/success"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white bg-transparent px-4 text-xs font-bold text-white transition-colors hover:bg-white/20"
                aria-label="Voir la page du Certificat Anti-Dégâts"
              >
                🛡️ MON CERTIFICAT
              </Link>
            </div>
          </div>
        </div>
        <div
          className="mx-auto flex w-full max-w-6xl items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6"
          role="tablist"
          aria-label="Choix du mode d'état des lieux"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'shield'}
            onClick={() => setTab('shield')}
            className={cn(
              'min-h-[44px] shrink-0 rounded-full px-4 text-xs font-bold uppercase tracking-[0.08em] transition-colors sm:px-5',
              tab === 'shield'
                ? 'bg-white text-[#C21F26] shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)]'
                : 'text-white hover:bg-[#a81a20] hover:text-white',
            )}
          >
            Bouclier automatisé
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'classic'}
            onClick={() => setTab('classic')}
            className={cn(
              'min-h-[44px] shrink-0 rounded-full px-4 text-xs font-bold uppercase tracking-[0.08em] transition-colors sm:px-5',
              tab === 'classic'
                ? 'bg-white text-[#C21F26]'
                : 'text-white hover:bg-[#a81a20] hover:text-white',
            )}
          >
            État des lieux classique
          </button>
        </div>
      </div>

      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6"
      >
        {/* ----- Onglet « Bouclier automatisé » (v5.1) ----- */}
        {tab === 'shield' ? (
          <ShieldManager sessionUser={sessionUser} />
        ) : (
          <>
        {/* ----- En-tête du module ----- */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#C21F26]">
              Module indépendant — 299 €/an
            </p>
            <h1 className="lux-display mt-1 text-2xl font-semibold text-gray-900 sm:text-3xl">
              États des Lieux
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Module indépendant — générations illimitées
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setPrefill(null);
              setFormOpen((open) => !open);
            }}
            aria-expanded={formOpen}
            aria-controls="edl-create-zone"
            className="h-11 rounded-full bg-[#C21F26] px-5 text-sm font-semibold text-white shadow-[0_10px_28px_-12px_rgba(194,31,38,0.7)] hover:bg-[#a81a20]"
            aria-label="Créer un nouvel état des lieux"
          >
            + Nouvel état des lieux
          </Button>
        </div>

        {/* ----- Bannière abonnement expiré (corail) ----- */}
        {subscriptionExpired && data && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <span aria-hidden="true" className="lux-dot bg-red-500" />
            <span className="font-semibold">
              Abonnement expiré — renouvelez pour créer de nouveaux documents
            </span>
            <span className="text-xs text-red-600">
              (fin le {formatFrDateTime(data.subscription.endDate)})
            </span>
          </div>
        )}

        {/* ----- Zone de création (repliable) ----- */}
        <div id="edl-create-zone" className="mt-5">
          {formOpen ? (
            <InspectionCreateForm
              entreeOptions={inspections}
              prefill={prefill}
              onSuccess={async () => {
                setFormOpen(false);
                setPrefill(null);
                await load('refresh');
              }}
              onClose={() => {
                setFormOpen(false);
                setPrefill(null);
              }}
            />
          ) : null}
        </div>

        {/* ----- Contenu : squelette / vide / tableau ----- */}
        {loading ? (
          <div className="mt-5 space-y-3" role="status" aria-label="Chargement des états des lieux">
            <Skeleton className="h-24 w-full rounded-2xl bg-gray-200 dark:bg-gray-200" />
            <Skeleton className="h-48 w-full rounded-2xl bg-gray-200 dark:bg-gray-200" />
          </div>
        ) : inspections.length === 0 ? (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white py-10 text-center shadow-sm">
            <span aria-hidden="true" className="lux-dot bg-[#C21F26]" />
            <p className="text-sm font-semibold text-gray-900">Aucun état des lieux pour le moment</p>
            <p className="mt-1 max-w-md text-xs text-gray-500">
              Créez votre premier document : pièces réglementaires pré-remplies, partage par lien,
              WhatsApp ou email, signature de l&apos;invité et PDF.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFormOpen(true)}
              className={cn('mt-2 h-11 rounded-full px-5 text-sm', LIGHT_GHOST_BTN)}
              aria-label="Créer mon premier état des lieux"
            >
              Créer mon premier état des lieux
            </Button>
          </div>
        ) : (
          <>
            {/* ----- Tableau (desktop ≥ md) ----- */}
            <div
              className="mt-5 hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block"
              aria-label="Liste des états des lieux"
            >
              <div className="lux-scroll max-h-[70vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-200 bg-gray-50/80 hover:bg-gray-50/80">
                      <TableHead className="text-gray-500">Logement</TableHead>
                      <TableHead className="text-gray-500">Invité</TableHead>
                      <TableHead className="text-gray-500">Type</TableHead>
                      <TableHead className="text-gray-500">Date</TableHead>
                      <TableHead className="text-gray-500">Statut</TableHead>
                      <TableHead className="text-right text-gray-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections.map((row) => (
                      <TableRow key={row.id} className="border-gray-100 hover:bg-gray-50">
                        <TableCell className="max-w-[220px] align-top">
                          <p className="truncate font-semibold text-gray-900">{row.propertyName}</p>
                          <p className="mt-0.5 truncate text-[11px] text-gray-500">
                            {row.propertyAddress}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-[180px] align-top">
                          <p className="truncate font-medium text-gray-900">{row.guestName}</p>
                          <p className="mt-0.5 truncate text-[11px] text-gray-500">
                            {row.guestEmail ?? '—'}
                          </p>
                        </TableCell>
                        <TableCell className="align-top">
                          <TypeBadge type={row.type} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top text-sm text-gray-600">
                          {formatFrDateTime(row.scheduledDate)}
                        </TableCell>
                        <TableCell className="align-top">
                          <StatusBadge status={row.status} />
                          {row.photoCount > 0 && (
                            <p className="mt-1 text-[11px] text-gray-500">
                              {row.photoCount} photo{row.photoCount > 1 ? 's' : ''}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex justify-end">{renderActions(row)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* ----- Cartes empilées (mobile < md) ----- */}
            <ul className="mt-5 space-y-3 md:hidden" aria-label="Liste des états des lieux">
              {inspections.map((row) => (
                <li
                  key={row.id}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{row.propertyName}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{row.propertyAddress}</p>
                    </div>
                    <TypeBadge type={row.type} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={row.status} />
                    <span className="text-xs text-gray-600">{formatFrDateTime(row.scheduledDate)}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-gray-900">
                    {row.guestName}
                    <span className="font-normal text-gray-500">
                      {row.guestEmail ? ` · ${row.guestEmail}` : ''}
                      {row.photoCount > 0 ? ` · ${row.photoCount} photo${row.photoCount > 1 ? 's' : ''}` : ''}
                    </span>
                  </p>
                  <div className="mt-3 border-t border-gray-100 pt-3">{renderActions(row)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
          </>
        )}
      </motion.main>

      {/* ----- Footer collé en bas (mt-auto + safe area) ----- */}
      <footer className="mt-auto border-t border-gray-200 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-xs text-gray-500">
          Copyright © <span className="lux-display font-semibold text-gray-900">RoomScan</span> 2025
          — États des Lieux, module indépendant
        </p>
      </footer>

      {/* ----- Dialog : Reprogrammer ----- */}
      <Dialog open={rescheduleRow !== null} onOpenChange={(v) => !v && setRescheduleRow(null)}>
        <DialogContent className="border-gray-200 bg-white text-gray-900 dark:border-gray-200 dark:bg-white dark:text-gray-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="lux-display text-lg">Reprogrammer l&apos;état des lieux</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {rescheduleRow
                ? `${rescheduleRow.propertyName} — ${rescheduleRow.guestName}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="edl-reschedule-date" className="text-xs text-gray-700">
              Nouvelle date visée
            </Label>
            <Input
              id="edl-reschedule-date"
              type="datetime-local"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className={cn('h-11', LIGHT_FIELD, '[color-scheme:light]')}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRescheduleRow(null)}
              className={cn('h-11 rounded-full px-5', LIGHT_GHOST_BTN)}
              aria-label="Annuler la reprogrammation"
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submitReschedule}
              disabled={!rescheduleDate || busyRowId !== null}
              className="h-11 rounded-full bg-[#C21F26] px-5 text-sm font-semibold text-white hover:bg-[#a81a20]"
              aria-label="Enregistrer la nouvelle date"
            >
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ----- Dialog : message juridique Airbnb (copie manuelle) ----- */}
      <AirbnbDisputeDialog
        open={disputeMessage !== null}
        message={disputeMessage ?? ''}
        onOpenChange={(v) => {
          if (!v) setDisputeMessage(null);
        }}
      />

      {/* Toasts du module (sonner, position haute comme l'espace hôte) */}
      <Toaster position="top-center" richColors theme="light" />
    </div>
  );
}

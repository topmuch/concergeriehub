'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { ContextualInsight } from '@/components/airbnb/host/contextual-insight';
import { KPICard } from '@/components/airbnb/host/kpi-card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// =============================================================
// GuestsContent — onglet « Invités » du Dashboard Client (mini-CRM)
// v4.80 — REFAONTE « ENGAGEANTE » (demande client) :
//   • 2 VUES : « Séjours » (historique complet par séjour) et
//     « États des lieux » (tous les documents signés) ;
//   • vue États des lieux : chaque document affiche NOM du client,
//     DATE de signature, NOMBRE DE JOURS du séjour, LIEN WEB public
//     et PDF — exactement ce que l'hôte doit retrouver ;
//   • 5 KPIs (séjours, en cours, EDL signés, EDL à venir, CA) ;
//   • cartes séjours expandables : commandes minibar/pressing,
//     états des lieux (entrée + sortie, PDF + preuve publique),
//     ménages associés par fenêtre de dates, livre d'or.
// Design : v5.2 « SAPHIR LUXE » — nuit saphir (.lux-card/.lux-chip/.lux-dot),
// SANS icônes ni emojis décoratifs, portails sombres bg-[#0b1226].
// =============================================================

// ----- Types (miroir du payload /api/airbnb/guests) -----

interface MinibarItemLite {
  name: string;
  qty: number;
}

interface GuestMinibarOrder {
  id: string;
  items: MinibarItemLite[];
  totalEur: number;
  payment: string;
  status: string;
  createdAt: string;
}

interface GuestLaundryOrder {
  id: string;
  serviceType: string;
  pieces: number;
  pickupSlot: string;
  amountEur: number;
  payment: string;
  status: string;
  createdAt: string;
}

interface GuestInspection {
  id: string;
  publicToken: string;
  signedAt: string;
  guestName: string;
  status: string;
  selfAssessment: number;
  /** v4.80 — 'checkin' = état des lieux d'ARRIVÉE | 'checkout' = SORTIE. */
  type: 'checkin' | 'checkout';
  hasDamages: boolean;
}

interface GuestCheckoutReport {
  id: string;
  minibarTotal: number;
  signalementsCount: number;
  departedAt: string | null;
  cleaningValidatedAt: string | null;
  restockPending: boolean;
}

interface GuestMemory {
  id: string;
  guestName: string;
  rating: number;
  message: string | null;
  isApproved: boolean;
  isPublic: boolean;
  hostReply: string | null;
  createdAt: string;
}

interface GuestMiddleStay {
  id: string;
  requestType: string;
  status: string;
  details: string | null;
  createdAt: string;
}

interface GuestBooking {
  id: string;
  propertyId: string;
  propertyName: string | null;
  guestName: string | null;
  guestEmail: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  source: string;
  status: string;
  accessCode: string | null;
  minibarOrders: GuestMinibarOrder[];
  laundryOrders: GuestLaundryOrder[];
  checkOutInspections: GuestInspection[];
  checkoutReports: GuestCheckoutReport[];
  guestMemories: GuestMemory[];
  middleStayRequests: GuestMiddleStay[];
}

interface CleaningLite {
  id: string;
  staffName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  checklistDone: number;
  checklistTotal: number;
  photosCount: number;
}

type GuestsApiResponse = {
  bookings: GuestBooking[];
  cleaningByProperty: Record<string, CleaningLite[]>;
};

// ----- Métadonnées d'affichage -----

/** Badges statut séjour — nuit saphir (lux-chip + point coloré, sans icône). */
const BOOKING_STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  CONFIRMED: {
    label: 'Confirmé',
    className: 'lux-chip',
    dot: '#5c8af0',
  },
  CHECKED_IN: {
    label: 'En cours',
    className: 'lux-chip',
    dot: '#34d399',
  },
  CHECKED_OUT: {
    label: 'Parti',
    className: 'lux-chip',
    dot: '#8fa0c2',
  },
  CANCELLED: {
    label: 'Annulé',
    className: 'lux-chip',
    dot: '#f07d6a',
  },
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manuel',
  AIRBNB: 'Airbnb',
  BOOKING: 'Booking.com',
  ICAL: 'iCal',
};

const LAUNDRY_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Paiement en cours',
  REQUESTED: 'Demandée',
  PAID: 'Réglée',
  IN_PROGRESS: 'En cours',
  READY: 'Prête à livrer',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};

const LAUNDRY_TYPE_LABELS: Record<string, string> = {
  ironing: 'Repassage express',
  washing: 'Lessive complète',
  drycleaning: 'Pressing à sec',
};

const INSPECTION_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de traitement',
  reviewed: 'Examiné',
  resolved: 'Résolu',
  disputed: 'Contesté',
};

const MIDDLE_STAY_LABELS: Record<string, string> = {
  restock: 'Réassort',
  cleaning: 'Ménage en cours de séjour',
};

const MIDDLE_STAY_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  in_progress: 'En cours',
  completed: 'Traité',
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'CONFIRMED', label: 'Confirmés' },
  { value: 'CHECKED_IN', label: 'En cours' },
  { value: 'CHECKED_OUT', label: 'Partis' },
  { value: 'CANCELLED', label: 'Annulés' },
];

const DAY_MS = 86_400_000;

/** v4.80 — méta par TYPE d'état des lieux (entrée = émeraude, sortie = ambre). */
const INSPECTION_TYPE_META: Record<
  'checkin' | 'checkout',
  { label: string; dot: string; pill: string; band: string }
> = {
  checkin: {
    label: 'Arrivée',
    dot: '#34d399',
    pill: 'border-[#34d399]/30 bg-[#34d399]/12 text-[#86e9cb]',
    band: 'bg-[#34d399]/40',
  },
  checkout: {
    label: 'Départ',
    dot: '#fbbf24',
    pill: 'border-[#fbbf24]/30 bg-[#fbbf24]/12 text-[#fbbf24]',
    band: 'bg-[#fbbf24]/40',
  },
};

// ----- Helpers -----

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function initialsOf(name: string | null): string {
  const clean = name?.trim();
  if (!clean) return '?';
  return (
    clean
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ci = new Date(checkIn).getTime();
  const co = new Date(checkOut).getTime();
  if (Number.isNaN(ci) || Number.isNaN(co)) return 0;
  return Math.max(1, Math.ceil((co - ci) / DAY_MS));
}

const fmtDayMonth = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });
const fmtFullDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function safeDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function minibarItemsLabel(items: MinibarItemLite[]): string {
  if (items.length === 0) return 'Commande';
  return items.map((it) => `${it.qty} × ${it.name}`).join(', ');
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  } catch {
    toast.error('Copie impossible sur ce navigateur');
  }
}

// =============================================================
// CARTE ÉTAT DES LIEUX — vue dédiée (v4.80, demande client :
// « lien web, PDF, nom du client, date et nombre de jours »)
// =============================================================

function InspectionCard({ row }: { row: InspectionRow }) {
  const meta = INSPECTION_TYPE_META[row.inspection.type];
  const signedAt = safeDate(row.inspection.signedAt);
  const checkIn = safeDate(row.booking.checkIn);
  const checkOut = safeDate(row.booking.checkOut);
  const nights = nightsBetween(row.booking.checkIn, row.booking.checkOut);
  const publicUrl = `/public/inspection/${encodeURIComponent(row.inspection.publicToken)}`;
  const pdfUrl = `/api/public/inspection/${encodeURIComponent(row.inspection.publicToken)}/pdf`;

  return (
    <article
      className="lux-card flex min-w-0 flex-col overflow-hidden"
      aria-label={`État des lieux ${meta.label} de ${row.inspection.guestName || 'invité'}`}
    >
      {/* Liseré teinté par type */}
      <div className={cn('h-1.5 w-full', meta.band)} aria-hidden="true" />

      <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
        {/* En-tête : monogramme + nom + pill type */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="lux-num flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#3d6fe0]/15 text-sm font-semibold text-[#a9c4ff] ring-1 ring-[#5c8af0]/25"
          >
            {initialsOf(row.inspection.guestName || row.booking.guestName)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="lux-display truncate text-lg font-semibold text-white">
              {row.inspection.guestName?.trim() || row.booking.guestName?.trim() || 'Invité'}
            </h3>
            <p className="mt-0.5 truncate text-xs text-[#8fa0c2]">
              {row.booking.propertyName ?? 'Bien'}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
              meta.pill,
            )}
          >
            <span className="lux-dot" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
            {meta.label}
          </span>
        </div>

        {/* Infos demandées : date + durée + statut */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div>
            <p className="lux-eyebrow !text-[9.5px]">Signé le</p>
            <p className="mt-1 font-semibold text-white">
              {signedAt ? fmtFullDate.format(signedAt) : '—'}
              {signedAt ? ` · ${fmtTime.format(signedAt)}` : ''}
            </p>
          </div>
          <div>
            <p className="lux-eyebrow !text-[9.5px]">Séjour</p>
            <p className="mt-1 font-semibold text-white">
              {checkIn && checkOut
                ? `${nights} jour${nights > 1 ? 's' : ''}`
                : '—'}
              {checkIn && checkOut ? (
                <span className="ml-1 font-medium text-[#8fa0c2]">
                  ({fmtDayMonth.format(checkIn)} → {fmtDayMonth.format(checkOut)})
                </span>
              ) : null}
            </p>
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-1.5">
            <span className="lux-chip !text-[10px]">
              <span
                className="lux-dot"
                style={{ backgroundColor: row.booking.status === 'CHECKED_IN' ? '#34d399' : '#8fa0c2' }}
                aria-hidden="true"
              />
              {BOOKING_STATUS_META[row.booking.status]?.label ?? row.booking.status}
            </span>
            {row.inspection.hasDamages && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f07d6a]/30 bg-[#f07d6a]/12 px-2 py-0.5 text-[10px] font-semibold text-[#ffab92]">
                <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
                Dégâts signalés
              </span>
            )}
            {row.inspection.type === 'checkout' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-[#8fa0c2]">
                <span aria-hidden="true" className="text-[#e9c47c]">★</span>
                <span className="lux-num font-semibold text-white">{row.inspection.selfAssessment}/5</span>
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-[#8fa0c2]">
              {INSPECTION_STATUS_LABELS[row.inspection.status] ?? row.inspection.status}
            </span>
          </div>
        </div>

        {/* Actions : LIEN WEB + PDF (demande client) */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="lux-btn h-9 flex-1 px-3 text-[11px]"
            aria-label="Ouvrir le lien web public de l'état des lieux"
          >
            Lien web public
          </a>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="lux-btn-ghost h-9 flex-1 px-3 text-[11px]"
            aria-label="Ouvrir le PDF de l'état des lieux"
          >
            PDF signé
          </a>
          <button
            type="button"
            onClick={() => void copyText(publicUrl, 'Lien public copié')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-[#8fa0c2] transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Copier le lien public"
          >
            <span aria-hidden="true" className="text-sm leading-none">⧉</span>
          </button>
        </div>
      </div>
    </article>
  );
}

/** Ligne aplatie séjour + inspection (vue États des lieux). */
interface InspectionRow {
  booking: GuestBooking;
  inspection: GuestInspection;
}

// =============================================================
// Carte séjour expandable
// =============================================================

function StayCard({
  booking,
  cleanings,
  expanded,
  onToggle,
  onCancelled,
}: {
  booking: GuestBooking;
  cleanings: CleaningLite[];
  expanded: boolean;
  onToggle: () => void;
  /** v5.6 — appelé après annulation réussie (rechargement de la liste). */
  onCancelled?: () => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  // v5.6 — « Annuler le séjour » directement depuis la carte (onglet
  // Séjours) : double clic de sécurité (armement → confirmation).
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!expanded) {
      setCancelArmed(false);
    }
  }, [expanded]);
  const statusMeta = BOOKING_STATUS_META[booking.status] ?? {
    label: booking.status,
    className: 'lux-chip',
    dot: '#8fa0c2',
  };
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const checkInDate = safeDate(booking.checkIn);
  const checkOutDate = safeDate(booking.checkOut);
  const hasCheckin = booking.checkOutInspections.some((i) => i.type === 'checkin');
  const hasCheckout = booking.checkOutInspections.some((i) => i.type === 'checkout');

  const copyAccessCode = async () => {
    if (!booking.accessCode) return;
    await copyText(booking.accessCode, 'Code d\'accès copié');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  /** v5.6 — annulation du séjour (PATCH status=CANCELLED). Les droits
   *  (propriétaire / gestionnaire) sont vérifiés côté API — le message
   *  d'erreur est affiché tel quel sinon. */
  async function cancelStay() {
    setCancelling(true);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${booking.propertyId}/bookings?bookingId=${encodeURIComponent(booking.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'CANCELLED' }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Annulation refusée');
      toast.success('Séjour annulé — l\'invité perd immédiatement l\'accès au hub');
      setCancelArmed(false);
      await onCancelled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <article
      className={cn(
        'lux-card flex min-w-0 flex-col gap-3 p-4 sm:p-5',
        expanded && 'ring-1 ring-[#5c8af0]/30',
      )}
      aria-label={`Séjour de ${booking.guestName ?? 'invité'} du ${checkInDate ? fmtFullDate.format(checkInDate) : '—'}`}
    >
      {/* ---------- En-tête : monogramme + identité + dates ---------- */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="lux-num flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#3d6fe0]/15 text-sm font-semibold text-[#a9c4ff] ring-1 ring-[#5c8af0]/25"
        >
          {initialsOf(booking.guestName)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="lux-display truncate text-lg font-semibold text-white">
            {booking.guestName?.trim() || 'Invité'}
          </h3>
          <p className="mt-0.5 truncate text-xs text-[#8fa0c2]">
            {checkInDate && checkOutDate
              ? `${fmtDayMonth.format(checkInDate)} → ${fmtFullDate.format(checkOutDate)} · ${nights} nuit${nights > 1 ? 's' : ''}`
              : 'Dates indisponibles'}
          </p>
          {/* v4.81 (AUDIT QA) — email invité : présent dans l'API et la
              recherche mais jamais affiché dans la carte. */}
          {booking.guestEmail ? (
            <a
              href={`mailto:${booking.guestEmail}`}
              className="mt-0.5 block truncate text-xs text-[#a9c4ff] hover:underline"
              aria-label={`Envoyer un email à ${booking.guestName || 'l’invité'}`}
            >
              {booking.guestEmail}
            </a>
          ) : null}
          <p className="mt-0.5 truncate text-xs text-[#8fa0c2]">
            {booking.propertyName ?? 'Bien'}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8fa0c2] transition-colors hover:bg-white/[0.06] hover:text-white"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Replier le détail du séjour' : 'Déplier le détail du séjour'}
        >
          <span
            aria-hidden="true"
            className={cn('inline-block text-base leading-none transition-transform', expanded && 'rotate-180')}
          >
            ▾
          </span>
        </button>
      </div>

      {/* ---------- Badges : statut + source + voyageurs + EDL ---------- */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className={cn('lux-chip', statusMeta.className)}>
          <span className="lux-dot" style={{ backgroundColor: statusMeta.dot }} aria-hidden="true" />
          {statusMeta.label}
        </span>
        <span className="lux-chip">
          {SOURCE_LABELS[booking.source] ?? booking.source}
        </span>
        <span className="lux-chip">
          {booking.guests} voyageur{booking.guests > 1 ? 's' : ''}
        </span>
        {hasCheckin && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#34d399]/30 bg-[#34d399]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#86e9cb]">
            EDL arrivée ✓
          </span>
        )}
        {hasCheckout && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fbbf24]/30 bg-[#fbbf24]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#fbbf24]">
            EDL départ ✓
          </span>
        )}
      </div>

      {/* ---------- Code d'accès ---------- */}
      {booking.accessCode && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="lux-eyebrow !text-[9.5px]">Code d&apos;accès</span>
          <code className="min-w-0 flex-1 truncate font-mono text-sm font-bold tracking-widest text-white">
            {booking.accessCode}
          </code>
          <button
            type="button"
            onClick={() => void copyAccessCode()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8fa0c2] transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label="Copier le code d'accès"
          >
            <span aria-hidden="true" className={cn('text-sm leading-none', copied && 'text-[#86e9cb]')}>
              {copied ? '✓' : '⧉'}
            </span>
          </button>
        </div>
      )}

      {/* ---------- Détail expandable : 4 blocs ---------- */}
      {expanded && (
        <div className="mt-1 grid grid-cols-1 gap-4 border-t border-white/10 pt-4 md:grid-cols-2">
          {/* Commandes */}
          <StayOrdersBlock booking={booking} />

          {/* États des lieux */}
          <StayInspectionsBlock booking={booking} />

          {/* Ménages */}
          <StayCleaningsBlock cleanings={cleanings} />

          {/* Livre d'or */}
          <StayMemoriesBlock booking={booking} />
        </div>
      )}

      {/* ---------- v5.6 — Annuler le séjour (demande client) ---------- */}
      {expanded && booking.status !== 'CANCELLED' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
          <p className="min-w-0 text-[11px] leading-relaxed text-[#8fa0c2]">
            Le hub de l&apos;invité se verrouille dès l&apos;annulation et le séjour sort du planning.
          </p>
          {cancelArmed ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={cancelling}
                onClick={() => void cancelStay()}
                className="inline-flex h-9 items-center rounded-full border border-[#f07d6a]/40 bg-[#f07d6a]/15 px-4 text-xs font-semibold text-[#ffab92] transition-colors hover:bg-[#f07d6a]/25 disabled:opacity-50"
              >
                {cancelling ? 'Annulation…' : 'Confirmer l\'annulation'}
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={() => setCancelArmed(false)}
                className="inline-flex h-9 items-center rounded-full px-3 text-xs text-[#8fa0c2] transition-colors hover:text-white disabled:opacity-50"
              >
                Retour
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCancelArmed(true)}
              className="inline-flex h-9 shrink-0 items-center rounded-full border border-[#f07d6a]/30 bg-[#f07d6a]/10 px-4 text-xs font-semibold text-[#ffab92] transition-colors hover:bg-[#f07d6a]/20 hover:text-[#ffab92]"
            >
              Annuler le séjour
            </button>
          )}
        </div>
      )}
    </article>
  );
}

// -------------------------------------------------------------
// Bloc Commandes (minibar + pressing)
// -------------------------------------------------------------
function StayOrdersBlock({ booking }: { booking: GuestBooking }) {
  const hasMinibar = booking.minibarOrders.length > 0;
  const hasLaundry = booking.laundryOrders.length > 0;

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3" aria-label="Commandes du séjour">
      <h4 className="lux-eyebrow">Commandes</h4>
      {!hasMinibar && !hasLaundry ? (
        <p className="mt-2 text-xs text-[#8fa0c2]">Aucune commande sur ce séjour.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {booking.minibarOrders.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white" title={minibarItemsLabel(o.items)}>
                  {minibarItemsLabel(o.items)}
                </p>
                <p className="text-[#8fa0c2]">
                  {o.payment === 'stripe' ? 'Paiement en ligne' : 'Sur place'}
                  {' · '}
                  {safeDate(o.createdAt) ? fmtFullDate.format(safeDate(o.createdAt)!) : ''}
                </p>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="lux-num text-sm font-semibold text-white">{formatEur(o.totalEur)}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                    o.status === 'PAID'
                      ? 'border-[#34d399]/30 bg-[#34d399]/12 text-[#86e9cb]'
                      : 'border-[#fbbf24]/30 bg-[#fbbf24]/12 text-[#fbbf24]',
                  )}
                >
                  <span
                    className="lux-dot"
                    style={{ backgroundColor: o.status === 'PAID' ? '#34d399' : '#fbbf24' }}
                    aria-hidden="true"
                  />
                  {o.status === 'PAID' ? 'Payée' : 'À régler'}
                </span>
              </span>
            </li>
          ))}
          {booking.laundryOrders.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">
                  {LAUNDRY_TYPE_LABELS[o.serviceType] ?? o.serviceType} · {o.pieces} pièce{o.pieces > 1 ? 's' : ''}
                </p>
                <p className="text-[#8fa0c2]">
                  Retrait {o.pickupSlot === 'morning' ? 'matin' : 'après-midi'}
                  {' · '}
                  {LAUNDRY_STATUS_LABELS[o.status] ?? o.status}
                </p>
              </div>
              <span className="lux-num shrink-0 text-sm font-semibold text-white">{formatEur(o.amountEur)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// -------------------------------------------------------------
// Bloc États des lieux (liens PDF + preuve publique, par type)
// -------------------------------------------------------------
function StayInspectionsBlock({ booking }: { booking: GuestBooking }) {
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3" aria-label="États des lieux du séjour">
      <h4 className="lux-eyebrow">
        États des lieux
        <span className="ml-1.5 !text-[9.5px] !tracking-normal normal-case">
          · {nights} jour{nights > 1 ? 's' : ''}
        </span>
      </h4>
      {booking.checkOutInspections.length === 0 ? (
        <p className="mt-2 text-xs text-[#8fa0c2]">
          Pas encore d&apos;état des lieu signé — l&apos;invité le signe depuis le Hub (arrivée et/ou départ).
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {booking.checkOutInspections.map((i) => {
            const meta = INSPECTION_TYPE_META[i.type];
            const signed = safeDate(i.signedAt);
            return (
              <li key={i.id} className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-white">
                    <span
                      className={cn(
                        'mr-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                        meta.pill,
                      )}
                    >
                      <span className="lux-dot !h-1 !w-1" style={{ backgroundColor: meta.dot }} aria-hidden="true" />
                      {meta.label}
                    </span>
                    {i.guestName || 'Invité'}
                  </span>
                  <span className="shrink-0 text-[#8fa0c2]">
                    {signed ? fmtFullDate.format(signed) : ''}
                  </span>
                </div>
                <p className="text-[#8fa0c2]">
                  {INSPECTION_STATUS_LABELS[i.status] ?? i.status}
                  {i.type === 'checkout' ? (
                    <> · <span aria-hidden="true" className="text-[#e9c47c]">★</span> <span className="lux-num font-semibold text-white">{i.selfAssessment}/5</span></>
                  ) : ''}
                  {i.hasDamages ? (
                    <> · <span className="font-semibold text-[#ffab92]">Dégâts signalés</span></>
                  ) : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/public/inspection/${encodeURIComponent(i.publicToken)}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-full border border-white/12 bg-white/[0.04] px-3 text-[11px] font-semibold text-[#a9c4ff] transition-colors hover:bg-white/[0.08] hover:text-white"
                    aria-label="Ouvrir le PDF de l'état des lieux"
                  >
                    Ouvrir le PDF
                  </a>
                  <a
                    href={`/public/inspection/${encodeURIComponent(i.publicToken)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-full border border-white/12 bg-white/[0.04] px-3 text-[11px] font-semibold text-[#8fa0c2] transition-colors hover:bg-white/[0.08] hover:text-white"
                    aria-label="Voir la preuve publique de l'état des lieux"
                  >
                    Voir la preuve
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// -------------------------------------------------------------
// Bloc Ménages (fenêtre [checkIn − 1 j ; checkOut + 1 j])
// -------------------------------------------------------------
function StayCleaningsBlock({ cleanings }: { cleanings: CleaningLite[] }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3" aria-label="Ménages autour du séjour">
      <h4 className="lux-eyebrow">Ménages</h4>
      {cleanings.length === 0 ? (
        <p className="mt-2 text-xs text-[#8fa0c2]">Aucun ménage enregistré sur cette période.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2 text-xs">
          {cleanings.slice(0, 4).map((c) => {
            const start = safeDate(c.startedAt);
            const end = safeDate(c.endedAt);
            return (
              <li key={c.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">
                    {c.staffName?.trim() || 'Équipe ménage'}
                  </p>
                  <p className="text-[#8fa0c2]">
                    {start ? `${fmtFullDate.format(start)} · ${fmtTime.format(start)}` : '—'}
                    {end ? ` → ${fmtTime.format(end)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-[#8fa0c2]">
                  {c.checklistTotal > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="text-[#86e9cb]">✓</span>
                      <span className="lux-num font-semibold text-white">{c.checklistDone}/{c.checklistTotal}</span>
                    </span>
                  )}
                  <span>
                    {c.photosCount} photo{c.photosCount > 1 ? 's' : ''}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// -------------------------------------------------------------
// Bloc Livre d'or (souvenirs rattachés au séjour)
// -------------------------------------------------------------
function StayMemoriesBlock({ booking }: { booking: GuestBooking }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3" aria-label="Livre d'or du séjour">
      <h4 className="lux-eyebrow">Livre d&apos;or</h4>
      {booking.guestMemories.length === 0 ? (
        <p className="mt-2 text-xs text-[#8fa0c2]">Aucun souvenir laissé pour ce séjour.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5 text-xs">
          {booking.guestMemories.map((m) => (
            <li key={m.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-white">{m.guestName || 'Invité'}</span>
                <span className="shrink-0 text-[#e9c47c]" aria-label={`Note ${m.rating} sur 5`}>
                  {'★'.repeat(Math.min(5, Math.max(0, m.rating)))}
                  <span className="ml-1 text-[#8fa0c2]">{m.rating}/5</span>
                </span>
              </div>
              {m.message && (
                <p className="line-clamp-2 text-[#8fa0c2]" title={m.message}>
                  « {m.message} »
                </p>
              )}
              {m.hostReply && (
                <p className="rounded-lg bg-white/[0.04] px-2 py-1 text-[#8fa0c2]">
                  <span className="font-semibold text-white">Réponse de l&apos;hôte :</span> {m.hostReply}
                </p>
              )}
              {!m.isApproved && (
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#fbbf24]/30 bg-[#fbbf24]/12 px-2 py-0.5 text-[10px] font-semibold text-[#fbbf24]">
                  <span className="lux-dot" style={{ backgroundColor: '#fbbf24' }} aria-hidden="true" />
                  En attente de modération
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// =============================================================
// Conteneur de page
// =============================================================
export function GuestsContent() {
  const { properties, selectedId, setSelectedId, propertiesLoading } = useHostContext();

  const [data, setData] = useState<GuestsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'checkin' | 'checkout'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // v4.80 — 2 vues : « Séjours » (historique) | « États des lieux » (documents).
  const [view, setView] = useState<'stays' | 'inspections'>('stays');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/airbnb/guests', { cache: 'no-store' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const payload = (await res.json()) as GuestsApiResponse;
      setData({ bookings: payload.bookings ?? [], cleaningByProperty: payload.cleaningByProperty ?? {} });
    } catch (err) {
      console.error('[GuestsContent] fetch failed:', err);
      setError('Impossible de charger les séjours. Réessayez dans un instant.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ----- Filtres client-side -----
  const bookings = data?.bookings ?? [];

  const filtered = useMemo(() => {
    const q = normalizeText(search.trim());
    return bookings.filter((b) => {
      if (selectedId !== 'all' && b.propertyId !== selectedId) return false;
      if (view === 'stays' && statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (q) {
        const haystack = normalizeText(`${b.guestName ?? ''} ${b.guestEmail ?? ''} ${b.propertyName ?? ''}`);
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, selectedId, statusFilter, search, view]);

  // v4.80 — vue « États des lieux » : toutes les inspections aplaties
  // (séjour + document), triées par signature la plus récente.
  const inspectionRows = useMemo(() => {
    const rows: InspectionRow[] = [];
    for (const b of filtered) {
      for (const i of b.checkOutInspections) {
        rows.push({ booking: b, inspection: i });
      }
    }
    rows.sort(
      (a, b2) =>
        new Date(b2.inspection.signedAt).getTime() - new Date(a.inspection.signedAt).getTime(),
    );
    return rows.filter((r) => typeFilter === 'all' || r.inspection.type === typeFilter);
  }, [filtered, typeFilter]);

  // ----- KPIs (sur la liste filtrée) -----
  const stats = useMemo(() => {
    const inProgress = filtered.filter((b) => b.status === 'CHECKED_IN').length;
    const inspections = filtered.reduce((sum, b) => sum + b.checkOutInspections.length, 0);
    const revenue = filtered.reduce((sum, b) => {
      const minibar = b.minibarOrders.reduce((s, o) => s + o.totalEur, 0);
      const laundry = b.laundryOrders
        .filter((o) => o.status !== 'CANCELLED')
        .reduce((s, o) => s + o.amountEur, 0);
      return sum + minibar + laundry;
    }, 0);
    return { total: filtered.length, inProgress, inspections, revenue };
  }, [filtered]);

  // Ménages associés à un séjour : du bien, dont startedAt tombe dans
  // la fenêtre [checkIn − 1 j ; checkOut + 1 j] (pas de bookingId côté
  // CleaningReport — association par dates, cf. route API).
  const cleaningsFor = useCallback(
    (booking: GuestBooking): CleaningLite[] => {
      const pool = data?.cleaningByProperty[booking.propertyId] ?? [];
      const ci = safeDate(booking.checkIn);
      const co = safeDate(booking.checkOut);
      if (!ci || !co) return [];
      const from = ci.getTime() - DAY_MS;
      const to = co.getTime() + DAY_MS;
      return pool.filter((c) => {
        const started = safeDate(c.startedAt);
        if (!started) return false;
        return started.getTime() >= from && started.getTime() <= to;
      });
    },
    [data],
  );

  const hasProperties = properties.length > 0;
  const totalInspections = bookings
    .filter((b) => selectedId === 'all' || b.propertyId === selectedId)
    .reduce((sum, b) => sum + b.checkOutInspections.length, 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="lux-eyebrow">Relation invités</p>
          <h1 className="lux-display mt-1.5 text-2xl font-semibold text-white sm:text-3xl">Invités</h1>
          <p className="mt-1 text-sm text-[#8fa0c2]">
            Séjours, commandes, états des lieux signés et livre d&apos;or — tout au même endroit.
          </p>
        </div>
        {/* Filtre bien — partagé avec le sélecteur du header (useHostContext) */}
        {!propertiesLoading && hasProperties && (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger
              className="h-9 w-full rounded-full border-white/12 bg-white/[0.04] text-sm font-semibold text-white sm:w-56"
              aria-label="Filtrer par bien"
            >
              <SelectValue placeholder="Tous les biens" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b1226] text-white">
              <SelectItem value="all" className="focus:bg-white/8 focus:text-white">Tous les biens</SelectItem>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id} className="focus:bg-white/8 focus:text-white">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ---------- Erreur API ---------- */}
      {error && (
        <div
          className="lux-empty flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center"
          role="alert"
        >
          <span aria-hidden="true" className="lux-dot shrink-0" style={{ backgroundColor: '#f07d6a' }} />
          <p className="min-w-0 flex-1 text-sm font-medium text-[#ffab92]">{error}</p>
          <button
            type="button"
            className="lux-btn-ghost h-9 shrink-0 px-4 text-xs"
            onClick={() => void load()}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ---------- COACH ROOMSCAN — suggestions contextuelles (v5.4) ---------- */}
      <ContextualInsight context="/airbnb/guests" />

      {/* ---------- v4.80 — Bascule de vue « Séjours | États des lieux » ---------- */}
      <div
        className="flex w-full max-w-xl rounded-full border border-white/10 bg-white/[0.04] p-1"
        role="tablist"
        aria-label="Choisir la vue"
      >
        {(
          [
            { key: 'stays' as const, label: 'Séjours', count: bookings.filter((b) => selectedId === 'all' || b.propertyId === selectedId).length },
            { key: 'inspections' as const, label: 'États des lieux', count: totalInspections },
          ]
        ).map((tab) => {
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(tab.key)}
              className={cn(
                'inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-[#8fa0c2] hover:text-white',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'lux-num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                  active ? 'bg-[#5c8af0]/25 text-white' : 'bg-white/[0.06] text-[#8fa0c2]',
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Séjours totaux" value={loading ? '—' : stats.total} tone="rausch" />
        <KPICard label="En cours" value={loading ? '—' : stats.inProgress} tone="emerald" />
        <KPICard
          label="États des lieux signés"
          value={loading ? '—' : stats.inspections}
          tone="violet"
        />
        <KPICard
          label="Chiffre commandes"
          value={loading ? '—' : formatEur(stats.revenue)}
          tone="teal"
        />
      </div>

      {/* ---------- Recherche + filtres (selon la vue) ---------- */}
      {view === 'stays' ? (
        <div className="flex min-w-0 flex-col gap-3">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un invité…"
            className="h-10 max-w-md rounded-full border-white/12 bg-white/[0.04] pl-4 text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
            aria-label="Rechercher un invité par nom"
          />
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par statut de séjour">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50',
                    active
                      ? 'border-[#5c8af0]/40 bg-[#5c8af0]/15 text-white'
                      : 'border-white/12 bg-white/[0.03] text-[#8fa0c2] hover:bg-white/[0.06] hover:text-white',
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client, un bien…"
            className="h-10 max-w-md rounded-full border-white/12 bg-white/[0.04] pl-4 text-white placeholder:text-[#8fa0c2]/60 focus-visible:ring-[#5c8af0]/50"
            aria-label="Rechercher un état des lieux par client ou bien"
          />
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par type d'état des lieux">
            {(
              [
                { value: 'all' as const, label: 'Tous', dot: '#8fa0c2' },
                { value: 'checkin' as const, label: 'Arrivée', dot: '#34d399' },
                { value: 'checkout' as const, label: 'Départ', dot: '#fbbf24' },
              ]
            ).map((f) => {
              const active = typeFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setTypeFilter(f.value)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5c8af0]/50',
                    active
                      ? 'border-[#5c8af0]/40 bg-[#5c8af0]/15 text-white'
                      : 'border-white/12 bg-white/[0.03] text-[#8fa0c2] hover:bg-white/[0.06] hover:text-white',
                  )}
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: f.dot }} />
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- Aucun bien ---------- */}
      {!propertiesLoading && !hasProperties && !loading && (
        <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
          <span aria-hidden="true" className="lux-dot" style={{ backgroundColor: '#5c8af0' }} />
          <p className="lux-display text-lg font-semibold text-white">Aucun bien dans votre portfolio</p>
          <p className="max-w-md text-sm text-[#8fa0c2]">
            Ajoutez votre première propriété pour retrouver ici l&apos;historique de vos invités.
          </p>
        </div>
      )}

      {/* ---------- Chargement ---------- */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-busy="true" aria-label="Chargement des séjours">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="lux-card p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-xl bg-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2 bg-white/[0.06]" />
                  <Skeleton className="h-3 w-2/3 bg-white/[0.06]" />
                </div>
              </div>
              <Skeleton className="mt-4 h-3 w-1/3 bg-white/[0.06]" />
              <Skeleton className="mt-2 h-8 w-full rounded-xl bg-white/[0.06]" />
            </div>
          ))}
        </div>
      )}

      {/* ---------- VUE « SÉJOURS » ---------- */}
      {!loading && hasProperties && view === 'stays' && (
        <>
          {filtered.length === 0 ? (
            <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
              <span aria-hidden="true" className="lux-dot" style={{ backgroundColor: '#5c8af0' }} />
              <p className="lux-display text-lg font-semibold text-white">Aucun séjour ne correspond</p>
              <p className="max-w-md text-sm text-[#8fa0c2]">
                Modifiez la recherche, le statut ou le bien filtré pour voir plus de résultats.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filtered.map((b) => (
                <StayCard
                  key={b.id}
                  booking={b}
                  cleanings={cleaningsFor(b)}
                  expanded={expandedId === b.id}
                  onToggle={() => setExpandedId((prev) => (prev === b.id ? null : b.id))}
                  onCancelled={() => load()}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------- VUE « ÉTATS DES LIEUX » (v4.80) ---------- */}
      {!loading && hasProperties && view === 'inspections' && (
        <>
          {inspectionRows.length === 0 ? (
            <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
              <span aria-hidden="true" className="lux-dot" style={{ backgroundColor: '#cdb6ff' }} />
              <p className="lux-display text-lg font-semibold text-white">Aucun état des lieux signé</p>
              <p className="max-w-md text-sm text-[#8fa0c2]">
                Vos invités signent leurs états des lieux depuis le Hub QR : à l&apos;arrivée
                (pièces + photos) et au départ (minibar + pièces). Chaque document signé
                apparaît ici avec son PDF et son lien public.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {inspectionRows.map((row) => (
                <InspectionCard key={row.inspection.id} row={row} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

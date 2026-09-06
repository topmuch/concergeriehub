'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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

// =============================================================
// CalendarContent — page « Calendrier » du Dashboard Client
//
// • Grille mensuelle (lun → dim) des réservations du bien sélectionné
//   • 🟦 séjour en cours · 🟩 arrivée du jour · 🟧 départ du jour
//   • 🟪 ménage à faire (checkout passé, cleaningStatus ≠ DONE)
// • Navigation mois + retour « Aujourd'hui » + clic sur un séjour →
//   fiche (ménage fait/à faire, annuler, supprimer selon les droits)
// • Création manuelle (POST bookings) et import iCal RÉEL
//   (GET/POST/DELETE /api/airbnb/ical, re-sync par feedId)
// =============================================================

interface CalBooking {
  id: string;
  guestName: string;
  guestEmail: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  source: string;
  status: string;
  cleaningStatus: string;
  notes: string | null;
}

interface IcalFeed {
  id: string;
  label: string;
  url: string;
  lastSyncAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastImported: number;
}

const DAY_LABELS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MS_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** Nuit (dates) — les check-in/check-out iCal sont des dates pures. */
function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDayFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
function fmtDateTimeFr(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

const LEGEND = [
  { cls: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Séjour' },
  { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Arrivée (check-in)' },
  { cls: 'bg-orange-100 text-orange-800 border-orange-200', label: 'Départ (check-out)' },
  { cls: 'bg-purple-100 text-purple-800 border-purple-200', label: 'Ménage à faire' },
];

export function CalendarContent() {
  const { properties, propertiesLoading, selectedId, selectedProperty } = useHostContext();

  // Le calendrier porte sur UN bien : si "toutes" → première propriété.
  const property = useMemo(() => {
    if (selectedProperty) return selectedProperty;
    return properties[0] ?? null;
  }, [selectedProperty, properties]);

  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [bookings, setBookings] = useState<CalBooking[]>([]);
  const [myRole, setMyRole] = useState<string>('OWNER');
  const [canManage, setCanManage] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CalBooking | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [icalOpen, setIcalOpen] = useState(false);

  const requestId = useRef(0);

  const loadBookings = useCallback(async () => {
    if (!property) {
      setLoading(false);
      return;
    }
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/airbnb/properties/${property.id}/bookings?limit=200`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { bookings: CalBooking[]; myRole: string; canManage: boolean };
      if (current !== requestId.current) return;
      setBookings(data.bookings ?? []);
      setMyRole(data.myRole ?? 'OWNER');
      setCanManage(data.canManage ?? false);
    } catch (err) {
      if (current !== requestId.current) return;
      console.error('[calendar] load failed:', err);
      setError('Impossible de charger le planning. Réessayez dans un instant.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [property]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  // ----- Grille du mois : lun-de mais 6 semaines complètes -----
  const gridDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const start = new Date(first.getTime() - offset * MS_DAY);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * MS_DAY));
  }, [cursor]);

  /** Réservations actives chevauchant le mois affiché. */
  const monthBookings = useMemo(() => {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    return bookings.filter((b) => {
      if (b.status === 'CANCELLED') return false;
      return new Date(b.checkOut) > monthStart && new Date(b.checkIn) < monthEnd;
    });
  }, [bookings, cursor]);

  const monthLabel = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const today = startOfDay(new Date());
  const isCurrentMonth = cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();

  // ----- Événements d'un jour donné -----
  function eventsOfDay(day: Date) {
    const out: {
      booking: CalBooking;
      kind: 'checkin' | 'checkout' | 'stay' | 'cleaning';
    }[] = [];
    for (const b of monthBookings) {
      const ci = startOfDay(new Date(b.checkIn));
      const co = startOfDay(new Date(b.checkOut));
      if (sameDay(day, ci)) {
        out.push({ booking: b, kind: 'checkin' });
      } else if (sameDay(day, co)) {
        const cleaningDue = b.cleaningStatus !== 'DONE';
        out.push({ booking: b, kind: 'checkout' });
        if (cleaningDue && co <= today) {
          out.push({ booking: b, kind: 'cleaning' });
        }
      } else if (day > ci && day < co) {
        out.push({ booking: b, kind: 'stay' });
      }
    }
    return out.slice(0, 3); // max 3 pastilles/jour (volumétrie grille)
  }

  // ----- Actions sur une réservation -----
  async function patchBooking(id: string, data: Record<string, string>) {
    if (!property) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${property.id}/bookings?bookingId=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Modification refusée');
      toast.success('Réservation mise à jour');
      setSelected(null);
      await loadBookings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteBooking(id: string) {
    if (!property) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${property.id}/bookings?bookingId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Suppression refusée');
      toast.success('Réservation supprimée');
      setSelected(null);
      await loadBookings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setActionBusy(false);
    }
  }

  // ----- États vides -----
  if (!propertiesLoading && properties.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="text-4xl" aria-hidden="true">📅</span>
          <h1 className="mt-3 text-lg font-bold text-slate-900">Aucun bien à afficher</h1>
          <p className="mt-2 text-sm text-slate-600">
            Créez votre première propriété pour organiser votre planning.
          </p>
          <Link
            href="/airbnb/properties?new=1"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-[#E23F2B] px-4 text-sm font-bold text-white hover:bg-[#c93725]"
          >
            + Ajouter une propriété
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">📅 Calendrier</h1>
          <p className="mt-1 text-sm text-slate-600">
            {property ? (
              <>Planning de <span className="font-semibold text-slate-900">{property.name}</span> — {monthBookings.length} séjour(s) ce mois</>
            ) : (
              'Chargement du planning…'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="h-9 gap-2 border-slate-200 text-slate-700"
            onClick={() => setIcalOpen(true)}
            aria-label="Synchroniser un calendrier iCal"
          >
            <RefreshCw className="h-4 w-4" />
            Synchroniser iCal
          </Button>
          <Button
            className="h-9 gap-2 bg-[#E23F2B] font-bold text-white hover:bg-[#c93725]"
            onClick={() => setNewOpen(true)}
            disabled={!canManage}
            aria-label="Nouvelle réservation"
            title={canManage ? undefined : "Réservé aux propriétaires et managers"}
          >
            <CalendarPlus className="h-4 w-4" />
            Nouvelle réservation
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {error}
        </div>
      )}

      {/* ---------- Navigation mois + légende ---------- */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Mois précédent"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[150px] text-center text-base font-bold capitalize text-slate-900" aria-live="polite">
              {monthLabel}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isCurrentMonth && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-1 h-8 text-xs font-semibold text-[#E23F2B] hover:bg-[#FEF1EF]"
                onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              >
                Aujourd&apos;hui
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Légende du calendrier">
            {LEGEND.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <span aria-hidden="true" className={cn('inline-block h-2.5 w-2.5 rounded-full border', l.cls)} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* ---------- Grille ---------- */}
        {loading || propertiesLoading ? (
          <Skeleton className="h-[560px] w-full rounded-lg" aria-hidden="true" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-7 border-b border-slate-200 pb-1" role="row">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="px-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {gridDays.map((day, i) => {
                  const inMonth = day.getMonth() === cursor.getMonth();
                  const isToday = sameDay(day, today);
                  const evts = eventsOfDay(day);
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        'min-h-[88px] border-b border-r border-slate-100 p-1.5 sm:min-h-[96px]',
                        (i + 1) % 7 === 0 && 'border-r-0',
                        !inMonth && 'bg-slate-50/60',
                      )}
                      aria-label={`${day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${evts.length} événement(s)`}
                    >
                      <div className="mb-1 flex items-center justify-between px-0.5">
                        <span
                          className={cn(
                            'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold',
                            isToday
                              ? 'bg-[#E23F2B] text-white'
                              : inMonth
                                ? 'text-slate-700'
                                : 'text-slate-300',
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {evts.length > 2 && (
                          <span className="text-[10px] font-bold text-slate-400">+{evts.length - 2}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {evts.slice(0, 2).map((e) => (
                          <motion.button
                            key={`${e.booking.id}-${e.kind}`}
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            onClick={() => setSelected(e.booking)}
                            className={cn(
                              'w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight sm:text-[11px]',
                              e.kind === 'checkin' && 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
                              e.kind === 'checkout' && 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100',
                              e.kind === 'stay' && 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100',
                              e.kind === 'cleaning' && 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100',
                            )}
                            title={`${e.booking.guestName} — ${kindLabel(e.kind)} (${fmtDayFr(new Date(e.booking.checkIn))} → ${fmtDayFr(new Date(e.booking.checkOut))})`}
                          >
                            {kindEmoji(e.kind)} {e.booking.guestName}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- Fiche réservation ---------- */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={`Réservation de ${selected.guestName}`}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selected.guestName}</h2>
                <p className="text-sm text-slate-500">
                  {fmtDayFr(new Date(selected.checkIn))} → {fmtDayFr(new Date(selected.checkOut))} · {selected.guests} pers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Source</dt>
                <dd className="mt-0.5 font-bold text-slate-800">{sourceLabel(selected.source)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Statut</dt>
                <dd className="mt-0.5 font-bold text-slate-800">{statusLabel(selected.status)}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ménage</dt>
                <dd className="mt-0.5 font-bold text-slate-800">{cleaningLabel(selected.cleaningStatus)}</dd>
              </div>
              {selected.guestEmail && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-700">{selected.guestEmail}</dd>
                </div>
              )}
            </dl>
            {selected.notes && (
              <p className="mt-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
                <Info className="mr-1.5 inline h-4 w-4 text-slate-400" aria-hidden="true" />
                {selected.notes}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.cleaningStatus !== 'DONE' ? (
                <Button
                  size="sm"
                  className="h-9 gap-1.5 bg-purple-600 font-bold text-white hover:bg-purple-700"
                  disabled={actionBusy}
                  onClick={() => void patchBooking(selected.id, { cleaningStatus: 'DONE' })}
                >
                  🧹 Marquer le ménage fait
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 border-slate-200"
                  disabled={actionBusy}
                  onClick={() => void patchBooking(selected.id, { cleaningStatus: 'PENDING' })}
                >
                  ↩️ Ménage à refaire
                </Button>
              )}
              {canManage && selected.status !== 'CANCELLED' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-slate-200 text-rose-600 hover:bg-rose-50"
                  disabled={actionBusy}
                  onClick={() => void patchBooking(selected.id, { status: 'CANCELLED' })}
                >
                  Annuler le séjour
                </Button>
              )}
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 gap-1.5 text-slate-500 hover:text-rose-600"
                  disabled={actionBusy}
                  onClick={() => void deleteBooking(selected.id)}
                >
                  <Trash2 className="h-4 w-4" /> Supprimer
                </Button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      <NewBookingDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        propertyId={property?.id ?? ''}
        onCreated={() => {
          void loadBookings();
        }}
      />

      <IcalDialog
        open={icalOpen}
        onOpenChange={setIcalOpen}
        propertyId={property?.id ?? ''}
        propertyName={property?.name ?? ''}
        canManage={canManage}
      />
    </div>
  );
}

function kindLabel(kind: 'checkin' | 'checkout' | 'stay' | 'cleaning'): string {
  switch (kind) {
    case 'checkin': return 'Arrivée';
    case 'checkout': return 'Départ';
    case 'cleaning': return 'Ménage à faire';
    default: return 'Séjour';
  }
}
function kindEmoji(kind: 'checkin' | 'checkout' | 'stay' | 'cleaning'): string {
  switch (kind) {
    case 'checkin': return '🔑';
    case 'checkout': return '🧳';
    case 'cleaning': return '🧹';
    default: return '🛏️';
  }
}
function sourceLabel(s: string): string {
  switch (s) {
    case 'AIRBNB': return 'Airbnb';
    case 'BOOKING': return 'Booking.com';
    case 'ICAL': return 'Import iCal';
    case 'MANUAL': return 'Manuelle';
    default: return s;
  }
}
function statusLabel(s: string): string {
  switch (s) {
    case 'CONFIRMED': return 'Confirmé';
    case 'CHECKED_IN': return 'Arrivé';
    case 'CHECKED_OUT': return 'Parti';
    case 'CANCELLED': return 'Annulé';
    default: return s;
  }
}
function cleaningLabel(s: string): string {
  switch (s) {
    case 'PENDING': return '🟣 À faire';
    case 'IN_PROGRESS': return '🔵 En cours';
    case 'DONE': return '🟢 Terminé';
    default: return s;
  }
}

// =============================================================
// Modale « Nouvelle réservation » (création manuelle)
// =============================================================

function NewBookingDialog({
  open,
  onOpenChange,
  propertyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  onCreated: () => void | Promise<void>;
}) {
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('2');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!guestName.trim() || !checkIn || !checkOut) {
      toast.error('Invité, arrivée et départ sont requis.');
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      toast.error('La date de départ doit être après la date d’arrivée.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/airbnb/properties/${propertyId}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || undefined,
          checkIn,
          checkOut,
          guests: Math.max(1, Math.min(30, Number(guests) || 1)),
          notes: notes.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Création refusée');
      toast.success('Réservation ajoutée au planning');
      onOpenChange(false);
      setGuestName(''); setGuestEmail(''); setCheckIn(''); setCheckOut(''); setGuests('2'); setNotes('');
      await onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-bold text-slate-900">📅 Nouvelle réservation</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600">
            Ajoutez un séjour manuellement (hors plateformes). Les séjours iCal ne doivent PAS être
            recréés ici — ils se synchronisent automatiquement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-guest">Nom de l&apos;invité *</Label>
            <Input id="bk-guest" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Camille Laurent" maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-email">Email invité (optionnel)</Label>
            <Input id="bk-email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="camille@exemple.fr" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-in">Arrivée *</Label>
              <Input id="bk-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-out">Départ *</Label>
              <Input id="bk-out" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-nb">Voyageurs</Label>
              <Input id="bk-nb" type="number" min={1} max={30} value={guests} onChange={(e) => setGuests(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-notes">Notes (optionnel)</Label>
              <Input id="bk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Arrivée tardive…" maxLength={200} />
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-10">Annuler</AlertDialogCancel>
          <AlertDialogAction
            className="h-10 bg-[#E23F2B] font-bold text-white hover:bg-[#c93725]"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {busy ? 'Ajout…' : 'Ajouter au planning'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// =============================================================
// Modale « Synchroniser iCal » — liste des feeds + ajout RÉEL
// =============================================================

function IcalDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  canManage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  propertyName: string;
  canManage: boolean;
}) {
  const [feeds, setFeeds] = useState<IcalFeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IcalFeed | null>(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/ical?propertyId=${encodeURIComponent(propertyId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('load');
      const data = (await res.json()) as { feeds: IcalFeed[] };
      setFeeds(data.feeds ?? []);
    } catch {
      toast.error('Impossible de charger les calendriers connectés.');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function addFeed() {
    if (!label.trim() || !url.trim()) {
      toast.error('Libellé et URL sont requis.');
      return;
    }
    setBusy('add');
    try {
      const res = await fetch('/api/airbnb/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, label: label.trim(), url: url.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; feed?: IcalFeed };
      if (!res.ok) throw new Error(json.error ?? 'Connexion refusée');
      if (json.feed?.lastStatus === 'OK') {
        toast.success(`Calendrier connecté — ${json.feed.lastImported} séjour(s) importé(s)`);
      } else if (json.feed?.lastStatus === 'ERROR') {
        toast.error(`Calendrier enregistré, mais la synchro a échoué : ${json.feed.lastError ?? 'erreur inconnue'}`);
      }
      setLabel(''); setUrl('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setBusy(null);
    }
  }

  async function resync(feed: IcalFeed) {
    setBusy(feed.id);
    try {
      const res = await fetch('/api/airbnb/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedId: feed.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; feed?: { lastStatus?: string; lastImported?: number; lastError?: string | null } };
      if (!res.ok) throw new Error(json.error ?? 'Synchro refusée');
      if (json.feed?.lastStatus === 'OK') {
        toast.success(`${feed.label} — ${json.feed.lastImported} séjour(s) synchronisé(s)`);
      } else {
        toast.error(`${feed.label} — échec : ${json.feed?.lastError ?? 'erreur inconnue'}`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setBusy(null);
    }
  }

  async function removeFeed(feed: IcalFeed) {
    setBusy(feed.id);
    try {
      const res = await fetch(`/api/airbnb/ical?feedId=${encodeURIComponent(feed.id)}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Suppression refusée');
      toast.success(`${feed.label} déconnecté`);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-slate-900">🔄 Synchroniser iCal</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              Connectez les calendriers externes de {propertyName || 'votre bien'} (Airbnb, Booking.com,
              Abritel…). Collez l&apos;URL d&apos;export iCal fournie par la plateforme — les séjours
              s&apos;importent puis se mettent à jour à chaque synchronisation.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* ----- Feeds existants ----- */}
          <div className="flex flex-col gap-2">
            {loading ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : feeds.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                Aucun calendrier connecté pour ce bien.
              </p>
            ) : (
              feeds.map((f) => (
                <div key={f.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                  <span aria-hidden="true" className="text-lg">{f.lastStatus === 'ERROR' ? '⚠️' : '📆'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{f.label}</p>
                    <p className="truncate text-xs text-slate-400" title={f.url}>{f.url}</p>
                    <p className="mt-0.5 text-xs">
                      {f.lastSyncAt ? (
                        <>
                          <span className={cn('font-bold', f.lastStatus === 'OK' ? 'text-emerald-700' : 'text-rose-700')}>
                            {f.lastStatus === 'OK' ? '✓ Synchronisé' : '✗ Erreur'}
                          </span>{' '}
                          <span className="text-slate-400">{fmtDateTimeFr(f.lastSyncAt)} · {f.lastImported} séjour(s)</span>
                          {f.lastError && <span className="block text-rose-600">{f.lastError}</span>}
                        </>
                      ) : (
                        <span className="text-slate-400">Jamais synchronisé</span>
                      )}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy !== null} onClick={() => void resync(f)}>
                        {busy === f.id ? '…' : 'Re-sync'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400 hover:text-rose-600" disabled={busy !== null} onClick={() => setConfirmDelete(f)}>
                        Retirer
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* ----- Ajout ----- */}
          {canManage && (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Connecter un calendrier</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ic-label">Libellé (ex : « Airbnb — Loft »)</Label>
                <Input id="ic-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Airbnb — Loft" disabled={busy !== null} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ic-url">URL d&apos;export iCal</Label>
                <Input id="ic-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://fr.airbnb.com/calendar/ical/…" disabled={busy !== null} />
                <p className="text-[11px] text-slate-400">
                  Airbnb : Annonces → Calendrier → Disponibilité → Exporter le calendrier. Les URL
                  webcal:// sont converties automatiquement.
                </p>
              </div>
              <Button
                className="h-9 w-fit bg-[#E23F2B] font-bold text-white hover:bg-[#c93725]"
                disabled={busy !== null}
                onClick={() => void addFeed()}
              >
                {busy === 'add' ? 'Connexion…' : 'Connecter le calendrier'}
              </Button>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Fermer</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ----- Confirmation de suppression d'un feed ----- */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Déconnecter ce calendrier ?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.label} ne se synchronisera plus. Les séjours déjà importés restent dans
              le planning (traçabilité).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 bg-rose-600 font-bold text-white hover:bg-rose-700"
              onClick={() => confirmDelete && void removeFeed(confirmDelete)}
            >
              Déconnecter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

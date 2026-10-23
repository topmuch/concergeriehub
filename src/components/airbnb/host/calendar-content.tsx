'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useHostContext } from '@/components/airbnb/host/host-context';
import { ContextualInsight } from '@/components/airbnb/host/contextual-insight';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
// v5.8 « CENTRAL CALENDAR » — refonte timeline (type Gantt
// horizontal, inspirée Hostfully) :
//   • Vue « Timeline » (par défaut) : 1 ligne par bien (colonne
//     sticky à gauche : pastille ronde + nom), 1 colonne par jour
//     du mois (en-tête double ligne lettre + numéro), barres de
//     séjour arrondies positionnées au jour+heure près, couleur
//     selon la source (MANUAL or · AIRBNB corail · BOOKING teal ·
//     ICAL ambre), badge typographique (« A. », « B. », « + »,
//     « i. ») dans la barre, nom de l'invité tronqué.
//   • Ligne verticale rouge sur la colonne du jour courant
//     (position proportionnelle à l'heure) + numéro surligné.
//   • Weekends hachurés très subtils (repeating-linear-gradient).
//   • Point ● rouge aux extrémités des barres en cas de turnover
//     serré (check-out le matin, arrivée le soir du même jour).
//   • Pastille « Ménage à faire » (ambre) sous la barre le jour du
//     check-out si cleaningStatus ≠ DONE — cliquable → PATCH
//     cleaningStatus DONE (même action que la fiche).
//   • Clic sur une barre → fiche séjour ; clic sur une case vide →
//     création d'un séjour pré-remplie sur le jour cliqué.
//   • Vue « Mois » (ancienne grille 7 × 6) conservée via bascule
//     segmentée — rien ne disparaît.
//
// Fonctionnalités préservées : chargement
// /api/airbnb/properties/[id]/bookings (désormais multi-biens en
// mode « toutes »), fiche séjour complète (ménage fait/à refaire,
// annulation en 2 clics, suppression, code d'accès hub, envoi des
// infos de connexion, prolongation de verrouillage), création
// manuelle (POST bookings + code généré), import iCal RÉEL
// (GET/POST/DELETE /api/airbnb/ical, re-sync par feedId).
//
// ZÉRO ICÔNE / ZÉRO EMOJI : glyphes typographiques purs
// (‹ › · ● ✓ × + A. B. i.) et pastilles CSS colorées.
// =============================================================

interface CalBooking {
  id: string;
  /** Taggé côté client (bien d'origine) — le contrat API ne le renvoie pas. */
  propertyId: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  source: string;
  status: string;
  cleaningStatus: string;
  notes: string | null;
  // v4.50 « VERROUILLAGE DU HUB PAR CODE » — code d'activation généré
  // automatiquement + prolongation de séjour validée par l'hôte.
  accessCode?: string | null;
  lateCheckOutUntil?: string | null;
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

/** Barre de séjour positionnée dans la timeline (unités = jours). */
interface TlBar {
  bookingId: string;
  /** Début en jours depuis le 1er du mois (fractionnaire selon l'heure). */
  left: number;
  /** Largeur en jours (fractionnaire, min ~0.3 pour rester cliquable). */
  width: number;
  /** Rail vertical (0 = en haut) pour les séjours chevauchants. */
  lane: number;
  color: string;
  badge: string;
  guestName: string;
  tooltip: string;
  /** Séjour commencé avant le mois affiché (bord gauche écrasé). */
  startClamped: boolean;
  /** Séjour finissant après le mois affiché (bord droit écrasé). */
  endClamped: boolean;
  /** Turnover serré : le séjour précédent part le jour de l'arrivée. */
  turnoverIn: boolean;
  /** Turnover serré : le séjour suivant arrive le jour du départ. */
  turnoverOut: boolean;
}

/** Pastille « ménage » positionnée sous la barre le jour du check-out.
 *  done = false → pastille ambre cliquable (« Ménage fait ») ;
 *  done = true  → fine coche ✓ verte (ménage terminé). */
interface TlChip {
  bookingId: string;
  propertyId: string;
  /** Position en jours depuis le 1er du mois (colonne du check-out). */
  left: number;
  inProgress: boolean;
  done: boolean;
  label: string;
}

/** Une ligne de la timeline = un bien. */
interface TlRow {
  propertyId: string;
  name: string;
  initial: string;
  avatarColor: string;
  staysCount: number;
  nights: number;
  lanes: number;
  hasCleaning: boolean;
  canManage: boolean;
  heightStyle: string;
  bars: TlBar[];
  chips: TlChip[];
}

const DAY_LABELS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
/** Lettres de l'en-tête timeline (lun → dim). */
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MS_DAY = 86_400_000;

/** Couleurs des barres par source + badge typographique (zéro icône). */
const SOURCE_META: Record<string, { color: string; badge: string; label: string }> = {
  MANUAL: { color: '#e9c47c', badge: '+', label: 'Manuel' },
  AIRBNB: { color: '#f07d6a', badge: 'A.', label: 'Airbnb' },
  BOOKING: { color: '#2dd4bf', badge: 'B.', label: 'Booking.com' },
  ICAL: { color: '#fbbf24', badge: 'i.', label: 'Import iCal' },
};
const SOURCE_FALLBACK = { color: '#fbbf24', badge: 'i.', label: 'Externe' };

/** Pastilles rondes des biens (colonne sticky) — palette Saphir Luxe. */
const AVATAR_COLORS = ['#e9c47c', '#2dd4bf', '#f07d6a', '#fbbf24', '#34d399', '#5cadf0', '#cdb6ff'];

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
/** Minuit exact (convention iCal : date pure → T00:00:00Z). */
function isMidnightUtc(d: Date): boolean {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
}
function sourceMeta(s: string) {
  return SOURCE_META[s] ?? SOURCE_FALLBACK;
}

// ── v4.83 « INFOS DE CONNEXION AU HUB » ─────────────────────────
// Après la création d'une résa (code d'accès généré), l'hôte choisit :
//   • OUI → envoyer DIRECTEMENT à l'invité (email enrichi via
//     /api/airbnb/bookings/send-hub-access : arrivée, départ, lien hub,
//     code d'accès, contact hôte) ;
//   • NON → COPIER le message complet (WhatsApp/SMS) dans le
//     presse-papier.
// Les heures sont rendues en UTC (= ce que l'hôte a SAISI, le serveur
// interprétant datetime-local en UTC) pour ne pas décaler le créneau.
function fmtUtcSlotLabel(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/** Message « infos de connexion » complet (copie WhatsApp/SMS). */
function hubConnectionText(opts: {
  propertyName: string;
  hubSlug: string | null;
  guestName: string;
  accessCode: string;
  checkInIso: string;
  checkOutIso: string;
}): string {
  const firstName = opts.guestName.trim().split(/\s+/)[0] || opts.guestName.trim();
  const hubUrl = opts.hubSlug
    ? `${window.location.origin}/hub/${opts.hubSlug}`
    : `${window.location.origin}/hub (lien du hub indisponible — vérifiez la plaque QR du bien)`;
  return [
    `🏡 ${opts.propertyName} — vos infos de connexion`,
    '',
    `Bonjour ${firstName} !`,
    '',
    `📲 Votre Hub de voyage : ${hubUrl}`,
    `🔐 Code d'accès : ${opts.accessCode}`,
    '',
    `📅 Arrivée : ${fmtUtcSlotLabel(opts.checkInIso)}`,
    `🧳 Départ : ${fmtUtcSlotLabel(opts.checkOutIso)}`,
    '',
    'Scannez le QR code de la plaque du logement (ou ouvrez le lien), puis saisissez le code. Le hub reste déverrouillé sur votre téléphone tout le séjour et se verrouille automatiquement au départ.',
    '',
    'À très vite !',
  ].join('\n');
}

/** Teintes sémantiques (nuit saphir) des pastilles d'événements — texte blanc. */
const EVT_STYLES: Record<'checkin' | 'checkout' | 'stay' | 'cleaning', string> = {
  stay: 'border-[#5cadf0]/30 bg-[#5cadf0]/15 hover:bg-[#5cadf0]/25',
  checkin: 'border-[#34d399]/30 bg-[#34d399]/12 hover:bg-[#34d399]/22',
  checkout: 'border-[#fbbf24]/30 bg-[#fbbf24]/12 hover:bg-[#fbbf24]/22',
  cleaning: 'border-[#cdb6ff]/30 bg-[#cdb6ff]/12 hover:bg-[#cdb6ff]/22',
};

/** Point coloré de chaque type d'événement (remplace les emojis). */
const EVT_DOT: Record<'checkin' | 'checkout' | 'stay' | 'cleaning', string> = {
  stay: '#5cadf0',
  checkin: '#34d399',
  checkout: '#fbbf24',
  cleaning: '#cdb6ff',
};

/** Légende typographique (points colorés cohérents avec les pastilles). */
const LEGEND = [
  { color: '#5cadf0', label: 'Séjour' },
  { color: '#34d399', label: 'Arrivée (check-in)' },
  { color: '#fbbf24', label: 'Départ (check-out)' },
  { color: '#cdb6ff', label: 'Ménage à faire' },
];

/** Légende de la vue timeline : couleur = source de la réservation. */
const TL_LEGEND = [
  { color: SOURCE_META.MANUAL.color, label: 'Manuel' },
  { color: SOURCE_META.AIRBNB.color, label: 'Airbnb' },
  { color: SOURCE_META.BOOKING.color, label: 'Booking' },
  { color: SOURCE_META.ICAL.color, label: 'iCal' },
];

/** v5.2 — classes communes des champs de formulaire (portails sombres). */
const LUX_FIELD =
  'rounded-xl border-white/12 bg-white/[0.04] text-white placeholder:text-[#8fabc2]/60 focus-visible:ring-[#5cadf0]/50';

export function CalendarContent() {
  const { properties, propertiesLoading, selectedId, selectedProperty } = useHostContext();

  // Mode « toutes les propriétés » : la timeline affiche UNE LIGNE par
  // bien (comme la référence « Central Calendar »). La vue Mois, elle,
  // reste portée par un seul bien (comportement historique).
  const isAllMode = selectedId === 'all';
  // Le calendrier unitaire porte sur UN bien : si "toutes" → première propriété.
  const property = useMemo(() => {
    if (selectedProperty) return selectedProperty;
    return properties[0] ?? null;
  }, [selectedProperty, properties]);

  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  // Jour courant STABLE (granularité jour) — évite de recomputer la
  // timeline à chaque render (l'heure seule ne change pas la grille).
  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState<'timeline' | 'month'>('timeline');
  const [bookings, setBookings] = useState<CalBooking[]>([]);
  const [myRole, setMyRole] = useState<string>('OWNER');
  const [canManage, setCanManage] = useState(true);
  /** Droits de création par bien (mode multi-biens : chaque ligne décide). */
  const [manageByProperty, setManageByProperty] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CalBooking | null>(null);
  // v4.50 — valeur du champ « prolonger le verrouillage » (datetime-local).
  // Pré-remplie à l'ouverture de la fiche : checkOut à 15 h (départ tardif
  // type) — l'hôte ajuste puis valide.
  const [extensionValue, setExtensionValue] = useState('');
  // Pré-remplissage du champ prolongation à l'ouverture d'une fiche
  // (départ tardif type : checkOut à 15 h ; prolongation existante si déjà définie).
  useEffect(() => {
    if (!selected) return;
    const toLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    if (selected.lateCheckOutUntil) {
      setExtensionValue(toLocal(new Date(selected.lateCheckOutUntil)));
    } else {
      const co = new Date(selected.checkOut);
      co.setHours(15, 0, 0, 0);
      setExtensionValue(toLocal(co));
    }
  }, [selected]);
  const [actionBusy, setActionBusy] = useState(false);
  // v5.7 — « Annuler le séjour » de la fiche calendrier : double clic de
  // sécurité (armement → confirmation), aligné sur la carte Séjours de
  // l'onglet Invités. Avant : annulation INSTANTANÉE sans confirmation.
  const [cancelArmed, setCancelArmed] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  // v5.8 — pré-remplissage « clic sur une case vide » de la timeline.
  const [newPrefill, setNewPrefill] = useState<{ checkIn: string; checkOut: string } | null>(null);
  const [icalOpen, setIcalOpen] = useState(false);

  // ── v4.83 — envoi des infos de connexion depuis la fiche séjour ──
  // sentAccessTo : souvenir « déjà envoyé à <email> » par séjour (le
  // ✓ persiste tant que le dashboard est ouvert ; renvoyer est permis).
  const [sendAccessBusy, setSendAccessBusy] = useState(false);
  const [sentAccessTo, setSentAccessTo] = useState<Record<string, string>>({});
  const sendHubAccess = useCallback(async (bookingId: string) => {
    setSendAccessBusy(true);
    try {
      const res = await fetch('/api/airbnb/bookings/send-hub-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        sentTo?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'Envoi refusé');
      if (json.sentTo) setSentAccessTo((m) => ({ ...m, [bookingId]: json.sentTo! }));
      toast.success(`Infos de connexion envoyées à ${json.sentTo ?? "l'invité"}`, {
        description: 'Lien du hub + code d’accès + arrivée/départ + votre contact.',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setSendAccessBusy(false);
    }
  }, []);

  // v5.7 — désarmement du bouton d'annulation à chaque changement de fiche.
  useEffect(() => {
    setCancelArmed(false);
  }, [selected?.id]);

  const requestId = useRef(0);

  // ── Chargement des séjours ─────────────────────────────────────
  // Mode mono-bien : 1 requête (comportement historique).
  // Mode « toutes » : 1 requête par bien en parallèle (l'API planning
  // est portée par le bien) — chaque séjour est taggé propertyId pour
  // router PATCH/DELETE vers le bon endpoint.
  const loadBookings = useCallback(async () => {
    const targets = isAllMode ? properties : property ? [property] : [];
    if (targets.length === 0) {
      setBookings([]);
      setLoading(false);
      return;
    }
    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        targets.map(async (p) => {
          const res = await fetch(`/api/airbnb/properties/${p.id}/bookings?limit=200`, {
            cache: 'no-store',
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { bookings: Omit<CalBooking, 'propertyId'>[]; myRole: string; canManage: boolean };
          return {
            propertyId: p.id,
            bookings: (data.bookings ?? []).map((b) => ({ ...b, propertyId: p.id })),
            myRole: data.myRole ?? 'OWNER',
            canManage: data.canManage ?? false,
          };
        }),
      );
      if (current !== requestId.current) return;
      setBookings(results.flatMap((r) => r.bookings));
      setMyRole(results[0]?.myRole ?? 'OWNER');
      setManageByProperty(Object.fromEntries(results.map((r) => [r.propertyId, r.canManage])));
      setCanManage(results.some((r) => r.canManage));
    } catch (err) {
      if (current !== requestId.current) return;
      console.error('[calendar] load failed:', err);
      setError('Impossible de charger le planning. Réessayez dans un instant.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [isAllMode, properties, property]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  // ----- Bornes du mois affiché (communes aux deux vues) -----
  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1), [cursor]);
  const isCurrentMonth = cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();
  const monthLabel = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  /** Réservations actives chevauchant le mois affiché (tous biens). */
  const monthBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === 'CANCELLED') return false;
      return new Date(b.checkOut) > monthStart && new Date(b.checkIn) < monthEnd;
    });
  }, [bookings, monthStart, monthEnd]);

  // ----- Grille du mois HISTORIQUE : lun-de mais 6 semaines complètes -----
  const gridDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const start = new Date(first.getTime() - offset * MS_DAY);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * MS_DAY));
  }, [cursor]);

  /** Séjours du bien porté par la VUE MOIS (comportement historique). */
  const gridBookings = useMemo(
    () => monthBookings.filter((b) => b.propertyId === property?.id),
    [monthBookings, property],
  );

  // ----- Événements d'un jour donné (vue Mois) -----
  function eventsOfDay(day: Date) {
    const out: {
      booking: CalBooking;
      kind: 'checkin' | 'checkout' | 'stay' | 'cleaning';
    }[] = [];
    for (const b of gridBookings) {
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

  // =============================================================
  // TIMELINE — grille (1 colonne / jour du mois) + lignes / bien
  // =============================================================
  const tlDays = useMemo(() => {
    const n = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1));
  }, [cursor]);

  /** Position du « maintenant » dans la colonne du jour (fraction 0→1). */
  const now = new Date();
  const todayIndex = tlDays.findIndex((d) => sameDay(d, today));
  const showTodayLine = todayIndex >= 0;
  const todayFrac = todayIndex + (now.getHours() * 60 + now.getMinutes()) / (24 * 60);

  /** Lignes de la timeline (barres positionnées, rails, pastilles ménage). */
  const tlRows = useMemo<TlRow[]>(() => {
    const gs = monthStart.getTime();
    const ge = monthEnd.getTime();
    return properties.map((p, pIdx) => {
      const list = monthBookings
        .filter((b) => b.propertyId === p.id)
        .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

      const bars: TlBar[] = [];
      const chips: TlChip[] = [];
      const laneEnds: number[] = []; // fin visuelle (en jours) du dernier bar par rail
      let nights = 0;
      const totalDays = tlDays.length;

      /** Index de colonne (0-based, tolérant à l'heure d'été : arrondi). */
      const dayIndex = (d: Date) => Math.round((startOfDay(d).getTime() - gs) / MS_DAY);
      /** Fraction de journée locale (0→1) pour le positionnement à l'heure. */
      const dayFrac = (d: Date) => (d.getTime() - startOfDay(d).getTime()) / MS_DAY;

      list.forEach((b, i) => {
        const ci = new Date(b.checkIn);
        const co = new Date(b.checkOut);
        const ciT = Math.min(Math.max(ci.getTime(), gs), ge);
        const coT = Math.min(Math.max(co.getTime(), gs), ge);

        // Nuits occupées dans le mois (pour le sous-titre de la ligne).
        nights += (coT - Math.max(ciT, gs)) / MS_DAY;

        // Position horizontale : index de colonne + fraction de journée
        // (arrivée 00:00 = début de colonne · 23:59 = fin · heures inter-
        // médiaires proportionnelles). Borné à la grille du mois.
        let left = Math.min(Math.max(dayIndex(ci) + dayFrac(ci), 0), totalDays);
        let right = Math.min(Math.max(dayIndex(co) + dayFrac(co), 0), totalDays);

        // Check-out à minuit exact (convention iCal date pure) → la barre
        // s'arrête au MILIEU de la colonne départ (présence lisible du
        // jour de départ) — SAUF si le séjour suivant arrive ce même jour
        // : les deux barres s'enchaînent alors sans se chevaucher.
        if (isMidnightUtc(co) && co.getTime() < ge) {
          const next = list[i + 1];
          const chainsNext =
            !!next &&
            new Date(next.checkIn).getTime() >= co.getTime() &&
            sameDay(new Date(next.checkIn), co);
          if (!chainsNext) right = Math.min(right + 0.5, totalDays);
        }

        // Rail vertical : premier rail dont la barre précédente finit
        // avant le début visuel de celle-ci (chevauchements empilés).
        let lane = 0;
        while (lane < laneEnds.length && laneEnds[lane] > left + 1e-6) lane += 1;
        laneEnds[lane] = right;

        // Turnover serré : points ● aux extrémités de la barre.
        const prev = list[i - 1];
        const turnoverIn = !!(
          prev &&
          new Date(prev.checkOut).getTime() <= ci.getTime() &&
          sameDay(new Date(prev.checkOut), ci)
        );
        const nextB = list[i + 1];
        const turnoverOut = !!(
          nextB &&
          new Date(nextB.checkIn).getTime() >= co.getTime() &&
          sameDay(new Date(nextB.checkIn), co)
        );

        const meta = sourceMeta(b.source);
        bars.push({
          bookingId: b.id,
          left,
          width: Math.max(right - left, 0.3),
          lane,
          color: meta.color,
          badge: meta.badge,
          guestName: b.guestName,
          tooltip: `${b.guestName} · ${meta.label} — arrivée ${fmtDateTimeFr(b.checkIn)}, départ ${fmtDateTimeFr(b.checkOut)}${b.accessCode ? ` · code hub ${b.accessCode}` : ''}`,
          startClamped: ci.getTime() < gs,
          endClamped: co.getTime() > ge,
          turnoverIn,
          turnoverOut,
        });

        // Pastille ménage sous la barre, le jour du check-out —
        // même règle que la grille historique (jour passé ou aujourd'hui).
        //   • cleaningStatus ≠ DONE → pastille ambre cliquable (« Ménage
        //     fait » → PATCH cleaningStatus) ;
        //   • DONE → fine coche ✓ verte (trace du ménage terminé).
        const coDay = startOfDay(co);
        if (coDay <= today && coDay >= monthStart && coDay < monthEnd) {
          if (b.cleaningStatus !== 'DONE') {
            chips.push({
              bookingId: b.id,
              propertyId: b.propertyId,
              left: dayIndex(co) + 0.03,
              inProgress: b.cleaningStatus === 'IN_PROGRESS',
              done: false,
              label: b.cleaningStatus === 'IN_PROGRESS' ? 'Ménage en cours' : 'Ménage à faire',
            });
          } else {
            chips.push({
              bookingId: b.id,
              propertyId: b.propertyId,
              left: dayIndex(co) + 0.03,
              inProgress: false,
              done: true,
              label: 'Ménage fait',
            });
          }
        }
      });

      const lanes = Math.max(1, laneEnds.length);
      const hasCleaning = chips.length > 0;
      return {
        propertyId: p.id,
        name: p.name,
        initial: p.name.trim().charAt(0).toUpperCase() || '·',
        avatarColor: AVATAR_COLORS[pIdx % AVATAR_COLORS.length],
        staysCount: list.length,
        nights: Math.round(nights),
        lanes,
        hasCleaning,
        canManage: manageByProperty[p.id] ?? false,
        heightStyle: `calc(${lanes} * var(--tl-stride) + ${hasCleaning ? '34px' : '14px'})`,
        bars,
        chips,
      };
    });
  }, [properties, monthBookings, monthStart, monthEnd, tlDays, manageByProperty, today]);

  // ----- Actions sur une réservation (routées vers le bon bien) -----
  async function patchBooking(targetPropertyId: string, id: string, data: Record<string, string>) {
    setActionBusy(true);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(targetPropertyId)}/bookings?bookingId=${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      );
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

  async function deleteBooking(targetPropertyId: string, id: string) {
    setActionBusy(true);
    try {
      const res = await fetch(
        `/api/airbnb/properties/${encodeURIComponent(targetPropertyId)}/bookings?bookingId=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
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

  /** Clic sur une case vide de la timeline → création pré-remplie. */
  function openCreateForDay(targetPropertyId: string, day: Date) {
    setNewPrefill({
      checkIn: toDayKey(day),
      checkOut: toDayKey(new Date(day.getTime() + MS_DAY)),
    });
    setNewOpen(true);
  }

  // ----- États vides -----
  if (!propertiesLoading && properties.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="lux-empty max-w-md rounded-2xl p-8 text-center">
          <h1 className="lux-display text-xl font-semibold text-white">Aucun bien à afficher</h1>
          <p className="mt-2 text-sm text-[#8fabc2]">
            Créez votre première propriété pour organiser votre planning.
          </p>
          <Link
            href="/airbnb/properties?new=1"
            className="lux-btn mt-5"
          >
            + Ajouter une propriété
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- En-tête ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="lux-eyebrow">Planning</p>
          <h1 className="lux-display mt-1.5 text-2xl font-semibold text-white sm:text-3xl">Calendrier</h1>
          <p className="mt-1 text-sm text-[#8fabc2]">
            {property ? (
              isAllMode ? (
                <>
                  Vue portfolio — <span className="font-semibold text-white">{properties.length} bien(s)</span> ·{' '}
                  {monthBookings.length} séjour(s) ce mois
                </>
              ) : (
                <>
                  Planning de <span className="font-semibold text-white">{property.name}</span> — {monthBookings.length} séjour(s) ce mois
                </>
              )
            ) : (
              'Chargement du planning…'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="lux-btn-ghost h-9 px-4 text-xs"
            onClick={() => setIcalOpen(true)}
            aria-label="Synchroniser un calendrier iCal"
          >
            Synchroniser iCal
          </button>
          <button
            type="button"
            className="lux-btn h-9 px-4 text-xs disabled:pointer-events-none disabled:opacity-50"
            onClick={() => {
              setNewPrefill(null);
              setNewOpen(true);
            }}
            disabled={!canManage}
            aria-label="Nouvelle réservation"
            title={canManage ? undefined : "Réservé aux propriétaires et managers"}
          >
            Nouvelle réservation
          </button>
        </div>
      </div>

      {error && (
        <div className="lux-empty flex flex-col items-center gap-3 rounded-2xl p-6 text-center" role="alert">
          <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
          <p className="text-sm font-semibold text-white">{error}</p>
          <button
            type="button"
            onClick={() => {
              void loadBookings();
            }}
            className="lux-btn-ghost mt-1 h-9 px-4 text-xs"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ---------- COACH ROOMSCAN — suggestions contextuelles (v5.4) ---------- */}
      <ContextualInsight context="/airbnb/calendar" />

      {/* ---------- Calendrier (timeline / mois) ---------- */}
      <div className="lux-card p-4 sm:p-5">
        {/* Navigation mois + bascule de vue */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#8fabc2] transition-colors hover:bg-white/[0.06] hover:text-white"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Mois précédent"
            >
              <span aria-hidden="true" className="text-base leading-none">‹</span>
            </button>
            <span className="lux-display min-w-[150px] text-center text-lg font-semibold capitalize text-white" aria-live="polite">
              {monthLabel}
            </span>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#8fabc2] transition-colors hover:bg-white/[0.06] hover:text-white"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Mois suivant"
            >
              <span aria-hidden="true" className="text-base leading-none">›</span>
            </button>
            {!isCurrentMonth && (
              <button
                type="button"
                className="ml-1 inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-[#a9d8ff] transition-colors hover:bg-white/[0.06] hover:text-white"
                onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              >
                Aujourd&apos;hui
              </button>
            )}
          </div>
          {/* Bascule segmentée « Timeline / Mois » (zéro icône) */}
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="Vue du calendrier">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'timeline'}
              className={cn(
                'h-8 rounded-full px-4 text-xs font-semibold transition-colors',
                view === 'timeline'
                  ? 'bg-[#e9c47c] text-[#1a1206] shadow-[0_6px_18px_-8px_rgba(233,196,124,0.7)]'
                  : 'text-[#8fabc2] hover:text-white',
              )}
              onClick={() => setView('timeline')}
            >
              Timeline
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'month'}
              className={cn(
                'h-8 rounded-full px-4 text-xs font-semibold transition-colors',
                view === 'month'
                  ? 'bg-[#e9c47c] text-[#1a1206] shadow-[0_6px_18px_-8px_rgba(233,196,124,0.7)]'
                  : 'text-[#8fabc2] hover:text-white',
              )}
              onClick={() => setView('month')}
            >
              Mois
            </button>
          </div>
        </div>

        {loading || propertiesLoading ? (
          <Skeleton className="h-[560px] w-full rounded-2xl bg-white/[0.06]" aria-hidden="true" />
        ) : view === 'timeline' ? (
          <>
            {/* Légende sources + astuce (vue timeline) */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5" aria-label="Légende du calendrier">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {TL_LEGEND.map((l) => (
                  <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8fabc2]">
                    <span aria-hidden="true" className="lux-dot" style={{ backgroundColor: l.color }} />
                    {l.label}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8fabc2]">
                  <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[#f43f5e]" />
                  Turnover serré
                </span>
              </div>
              {canManage && (
                <span className="text-[11px] text-[#8fabc2]">
                  Cliquez sur une barre pour le détail · sur une case vide pour créer un séjour
                </span>
              )}
            </div>
            <TimelineView
              rows={tlRows}
              days={tlDays}
              showTodayLine={showTodayLine}
              todayIndex={todayIndex}
              todayFrac={todayFrac}
              onBarClick={(bookingId) => {
                const b = bookings.find((x) => x.id === bookingId);
                if (b) setSelected(b);
              }}
              onCellClick={openCreateForDay}
              onCleaningDone={(targetPropertyId, bookingId) => {
                void patchBooking(targetPropertyId, bookingId, { cleaningStatus: 'DONE' });
              }}
            />
          </>
        ) : (
          <>
            {/* Légende historique (vue Mois) */}
            <div className="mb-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5" aria-label="Légende du calendrier">
              {LEGEND.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8fabc2]">
                  <span aria-hidden="true" className="lux-dot" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>

            {/* ---------- Grille mensuelle (vue historique) ---------- */}
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-7 border-b border-white/10 pb-2" role="row">
                  {DAY_LABELS.map((d) => (
                    <div key={d} className="lux-eyebrow px-1 text-center">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5 pt-2">
                  {gridDays.map((day) => {
                    const inMonth = day.getMonth() === cursor.getMonth();
                    const isToday = sameDay(day, today);
                    const evts = eventsOfDay(day);
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'min-h-[88px] rounded-xl border p-1.5 transition-colors sm:min-h-[96px]',
                          inMonth
                            ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
                            : 'border-transparent bg-white/[0.015]',
                        )}
                        aria-label={`${day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${evts.length} événement(s)`}
                      >
                        <div className="mb-1 flex items-center justify-between px-0.5">
                          <span
                            className={cn(
                              'lux-num inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold',
                              isToday
                                ? 'bg-[#f43f5e] text-white shadow'
                                : inMonth
                                  ? 'text-white'
                                  : 'text-[#8fabc2]/50',
                            )}
                          >
                            {day.getDate()}
                          </span>
                          {evts.length > 2 && (
                            <span className="text-[10px] font-semibold text-[#8fabc2]">+{evts.length - 2}</span>
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
                                'flex w-full items-center gap-1.5 truncate rounded-lg border px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight text-white sm:text-[11px]',
                                EVT_STYLES[e.kind],
                              )}
                              title={`${e.booking.guestName} — ${kindLabel(e.kind)} (${fmtDayFr(new Date(e.booking.checkIn))} → ${fmtDayFr(new Date(e.booking.checkOut))})`}
                            >
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: EVT_DOT[e.kind] }}
                              />
                              <span className="truncate">{e.booking.guestName}</span>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------- Fiche réservation ---------- */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label={`Réservation de ${selected.guestName}`}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#0b1226] p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="lux-display text-xl font-semibold text-white">{selected.guestName}</h2>
                <p className="mt-0.5 text-sm text-[#8fabc2]">
                  {fmtDayFr(new Date(selected.checkIn))} → {fmtDayFr(new Date(selected.checkOut))} · {selected.guests} pers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full p-1.5 text-[#8fabc2] transition-colors hover:bg-white/[0.06] hover:text-white"
                aria-label="Fermer"
              >
                <span aria-hidden="true" className="text-lg leading-none">×</span>
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <dt className="lux-eyebrow !text-[9.5px]">Source</dt>
                <dd className="mt-1 font-semibold text-white">{sourceLabel(selected.source)}</dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <dt className="lux-eyebrow !text-[9.5px]">Statut</dt>
                <dd className="mt-1 font-semibold text-white">{statusLabel(selected.status)}</dd>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <dt className="lux-eyebrow !text-[9.5px]">Ménage</dt>
                <dd className="mt-1 flex items-center gap-2 font-semibold text-white">
                  <span
                    className="lux-dot"
                    style={{
                      backgroundColor:
                        selected.cleaningStatus === 'DONE'
                          ? '#34d399'
                          : selected.cleaningStatus === 'IN_PROGRESS'
                            ? '#5cadf0'
                            : '#cdb6ff',
                    }}
                    aria-hidden="true"
                  />
                  {cleaningLabel(selected.cleaningStatus)}
                </dd>
              </div>
              {selected.guestEmail && (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <dt className="lux-eyebrow !text-[9.5px]">Email</dt>
                  <dd className="mt-1 truncate font-medium text-white">{selected.guestEmail}</dd>
                </div>
              )}
              {selected.guestPhone && (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <dt className="lux-eyebrow !text-[9.5px]">Téléphone</dt>
                  <dd className="mt-1 truncate font-medium text-white">{selected.guestPhone}</dd>
                </div>
              )}
            </dl>
            {selected.notes && (
              <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-[#8fabc2]">
                {selected.notes}
              </p>
            )}
            {/* ── v4.50 « VERROUILLAGE DU HUB PAR CODE » — le code est
                généré AUTOMATIQUEMENT à la création (4 derniers chiffres
                du téléphone → code plateforme → aléatoire unique) et
                communiqué à l'invité pour déverrouiller son hub. ── */}
            {selected.accessCode && (
              <div className="mt-3 rounded-xl border border-[#e9c47c]/30 bg-[#e9c47c]/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="lux-eyebrow !text-[9.5px] !text-[#e9c47c]/80">
                      Code d'accès hub (à communiquer à l'invité)
                    </p>
                    <p className="lux-num mt-1 text-2xl font-semibold tracking-[0.35em] text-white">
                      {selected.accessCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="lux-btn-ghost h-9 shrink-0 px-3 text-xs"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(selected.accessCode!)
                        .then(() => toast.success('Code d’acces copié'))
                        .catch(() => toast.error('Copie impossible'));
                    }}
                  >
                    Copier
                  </button>
                </div>
                {/* v4.83 — (re)envoyer les infos de connexion à l'invité ou
                    copier le message complet (WhatsApp/SMS). */}
                {canManage && selected.status !== 'CANCELLED' && (
                  <div className="mt-3 border-t border-[#e9c47c]/20 pt-3">
                    <p className="text-xs font-semibold text-[#e9c47c]">
                      Envoyer les infos de connexion à l'invité ?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="lux-btn lux-btn-gold h-9 px-4 text-xs disabled:pointer-events-none disabled:opacity-50"
                        disabled={sendAccessBusy || !selected.guestEmail}
                        onClick={() => void sendHubAccess(selected.id)}
                      >
                        {sendAccessBusy
                          ? 'Envoi…'
                          : `Envoyer à l'invité${selected.guestEmail ? '' : ' (email manquant)'}`}
                      </button>
                      <button
                        type="button"
                        className="lux-btn-ghost h-9 px-3 text-xs"
                        onClick={() => {
                          const text = hubConnectionText({
                            propertyName: property?.name ?? 'Votre logement',
                            hubSlug: property?.qrHubSlug ?? null,
                            guestName: selected.guestName,
                            accessCode: selected.accessCode!,
                            checkInIso: selected.checkIn,
                            checkOutIso: selected.checkOut,
                          });
                          void navigator.clipboard
                            .writeText(text)
                            .then(() => toast.success('Infos de connexion copiées — collez-les dans WhatsApp/SMS'))
                            .catch(() => toast.error('Copie impossible'));
                        }}
                      >
                        Copier les infos
                      </button>
                    </div>
                    {sentAccessTo[selected.id] ? (
                      <p className="mt-2 text-xs font-semibold text-[#86e9cb]">
                        ✓ Envoyé à {sentAccessTo[selected.id]}
                      </p>
                    ) : !selected.guestEmail ? (
                      <p className="mt-2 text-xs text-[#e9c47c]/75">
                        Ajoutez un email invité pour l'envoi direct — ou copiez les infos et envoyez-les vous-même.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-[#e9c47c]/75">
                        Email enrichi : lien du hub, code d'accès, arrivée &amp; départ, votre contact.
                      </p>
                    )}
                    {/* v5.6 — rappel de la fenêtre d'activation du code. */}
                    <p className="mt-1 text-[11px] text-[#e9c47c]/60">
                      Rappel : le code devient actif 4 h avant l&apos;arrivée et jusqu&apos;à la fin du séjour.
                    </p>
                  </div>
                )}
                {selected.lateCheckOutUntil ? (
                  <p className="mt-1.5 text-xs font-semibold text-[#86e9cb]">
                    Verrouillage prolongé jusqu'au{' '}
                    {fmtDateTimeFr(selected.lateCheckOutUntil)}
                  </p>
                ) : null}
              </div>
            )}
            {/* v4.50 — prolonger le départ tardif : rallonge le verrouillage
                du hub ET le compte à rebours de l'invité. */}
            {canManage && selected.status !== 'CANCELLED' && (
              <div className="mt-3 rounded-xl border border-white/10 p-3">
                <p className="lux-eyebrow !text-[9.5px]">
                  Départ tardif — prolonger le verrouillage
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    value={extensionValue}
                    onChange={(e) => setExtensionValue(e.target.value)}
                    className="h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm text-white"
                    aria-label="Nouvelle heure de fin de séjour"
                  />
                  <button
                    type="button"
                    className="lux-btn h-9 px-4 text-xs disabled:pointer-events-none disabled:opacity-50"
                    disabled={actionBusy || !extensionValue}
                    onClick={() => {
                      if (!extensionValue) return;
                      const iso = new Date(extensionValue).toISOString();
                      void patchBooking(selected.propertyId, selected.id, { lateCheckOutUntil: iso });
                    }}
                  >
                    Prolonger
                  </button>
                  {selected.lateCheckOutUntil && (
                    <button
                      type="button"
                      className="inline-flex h-9 items-center rounded-full px-3 text-xs text-[#8fabc2] transition-colors hover:text-[#ffab92]"
                      disabled={actionBusy}
                      onClick={() => void patchBooking(selected.propertyId, selected.id, { lateCheckOutUntil: '' })}
                    >
                      Annuler la prolongation
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.cleaningStatus !== 'DONE' ? (
                <Button
                  size="sm"
                  className="lux-btn h-9 px-4 text-xs"
                  disabled={actionBusy}
                  onClick={() => void patchBooking(selected.propertyId, selected.id, { cleaningStatus: 'DONE' })}
                >
                  Marquer le ménage fait
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="lux-btn-ghost h-9 px-4 text-xs"
                  disabled={actionBusy}
                  onClick={() => void patchBooking(selected.propertyId, selected.id, { cleaningStatus: 'PENDING' })}
                >
                  Ménage à refaire
                </Button>
              )}
              {canManage && selected.status !== 'CANCELLED' && (
                cancelArmed ? (
                  <span className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-9 rounded-full border border-[#f07d6a]/40 bg-[#f07d6a]/15 px-4 text-xs font-semibold text-[#ffab92] hover:bg-[#f07d6a]/25"
                      disabled={actionBusy}
                      onClick={() => void patchBooking(selected.propertyId, selected.id, { status: 'CANCELLED' })}
                    >
                      {actionBusy ? 'Annulation…' : 'Confirmer l’annulation'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 rounded-full px-3 text-xs text-[#8fabc2] hover:bg-white/[0.06] hover:text-white"
                      disabled={actionBusy}
                      onClick={() => setCancelArmed(false)}
                    >
                      Retour
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-full border-[#f07d6a]/30 bg-[#f07d6a]/10 px-4 text-xs text-[#ffab92] hover:bg-[#f07d6a]/20 hover:text-[#ffab92]"
                    disabled={actionBusy}
                    onClick={() => setCancelArmed(true)}
                  >
                    Annuler le séjour
                  </Button>
                )
              )}
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 rounded-full px-4 text-xs text-[#8fabc2] hover:bg-white/[0.06] hover:text-[#ffab92]"
                  disabled={actionBusy}
                  onClick={() => void deleteBooking(selected.propertyId, selected.id)}
                >
                  Supprimer
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
        // v4.83 — envoi direct des infos de connexion à l'invité
        // (nom du bien + slug hub pour le lien/copie).
        propertyName={property?.name ?? ''}
        hubSlug={property?.qrHubSlug ?? null}
        // v5.8 — pré-remplissage « clic sur une case vide » de la timeline.
        defaultCheckIn={newPrefill?.checkIn}
        defaultCheckOut={newPrefill?.checkOut}
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
        // v5.8 — mode « toutes les propriétés » : choix du bien dans la
        // modale (les flux iCal sont portés par le bien).
        properties={isAllMode ? properties.map((p) => ({ id: p.id, name: p.name })) : undefined}
      />
    </div>
  );
}

// =============================================================
// VUE TIMELINE « CENTRAL CALENDAR » (v5.8)
// 1 colonne / jour · 1 ligne / bien · barres de séjour absolues.
// Le conteneur unique overflow-x-auto fait défiler JOURS + BARRES
// tandis que la colonne des biens reste collée (position: sticky).
// Toutes les dimensions dérivent des variables CSS .tl-scope
// (--tl-day, --tl-left, --tl-bar, --tl-stride) → responsive sans
// re-render (44 px / jour mobile → 64 px desktop).
// =============================================================

function TimelineView({
  rows,
  days,
  showTodayLine,
  todayIndex,
  todayFrac,
  onBarClick,
  onCellClick,
  onCleaningDone,
}: {
  rows: TlRow[];
  days: Date[];
  showTodayLine: boolean;
  todayIndex: number;
  todayFrac: number;
  onBarClick: (bookingId: string) => void;
  onCellClick: (propertyId: string, day: Date) => void;
  onCleaningDone: (propertyId: string, bookingId: string) => void;
}) {
  return (
    <div className="tl-scope">
      <div className="tl-scroll overflow-x-auto rounded-xl border border-white/8 bg-white/[0.015]">
        <div
          className="relative"
          style={{ width: `calc(var(--tl-left) + var(--tl-day) * ${days.length})` }}
        >
          {/* ── En-tête double ligne : lettre du jour + numéro ── */}
          <div className="flex border-b border-white/10 bg-white/[0.02]">
            <div
              className="tl-sticky-left flex shrink-0 items-end border-r border-white/10 px-3 pb-2"
              style={{ width: 'var(--tl-left)' }}
            >
              <span className="lux-eyebrow !text-[9px]">Biens · {rows.length}</span>
            </div>
            <div className="flex shrink-0">
              {days.map((d, i) => {
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const isToday = showTodayLine && i === todayIndex;
                return (
                  <div
                    key={d.toISOString()}
                    style={{ width: 'var(--tl-day)' }}
                    className={cn(
                      'flex shrink-0 flex-col items-center border-r border-white/5 py-1.5 last:border-r-0',
                      weekend && 'tl-weekend',
                    )}
                    aria-label={d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  >
                    <span
                      className={cn(
                        'text-[9.5px] font-bold uppercase',
                        weekend ? 'text-[#8fabc2]/55' : 'text-[#8fabc2]',
                      )}
                    >
                      {DAY_LETTERS[(d.getDay() + 6) % 7]}
                    </span>
                    <span
                      className={cn(
                        'lux-num mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                        isToday
                          ? 'bg-[#f43f5e] text-white shadow-[0_0_14px_rgba(244,63,94,0.55)]'
                          : weekend
                            ? 'text-[#8fabc2]/75'
                            : 'text-white',
                      )}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Lignes (une par bien) ── */}
          {rows.map((row) => (
            <div key={row.propertyId} className="flex border-b border-white/5 last:border-b-0">
              {/* Colonne sticky : pastille ronde (photo ou initiale) + nom */}
              <div
                className="tl-sticky-left flex shrink-0 items-center gap-2.5 border-r border-white/10 px-3"
                style={{ width: 'var(--tl-left)', height: row.heightStyle }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#060a17] shadow-[0_4px_12px_-4px_rgba(2,6,18,0.8)]"
                  style={{ backgroundColor: row.avatarColor }}
                >
                  {row.initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold leading-tight text-white" title={row.name}>
                    {row.name}
                  </p>
                  <p className="mt-0.5 truncate text-[10.5px] leading-tight text-[#8fabc2]">
                    {row.staysCount} séjour{row.staysCount > 1 ? 's' : ''} · {row.nights} nuit{row.nights > 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Grille du bien : cases jours + barres + pastilles ménage */}
              <div
                className="relative shrink-0"
                style={{ width: `calc(var(--tl-day) * ${days.length})`, height: row.heightStyle }}
              >
                {/* Cases jours cliquables (création) + hachures weekend */}
                <div className="absolute inset-0 flex">
                  {days.map((d, i) => {
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        style={{ width: 'var(--tl-day)' }}
                        className={cn(
                          'shrink-0 border-r border-white/5 transition-colors last:border-r-0',
                          weekend && 'tl-weekend',
                          row.canManage
                            ? 'cursor-pointer hover:bg-white/[0.045]'
                            : 'cursor-default',
                        )}
                        aria-label={
                          row.canManage
                            ? `Créer un séjour le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${row.name}`
                            : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                        }
                        title={
                          row.canManage
                            ? `Nouveau séjour le ${fmtDayFr(d)} — ${row.name}`
                            : undefined
                        }
                        onClick={() => row.canManage && onCellClick(row.propertyId, d)}
                      />
                    );
                  })}
                </div>

                {/* Ligne du jour — trait vertical rouge, heure proportionnelle */}
                {showTodayLine && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 top-0 z-20 w-[2px] bg-[#f43f5e] shadow-[0_0_10px_rgba(244,63,94,0.6)]"
                    style={{ left: `calc(var(--tl-day) * ${todayFrac})` }}
                  />
                )}

                {/* Barres de séjour (rails empilés si chevauchement) */}
                {row.bars.map((bar, idx) => (
                  <motion.button
                    key={bar.bookingId}
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25, delay: Math.min(idx * 0.04, 0.32) }}
                    className={cn(
                      'tl-bar absolute z-10 flex items-center gap-1 pl-1 pr-2 text-[#060a17]',
                      bar.startClamped ? 'rounded-l-[8px]' : 'rounded-l-full',
                      bar.endClamped ? 'rounded-r-[8px]' : 'rounded-r-full',
                      'h-[var(--tl-bar)] shadow-[0_4px_12px_-6px_rgba(2,6,18,0.7)]',
                    )}
                    style={{
                      left: `calc(var(--tl-day) * ${bar.left})`,
                      width: `calc(var(--tl-day) * ${bar.width})`,
                      top: `calc(${bar.lane} * var(--tl-stride) + 3px)`,
                      minWidth: 18,
                      backgroundColor: bar.color,
                    }}
                    onClick={() => onBarClick(bar.bookingId)}
                    title={bar.tooltip}
                    aria-label={bar.tooltip}
                  >
                    {/* Badge plateforme typographique (« A. », « B. », « + », « i. ») */}
                    <span
                      aria-hidden="true"
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#060a17]/20 text-[8.5px] font-bold leading-none text-[#060a17]"
                    >
                      {bar.badge}
                    </span>
                    <span className="truncate text-[11px] font-semibold leading-none">
                      {bar.guestName}
                    </span>
                    {/* Points ● de turnover serré aux extrémités */}
                    {bar.turnoverIn && (
                      <span
                        aria-hidden="true"
                        className="absolute -left-1 top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full bg-[#f43f5e] shadow-[0_0_0_2px_rgba(6,10,23,0.5)]"
                      />
                    )}
                    {bar.turnoverOut && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1 top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full bg-[#f43f5e] shadow-[0_0_0_2px_rgba(6,10,23,0.5)]"
                      />
                    )}
                  </motion.button>
                ))}

                {/* Pastilles ménage (jour du check-out) : ≠ DONE → pastille
                    ambre cliquable (« Ménage fait » → PATCH) · DONE → coche ✓ verte */}
                {row.chips.map((chip) =>
                  chip.done ? (
                    <span
                      key={chip.bookingId}
                      className="absolute z-10 inline-flex h-5 items-center text-[12px] font-bold leading-none text-[#34d399]"
                      style={{
                        left: `calc(var(--tl-day) * ${chip.left})`,
                        top: `calc(${row.lanes} * var(--tl-stride) + 5px)`,
                      }}
                      role="img"
                      aria-label="Ménage fait"
                      title="Ménage fait ✓"
                    >
                      ✓
                    </span>
                  ) : (
                    <button
                      key={chip.bookingId}
                      type="button"
                      className={cn(
                        'absolute z-10 inline-flex h-5 items-center whitespace-nowrap rounded-full border px-2 text-[10px] font-semibold leading-none transition-colors',
                        chip.inProgress
                          ? 'border-[#5cadf0]/40 bg-[#5cadf0]/12 text-[#a9d8ff] hover:bg-[#5cadf0]/22'
                          : 'border-[#fbbf24]/40 bg-[#fbbf24]/12 text-[#fbbf24] hover:bg-[#fbbf24]/22',
                      )}
                      style={{
                        left: `calc(var(--tl-day) * ${chip.left})`,
                        top: `calc(${row.lanes} * var(--tl-stride) + 4px)`,
                      }}
                      title={`${chip.label} — cliquez pour marquer le ménage fait`}
                      onClick={() => onCleaningDone(chip.propertyId, chip.bookingId)}
                    >
                      {chip.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
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
    case 'PENDING': return 'À faire';
    case 'IN_PROGRESS': return 'En cours';
    case 'DONE': return 'Terminé';
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
  propertyName,
  hubSlug,
  defaultCheckIn,
  defaultCheckOut,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  /** v4.83 — nom du bien + slug hub pour l'envoi/copie des infos. */
  propertyName: string;
  hubSlug: string | null;
  /** v5.8 — pré-remplissage timeline (clic sur une case vide). */
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  onCreated: () => void | Promise<void>;
}) {
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  // v4.50 — heure exacte de check-in / check-out (protège le hub : le
  // verrouillage se déclenche à l'heure de départ exacte). Défauts
  // standards : 15 h / 11 h.
  const [checkInTime, setCheckInTime] = useState('15:00');
  const [checkOutTime, setCheckOutTime] = useState('11:00');
  const [guests, setGuests] = useState('2');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // v4.50 — code d'accès généré automatiquement (affiché après création
  // pour que l'hôte le communique immédiatement à l'invité).
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  // v4.83 — séjour créé (envoi direct des infos de connexion) :
  // OUI → POST send-hub-access (email enrichi) ; NON → copie complète.
  const [createdBooking, setCreatedBooking] = useState<{
    id: string;
    guestName: string;
    guestEmail: string | null;
    checkIn: string;
    checkOut: string;
  } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // v5.8 — applique le pré-remplissage de la timeline à CHAQUE ouverture
  // (les cases cliquées passent ici leurs dates arrivée → lendemain).
  useEffect(() => {
    if (!open) return;
    if (defaultCheckIn) setCheckIn(defaultCheckIn);
    if (defaultCheckOut) setCheckOut(defaultCheckOut);
  }, [open, defaultCheckIn, defaultCheckOut]);

  /** Réinitialise le formulaire ET la séquence post-création. */
  function resetAll() {
    setGuestName(''); setGuestEmail(''); setGuestPhone(''); setCheckIn(''); setCheckOut(''); setGuests('2'); setNotes('');
    setGeneratedCode(null);
    setCreatedBooking(null);
    setSentTo(null);
    setSendBusy(false);
  }

  /** v4.83 — OUI : envoi DIRECT à l'invité (email enrichi). */
  async function sendToGuest() {
    if (!createdBooking) return;
    setSendBusy(true);
    try {
      const res = await fetch('/api/airbnb/bookings/send-hub-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: createdBooking.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; sentTo?: string };
      if (!res.ok) throw new Error(json.error ?? 'Envoi refusé');
      setSentTo(json.sentTo ?? createdBooking.guestEmail ?? 'invité');
      toast.success(`Infos de connexion envoyées à ${json.sentTo ?? "l'invité"}`, {
        description: 'Lien du hub + code d’accès + arrivée/départ + votre contact.',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setSendBusy(false);
    }
  }

  /** v4.83 — NON : copie du message complet (WhatsApp/SMS). */
  function copyConnectionInfo() {
    if (!createdBooking || !generatedCode) return;
    const text = hubConnectionText({
      propertyName: propertyName || 'Votre logement',
      hubSlug,
      guestName: createdBooking.guestName,
      accessCode: generatedCode,
      checkInIso: createdBooking.checkIn,
      checkOutIso: createdBooking.checkOut,
    });
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Infos de connexion copiées — collez-les dans WhatsApp/SMS'))
      .catch(() => toast.error('Copie impossible'));
  }

  async function submit() {
    if (!guestName.trim() || !checkIn || !checkOut) {
      toast.error('Invité, arrivée et départ sont requis.');
      return;
    }
    // Datetimes complets (date + heure) — fin de séjour EXACTE pour le
    // verrouillage du hub et le compte à rebours de l'invité.
    const ci = `${checkIn}T${checkInTime || '15:00'}`;
    const co = `${checkOut}T${checkOutTime || '11:00'}`;
    if (new Date(co) <= new Date(ci)) {
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
          guestPhone: guestPhone.trim() || undefined,
          checkIn: ci,
          checkOut: co,
          guests: Math.max(1, Math.min(30, Number(guests) || 1)),
          notes: notes.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        booking?: {
          id?: string;
          guestName?: string;
          guestEmail?: string | null;
          checkIn?: string;
          checkOut?: string;
          accessCode?: string | null;
        };
      };
      if (!res.ok) throw new Error(json.error ?? 'Création refusée');
      // v4.50 — le code d'accès hub est AFFICHÉ dans la modale (copy →
      // WhatsApp/SMS à l'invité) ; la modale reste ouverte dessus.
      setGeneratedCode(json.booking?.accessCode ?? null);
      // v4.83 — mémorise le séjour créé pour l'envoi/copie des infos.
      if (json.booking?.id && json.booking.accessCode) {
        setCreatedBooking({
          id: json.booking.id,
          guestName: json.booking.guestName ?? guestName.trim(),
          guestEmail: json.booking.guestEmail ?? (guestEmail.trim() || null),
          checkIn: json.booking.checkIn ?? ci,
          checkOut: json.booking.checkOut ?? co,
        });
      }
      toast.success('Réservation ajoutée au planning');
      setGuestName(''); setGuestEmail(''); setGuestPhone(''); setCheckIn(''); setCheckOut(''); setGuests('2'); setNotes('');
      await onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1226] text-white sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="lux-display font-semibold text-white">Nouvelle réservation</AlertDialogTitle>
          <AlertDialogDescription className="text-[#8fabc2]">
            Ajoutez un séjour manuellement (hors plateformes). Les séjours iCal ne doivent PAS être
            recréés ici — ils se synchronisent automatiquement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-guest">Nom de l&apos;invité *</Label>
            <Input id="bk-guest" className={LUX_FIELD} value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Camille Laurent" maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-email">Email invité (optionnel)</Label>
            <Input id="bk-email" className={LUX_FIELD} type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="camille@exemple.fr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-phone">Téléphone invité (optionnel)</Label>
            <Input
              id="bk-phone"
              className={LUX_FIELD}
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+33612345678"
              inputMode="tel"
              maxLength={20}
            />
            <p className="text-xs text-[#8fabc2]">
              Format international (+33…). Sert à l&apos;envoi automatique du Bouclier d&apos;avis le matin du départ
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-in">Arrivée *</Label>
              <Input id="bk-in" className={LUX_FIELD} type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-in-time">Heure d’arrivée</Label>
              <Input id="bk-in-time" className={LUX_FIELD} type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-out">Départ *</Label>
              <Input id="bk-out" className={LUX_FIELD} type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-out-time">Heure de départ</Label>
              <Input id="bk-out-time" className={LUX_FIELD} type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-[#8fabc2]">
            L’heure de départ exacte verrouille le hub à la fin du séjour (prolongable en cas de départ tardif).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-nb">Voyageurs</Label>
              <Input id="bk-nb" className={LUX_FIELD} type="number" min={1} max={30} value={guests} onChange={(e) => setGuests(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-notes">Notes (optionnel)</Label>
              <Input id="bk-notes" className={LUX_FIELD} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Arrivée tardive…" maxLength={200} />
            </div>
          </div>
        </div>
        <AlertDialogFooter className="flex-col gap-3 sm:flex-col">
          {/* v4.50 — code d'accès hub généré automatiquement.
              v4.83 — l'hôte choisit : OUI → envoi direct à l'invité
              (email enrichi) ; NON → copie des infos complètes. */}
          {generatedCode ? (
            <div className="w-full rounded-xl border border-[#e9c47c]/30 bg-[#e9c47c]/10 p-3 text-center">
              <p className="lux-eyebrow !text-[#e9c47c]/80">
                Code d'accès hub de ce séjour
              </p>
              <p className="lux-num mt-1 text-3xl font-semibold tracking-[0.4em] text-white">
                {generatedCode}
              </p>
              <p className="mt-1 text-[11px] text-[#e9c47c]/75">
                Communiquez-le à l’invité : il déverrouillera son hub en le saisissant au scan du QR.
              </p>
              {/* v5.6 — la fenêtre du code est expliquée AVANT l'envoi :
                  évite le « le code ne marche pas » d'un invité (ou d'un
                  hôte qui teste) avant l'heure d'arrivée. */}
              <p className="mt-1 text-[11px] leading-relaxed text-[#e9c47c]/60">
                Le code devient actif 4 h avant l&apos;heure d&apos;arrivée et le hub se verrouille à la fin du séjour.
              </p>
              {/* v4.83 — « Envoyer directement à l'invité ? » */}
              {createdBooking ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-left">
                  <p className="text-xs font-semibold text-white">
                    Envoyer directement les infos de connexion à l'invité ?
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#8fabc2]">
                    Message enrichi : lien du hub, code d'accès, arrivée &amp; départ, votre contact.
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {sentTo ? (
                      <p className="rounded-lg bg-[#34d399]/10 px-3 py-2 text-xs font-semibold text-[#86e9cb]">
                        ✓ Envoyé à {sentTo} — l'invité a tout ce qu'il faut.
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="lux-btn lux-btn-gold h-10 w-full text-xs disabled:pointer-events-none disabled:opacity-50"
                        disabled={sendBusy || !createdBooking.guestEmail}
                        onClick={() => void sendToGuest()}
                      >
                        {sendBusy
                          ? 'Envoi…'
                          : createdBooking.guestEmail
                            ? `Oui, envoyer à ${createdBooking.guestEmail}`
                            : 'Oui — email invité manquant (ajoutez-le dans la fiche)'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="lux-btn-ghost h-10 w-full text-xs"
                      onClick={copyConnectionInfo}
                    >
                      Non, copier les infos de connexion (WhatsApp/SMS)
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className="mt-2 inline-flex h-8 w-full items-center justify-center text-xs text-[#e9c47c]/80 transition-colors hover:text-[#e9c47c]"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(generatedCode)
                    .then(() => toast.success('Code d’acces copié'))
                    .catch(() => toast.error('Copie impossible'));
                }}
              >
                Copier le code seul
              </button>
            </div>
          ) : null}
          <div className="flex w-full gap-2 sm:justify-end">
            <AlertDialogCancel
              className="h-10 rounded-full border-white/12 bg-white/[0.04] text-[#8fabc2] hover:bg-white/[0.08] hover:text-white"
              onClick={() => {
                resetAll();
                onOpenChange(false);
              }}
            >
              {generatedCode ? 'Fermer' : 'Annuler'}
            </AlertDialogCancel>
            {!generatedCode ? (
              <AlertDialogAction
                className="lux-btn h-10 font-semibold disabled:opacity-50"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {busy ? 'Ajout…' : 'Ajouter au planning'}
              </AlertDialogAction>
            ) : null}
          </div>
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
  properties,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  propertyName: string;
  canManage: boolean;
  /** v5.8 — mode « toutes les propriétés » : sélecteur du bien. */
  properties?: { id: string; name: string }[];
}) {
  const [feeds, setFeeds] = useState<IcalFeed[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IcalFeed | null>(null);
  // v5.8 — bien actif quand aucun n'est pré-sélectionné (mode « toutes »).
  const [pickedId, setPickedId] = useState('');
  const activeId = propertyId || pickedId;
  const activeName =
    properties?.find((p) => p.id === pickedId)?.name ?? propertyName;

  useEffect(() => {
    if (open && !propertyId && properties && properties.length > 0) {
      setPickedId((prev) => (properties.some((p) => p.id === prev) ? prev : properties[0].id));
    }
  }, [open, propertyId, properties]);

  const load = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/airbnb/ical?propertyId=${encodeURIComponent(activeId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('load');
      const data = (await res.json()) as { feeds: IcalFeed[] };
      setFeeds(data.feeds ?? []);
    } catch {
      toast.error('Impossible de charger les calendriers connectés.');
    } finally {
      setLoading(false);
    }
  }, [activeId]);

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
        body: JSON.stringify({ propertyId: activeId, label: label.trim(), url: url.trim() }),
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
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b1226] text-white sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display font-semibold text-white">Synchroniser iCal</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8fabc2]">
              Connectez les calendriers externes de {activeName || 'votre bien'} (Airbnb, Booking.com,
              Abritel…). Collez l&apos;URL d&apos;export iCal fournie par la plateforme — les séjours
              s&apos;importent puis se mettent à jour à chaque synchronisation.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* v5.8 — sélecteur du bien (mode « toutes les propriétés ») */}
          {!propertyId && properties && properties.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ic-prop">Bien concerné</Label>
              <select
                id="ic-prop"
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                className="h-10 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-white"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#0b1226] text-white">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ----- Feeds existants ----- */}
          <div className="flex flex-col gap-2">
            {loading ? (
              <Skeleton className="h-16 w-full rounded-xl bg-white/[0.06]" />
            ) : feeds.length === 0 ? (
              <p className="lux-empty rounded-xl p-4 text-center text-sm font-medium text-[#8fabc2]">
                Aucun calendrier connecté pour ce bien.
              </p>
            ) : (
              feeds.map((f) => (
                <div key={f.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]">
                  <span
                    aria-hidden="true"
                    className="lux-dot mt-1.5 shrink-0"
                    style={{ backgroundColor: f.lastStatus === 'ERROR' ? '#f07d6a' : f.lastStatus === 'OK' ? '#34d399' : '#8fabc2' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{f.label}</p>
                    <p className="truncate text-xs text-[#8fabc2]" title={f.url}>{f.url}</p>
                    <p className="mt-0.5 text-xs">
                      {f.lastSyncAt ? (
                        <>
                          <span className={cn('font-semibold', f.lastStatus === 'OK' ? 'text-[#86e9cb]' : 'text-[#f07d6a]')}>
                            {f.lastStatus === 'OK' ? '✓ Synchronisé' : '✗ Erreur'}
                          </span>{' '}
                          <span className="text-[#8fabc2]">{fmtDateTimeFr(f.lastSyncAt)} · {f.lastImported} séjour(s)</span>
                          {f.lastError && <span className="block text-[#f07d6a]">{f.lastError}</span>}
                        </>
                      ) : (
                        <span className="text-[#8fabc2]">Jamais synchronisé</span>
                      )}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="sm" variant="outline" className="h-7 rounded-full border-white/12 bg-white/[0.04] px-3 text-[11px] text-[#8fabc2] hover:bg-white/[0.08] hover:text-white" disabled={busy !== null} onClick={() => void resync(f)}>
                        {busy === f.id ? '…' : 'Re-sync'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-[#8fabc2] hover:bg-white/[0.06] hover:text-[#ffab92]" disabled={busy !== null} onClick={() => setConfirmDelete(f)}>
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
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="lux-eyebrow">Connecter un calendrier</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ic-label">Libellé (ex : « Airbnb — Loft »)</Label>
                <Input id="ic-label" className={LUX_FIELD} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Airbnb — Loft" disabled={busy !== null} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ic-url">URL d&apos;export iCal</Label>
                <Input id="ic-url" className={LUX_FIELD} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://fr.airbnb.com/calendar/ical/…" disabled={busy !== null} />
                <p className="text-[11px] text-[#8fabc2]">
                  Airbnb : Annonces → Calendrier → Disponibilité → Exporter le calendrier. Les URL
                  webcal:// sont converties automatiquement.
                </p>
              </div>
              <button
                type="button"
                className="lux-btn h-9 w-fit px-4 text-xs disabled:pointer-events-none disabled:opacity-50"
                disabled={busy !== null || !activeId}
                onClick={() => void addFeed()}
              >
                {busy === 'add' ? 'Connexion…' : 'Connecter le calendrier'}
              </button>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 rounded-full border-white/12 bg-white/[0.04] text-[#8fabc2] hover:bg-white/[0.08] hover:text-white">Fermer</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ----- Confirmation de suppression d'un feed ----- */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent className="border-white/10 bg-[#0b1226] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="lux-display font-semibold text-white">Déconnecter ce calendrier ?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8fabc2]">
              {confirmDelete?.label} ne se synchronisera plus. Les séjours déjà importés restent dans
              le planning (traçabilité).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 rounded-full border-white/12 bg-white/[0.04] text-[#8fabc2] hover:bg-white/[0.08] hover:text-white">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 rounded-full bg-[#f07d6a] font-semibold text-[#2a0c06] hover:bg-[#f07d6a]/85"
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

// =============================================================
// Parser iCal minimal (RFC 5545) — Conciergerie Hub
// Supporte les formats exports par Airbnb / Booking.com / Abritel :
//  - dépliage des lignes de continuation (espace/tab en tête)
//  - VEVENT avec DTSTART / DTEND en DATE (VALUE=DATE) ou DATE-TIME
//    (local flottant ou UTC avec Z)
//  - SUMMARY, UID (clé d'idempotence des imports)
// Les propriétés paramétrées (DTSTART;VALUE=DATE:…) sont gérées.
// =============================================================

import type { Prisma } from '@prisma/client';

export interface IcalEvent {
  uid: string | null;
  summary: string | null;
  /** Date de début (00:00 locale si VALUE=DATE). */
  start: Date;
  /** Date de fin (exclusive — nuit de départ incluse côté iCal). */
  end: Date;
}

/** Déplie les lignes de continuation RFC 5545 ("CRLF + espace"). */
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** 20250906 → Date locale 06/09 ; 20250906T140000Z → Date UTC. */
function parseIcalDate(value: string): Date | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (dateTime) {
    const [, y, mo, d, h, mi, s, z] = dateTime;
    if (z === 'Z') {
      return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    }
    // Heure locale flottante (rare chez OTA, traitée comme locale)
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  }
  return null;
}

/** Décode les échappements texte iCal (\, \; \n…). */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Extrait les VEVENT d'un contenu iCal. Ignore les événements sans
 * DTSTART/DTEND exploitables. Trie par date de début.
 */
export function parseIcalEvents(content: string): { events: IcalEvent[]; error: string | null } {
  if (!/BEGIN:VCALENDAR/i.test(content)) {
    return { events: [], error: 'Le contenu ne semble pas être un calendrier iCal (BEGIN:VCALENDAR absent).' };
  }
  const lines = unfold(content);
  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> & { rawStart?: string; rawEnd?: string } | null = null;

  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      current = {};
      continue;
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (current?.rawStart && current.rawEnd) {
        const start = parseIcalDate(current.rawStart);
        const end = parseIcalDate(current.rawEnd);
        if (start && end && end > start) {
          events.push({
            uid: current.uid ?? null,
            summary: current.summary ?? null,
            start,
            end,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const propPart = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const propName = propPart.split(';')[0].toUpperCase();

    if (propName === 'UID') {
      current.uid = value.trim() || null;
    } else if (propName === 'SUMMARY') {
      current.summary = unescapeText(value).trim() || null;
    } else if (propName === 'DTSTART') {
      current.rawStart = value;
    } else if (propName === 'DTEND') {
      current.rawEnd = value;
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, error: events.length === 0 ? 'Aucun événement exploitable trouvé dans le calendrier.' : null };
}

/** webcal:// → https:// (les OTA publient souvent des URL webcal). */
export function normalizeIcalUrl(raw: string): string {
  return raw.trim().replace(/^webcal:\/\//i, 'https://');
}

/**
 * Upsert idempotent des événements iCal en Bookings du bien.
 * Clé : (propertyId, externalRef=UID, source='ICAL'). Sans UID,
 * une clé de secours hash(startDate|endDate|summary) est utilisée.
 * Retourne le nombre de réservations écrites.
 */
export async function upsertIcalBookings(
  tx: Prisma.TransactionClient,
  propertyId: string,
  events: IcalEvent[],
): Promise<number> {
  let written = 0;
  for (const ev of events) {
    const ref =
      ev.uid ??
      `synthetic-${ev.start.toISOString().slice(0, 10)}-${ev.end.toISOString().slice(0, 10)}-${(ev.summary ?? '').slice(0, 24)}`;
    const guestName = ev.summary?.replace(/^(Reserved|Airbnb|Booking\.com)[\s:—-]*/i, '').trim() || 'Séjour iCal';
    const existing = await tx.booking.findFirst({
      where: { propertyId, source: 'ICAL', externalRef: ref },
      select: { id: true },
    });
    if (existing) {
      await tx.booking.update({
        where: { id: existing.id },
        data: { guestName, checkIn: ev.start, checkOut: ev.end },
      });
    } else {
      await tx.booking.create({
        data: {
          propertyId,
          guestName,
          checkIn: ev.start,
          checkOut: ev.end,
          source: 'ICAL',
          externalRef: ref,
          status: 'CONFIRMED',
        },
      });
    }
    written += 1;
  }
  return written;
}

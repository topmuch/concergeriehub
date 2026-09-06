import type { Metadata } from 'next';
import { CalendarContent } from '@/components/airbnb/host/calendar-content';

export const metadata: Metadata = {
  title: 'Calendrier — Conciergerie Hub',
  description:
    'Planning multi-plateformes : réservations, arrivées et départs du jour, ménages et synchronisation iCal (Airbnb, Booking, Abritel).',
};

// HOST-5 — Page « Calendrier » du Dashboard Client :
// grille mensuelle des réservations (séjour / check-in / check-out /
// ménage), création manuelle, import iCal réel (Airbnb, Booking,
// Abritel) via /api/airbnb/ical. Session et shell garantis par le
// layout /airbnb.
export default function CalendarPage() {
  return <CalendarContent />;
}

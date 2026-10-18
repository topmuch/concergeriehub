import { RouteSkeleton } from '@/components/airbnb/host/route-skeleton';

// WP-BACK v4.61 — feedback instantané pendant le chargement de l'éditeur
// « Expérience invité » (sections cartes empilées).
export default function Loading() {
  return <RouteSkeleton variant="form" titleWidth="w-72" />;
}

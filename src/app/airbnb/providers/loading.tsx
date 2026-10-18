import { RouteSkeleton } from '@/components/airbnb/host/route-skeleton';

// WP-BACK v4.61 — feedback instantané pendant le chargement des prestataires.
export default function Loading() {
  return <RouteSkeleton variant="cards" titleWidth="w-72" />;
}

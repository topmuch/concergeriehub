import { RouteSkeleton } from '@/components/airbnb/host/route-skeleton';

// WP-BACK v4.61 — feedback instantané pendant le chargement des commandes.
export default function Loading() {
  return <RouteSkeleton variant="page" titleWidth="w-56" />;
}

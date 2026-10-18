import { RouteSkeleton } from '@/components/airbnb/host/route-skeleton';

// WP-BACK v4.61 — feedback instantané pendant le chargement des réglages.
export default function Loading() {
  return <RouteSkeleton variant="form" titleWidth="w-56" />;
}

import { RouteSkeleton } from '@/components/airbnb/host/route-skeleton';

// WP-BACK v4.61 — feedback instantané pendant le chargement de l'équipe.
export default function Loading() {
  return <RouteSkeleton variant="list" titleWidth="w-48" />;
}

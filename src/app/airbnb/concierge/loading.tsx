import { RouteSkeleton } from '@/components/airbnb/host/route-skeleton';

// WP-BACK v4.61 — feedback instantané pendant le chargement de la conciergerie.
export default function Loading() {
  return <RouteSkeleton variant="page" titleWidth="w-64" />;
}

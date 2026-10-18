import { RouteSkeleton } from '@/components/airbnb/host/route-skeleton';

// v4.69 — PHASE 2 — feedback instantané pendant le chargement des invités.
export default function Loading() {
  return <RouteSkeleton variant="page" titleWidth="w-40" />;
}

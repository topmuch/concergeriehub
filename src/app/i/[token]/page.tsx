import { redirect } from 'next/navigation';

// =============================================================
// v4.97 MODULE STANDALONE « ÉTAT DES LIEUX » — ROUTE COURTE MARKETING
// roomscan.pro/i/<token> → /inspection/<token>
// Lien imprimable sur les supports de communication (QR codes,
// emails hôte) : court, mémorisable, redirige vers le formulaire
// public de l'invité.
// =============================================================

export default async function ShortInspectionLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/inspection/${encodeURIComponent(token)}`);
}

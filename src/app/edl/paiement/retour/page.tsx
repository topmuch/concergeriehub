import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { captureEdlPurchase } from '@/lib/edl-fulfillment';

export const metadata: Metadata = {
  title: 'Confirmation du paiement — RoomScan',
  robots: { index: false, follow: false },
};

// =============================================================
// /edl/paiement/retour — Retour PayPal (PUBLIC).
// PayPal redirige ici avec ?ref=<orderRef>&token=<orderId> (et des
// paramètres PayerID). La CAPTURE est faite ICI, côté serveur, une
// seule fois (idempotent) :
//   ok   → /edl/activer/<activationToken> (création du compte)
//   ko   → /edl/abonnement?erreur=1 (aucun accès délivré)
// L'achat non capturé reste en base (status 'created') pour
// réconciliation manuelle.
// =============================================================

export default async function EdlPaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  if (!ref) {
    redirect('/edl/abonnement?erreur=1');
  }

  const result = await captureEdlPurchase(ref);

  if (!result.ok || !result.activationUrl) {
    redirect('/edl/abonnement?erreur=1');
  }

  redirect(result.activationUrl);
}

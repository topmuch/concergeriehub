import type { Metadata } from 'next';
import { OrdersContent } from '@/components/airbnb/host/orders-content';

export const metadata: Metadata = {
  title: 'Commandes & Revenus — Conciergerie Hub',
  description:
    'Suivi des commandes invités par bien : encaissements réels, commissions Hub, reversements prestataires et export CSV comptable.',
};

// T4-b — Onglet « Commandes & Revenus » du Dashboard Client.
// Session + garde de rôle garantis par /airbnb/layout.tsx :
// le rendu est volontairement minimal (pattern Vue d'ensemble).
export default function OrdersPage() {
  return <OrdersContent />;
}

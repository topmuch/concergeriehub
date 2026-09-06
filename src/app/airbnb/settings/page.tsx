import type { Metadata } from 'next';
import { SettingsContent } from '@/components/airbnb/host/settings-content';

export const metadata: Metadata = {
  title: 'Paramètres — Conciergerie Hub',
  description:
    'Profil, propriétés, white-label (plan Pro), notifications, sécurité et intégrations de votre compte hôte.',
};

// HOST-5 — Page « Paramètres » du Dashboard Client :
// 6 onglets — Profil (nom/téléphone/adresse réels), Propriétés (lien
// portfolio), White-Label (BrandingContent, plan Pro), Notifications
// (préférences email/push persistées), Sécurité (changement de mot de
// passe réel bcrypt + état 2FA), Intégrations (webhooks, Stripe, iCal).
export default function SettingsPage() {
  return <SettingsContent />;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useHostContext } from '@/components/airbnb/host/host-context';

// =============================================================
// v4.74 « SMART PROMPTS » — Entrée de navigation.
// /airbnb/notifications n'est PAS la page d'édition : elle redirige
// vers les notifications intelligentes du bien sélectionné dans le
// header de l'Espace Hôte (HostContext), sinon le premier bien.
// L'édition vit sur /airbnb/properties/[id]/notifications.
// =============================================================
export default function NotificationsRedirectPage() {
  const router = useRouter();
  const { properties, propertiesLoading, selectedId } = useHostContext();

  useEffect(() => {
    if (propertiesLoading) return;
    const target =
      selectedId !== 'all'
        ? selectedId
        : properties[0]?.id;
    if (target) {
      router.replace(`/airbnb/properties/${encodeURIComponent(target)}/notifications`);
    } else {
      // Aucun bien → liste des biens (création) — rien à configurer.
      router.replace('/airbnb/properties');
    }
  }, [properties, propertiesLoading, selectedId, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <p className="text-sm font-semibold">Ouverture des notifications intelligentes…</p>
      </div>
    </div>
  );
}

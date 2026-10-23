import type { Metadata } from 'next';
import { Camera, CheckCircle2, Clock } from 'lucide-react';
import DelegationUpload from '@/components/inspection/shield/delegation-upload';
import { loadDelegationUpload } from '@/lib/shield-delegation';

// =============================================================
// ROOMSCAN BOUCLIER — DÉLÉGATION ONBOARDING — /upload/[token]
// (TASK 39, v4.154)
//
// Page PUBLIQUE ouverte via le lien magique généré par le wizard
// quand l'hôte répond « NON — je délègue à mon équipe » à la
// Question 0. Son équipe sur place photographie chaque pièce puis
// chaque équipement → bibliothèque verrouillée + PDF ONB + email
// de confirmation au propriétaire.
//
//   · token inconnu            → écran sobre « Lien invalide » ;
//   · photos déjà envoyées     → écran « Photos déjà reçues » ;
//   · lien de plus de 7 jours  → écran « Lien expiré » ;
//   · lien valide              → l'app de capture guidée (photo par
//     photo, caméra native de l'appareil — même composant que le
//     wizard et l'app cleaner).
// Aucune donnée sensible (email/téléphone) ne quitte le serveur.
// =============================================================

// FIX-CSP-PROD (v4.151) : rendu dynamique exigé par la CSP à nonce
// ('strict-dynamic'). Sans ce marqueur la page est pré-rendue au
// build → ses <script> n'ont AUCUN nonce → bloqués → zéro hydratation.


/** Écran sobre (pattern /s/[token]) pour les états non capturables. */
function SoberScreen({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'neutral' | 'success' | 'warning';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const toneRing =
    tone === 'success'
      ? 'ring-emerald-100 bg-emerald-50'
      : tone === 'warning'
        ? 'ring-amber-100 bg-amber-50'
        : 'ring-gray-100 bg-gray-50';
  const iconColor =
    tone === 'success'
      ? 'text-emerald-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-gray-400';
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-gray-900">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <div className={`flex h-16 w-16 items-center justify-center rounded-full ring-8 ${toneRing}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <h1 className="mt-5 text-xl font-black sm:text-2xl">{title}</h1>
        <div className="mt-2 text-sm leading-relaxed text-gray-600">{children}</div>
      </main>
      <footer className="mt-auto border-t border-gray-200 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-gray-500">
        © RoomScan — Certificat Anti-Dégâts • Document sécurisé SHA-256
      </footer>
    </div>
  );
}

export async function UploadTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await loadDelegationUpload(token);

  if (!result.ok) {
    if (result.reason === 'completed') {
      return (
        <SoberScreen
          tone="success"
          icon={<CheckCircle2 className="h-8 w-8" aria-hidden="true" />}
          title="Photos déjà reçues ✅"
        >
          <p>
            Les photos de référence de ce logement ont déjà été envoyées.
            La bibliothèque est verrouillée et le propriétaire a été notifié. Merci !
          </p>
        </SoberScreen>
      );
    }
    if (result.reason === 'expired') {
      return (
        <SoberScreen tone="warning" icon={<Clock className="h-8 w-8" aria-hidden="true" />} title="Lien expiré">
          <p>
            Ce lien de prise de photos est valable <strong>7 jours</strong> et il a expiré.
            Demandez au propriétaire de générer un nouveau lien depuis son tableau de bord.
          </p>
        </SoberScreen>
      );
    }
    return (
      <SoberScreen tone="neutral" icon={<Camera className="h-8 w-8" aria-hidden="true" />} title="Lien invalide">
        <p>
          Ce lien de prise de photos n&apos;est pas valide. Vérifiez le lien reçu
          (WhatsApp ou email) ou demandez-en un nouveau au propriétaire.
        </p>
      </SoberScreen>
    );
  }

  return <DelegationUpload data={result.data} />;
}

import { cn } from '@/lib/utils';

// =============================================================
// StatusBadge — badge de statut générique du Dashboard Client
// Mapping sémantique → couleur (vert / ambre / rose / bleu ciel
// autorisé ici ? non : ciel remplacé par violet clair) / slate.
//
// Familles gérées : plaques (active/inactive/lost), commandes
// (PENDING…DELIVERED), paiements (UNPAID/PAID/REFUNDED/FAILED),
// équipe (OWNER/MANAGER/CLEANER/MAINTENANCE), bookings
// (CONFIRMED/CHECKED_IN/CHECKED_OUT/CANCELLED), ménage.
// =============================================================

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

const TONES: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-violet-50 text-violet-700 border-violet-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_MAP: Record<string, { tone: Tone; label: string }> = {
  // --- Plaques QR ---
  active: { tone: 'success', label: 'Activée' },
  inactive: { tone: 'neutral', label: 'En attente' },
  lost: { tone: 'danger', label: 'Perdue' },
  revoked: { tone: 'danger', label: 'Révoquée' },

  // --- Commandes ---
  PENDING: { tone: 'warning', label: 'En attente' },
  CONFIRMED: { tone: 'info', label: 'Confirmée' },
  PREPARING: { tone: 'purple', label: 'En préparation' },
  DELIVERED: { tone: 'success', label: 'Livrée' },
  CANCELLED: { tone: 'danger', label: 'Annulée' },

  // --- Paiement ---
  UNPAID: { tone: 'warning', label: 'Non payée' },
  PAID: { tone: 'success', label: 'Payée' },
  REFUNDED: { tone: 'neutral', label: 'Remboursée' },
  FAILED: { tone: 'danger', label: 'Échec' },

  // --- Équipe ---
  OWNER: { tone: 'purple', label: '👑 Owner' },
  MANAGER: { tone: 'info', label: '👔 Manager' },
  CLEANER: { tone: 'success', label: '🧹 Cleaner' },
  MAINTENANCE: { tone: 'warning', label: '🔧 Maintenance' },
  INVITED: { tone: 'neutral', label: 'Invitation en attente' },

  // --- Séjours ---
  CONFIRMED_BOOKING: { tone: 'info', label: 'Confirmé' },
  CHECKED_IN: { tone: 'success', label: 'Arrivé' },
  CHECKED_OUT: { tone: 'neutral', label: 'Parti' },

  // --- Ménage ---
  PENDING_CLEANING: { tone: 'warning', label: 'Ménage à faire' },
  IN_PROGRESS: { tone: 'info', label: 'En cours' },
  DONE: { tone: 'success', label: 'Terminé' },

  // --- Abonnement ---
  trialing: { tone: 'info', label: 'Essai' },
  past_due: { tone: 'warning', label: 'Paiement dû' },
  canceled: { tone: 'danger', label: 'Annulé' },

  // --- Divers ---
  verified: { tone: 'success', label: 'Vérifié' },
  unverified: { tone: 'neutral', label: 'Non vérifié' },
};

export interface StatusBadgeProps {
  status: string;
  /** Libellé personnalisé (sinon mapping automatique). */
  label?: string;
  /** Force un ton (sinon mapping automatique). */
  tone?: Tone;
  className?: string;
}

export function StatusBadge({ status, label, tone, className }: StatusBadgeProps) {
  const meta = STATUS_MAP[status];
  const resolvedTone: Tone = tone ?? meta?.tone ?? 'neutral';
  const resolvedLabel = label ?? meta?.label ?? status;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        TONES[resolvedTone],
        className,
      )}
    >
      {resolvedLabel}
    </span>
  );
}

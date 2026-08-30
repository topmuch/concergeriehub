'use client';

/**
 * Barre de progression B2B (ex QRTags) :
 * - Dots en haut (trait horizontal par etape)
 * - Label "Etape X sur Y — TITRE"
 * - Carte de progression avec barre remplie emerald
 */
interface QRTProgressBarProps {
  /** Numero de l'etape actuelle (1-based) */
  currentStep: number;
  /** Nombre total d'etapes */
  totalSteps: number;
  /** Titre de l'etape, ex: "VOS INFORMATIONS" */
  stepTitle: string;
  /** Texte sous la barre, ex: "2/5 champs essentiels remplis" */
  progressLabel?: string;
}

export function QRTProgressBar({
  currentStep,
  totalSteps,
  stepTitle,
  progressLabel,
}: QRTProgressBarProps) {
  const progress = Math.round((currentStep / totalSteps) * 100);

  return (
    <>
      {/* Step dots */}
      <div className="flex justify-center gap-2 mb-1.5">
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1;
          const dotClass = step <= currentStep ? 'bg-slate-900' : 'bg-slate-300';

          return (
            <div
              key={step}
              className={`h-1.5 w-8 rounded-full transition-all duration-300 ${dotClass}`}
            />
          );
        })}
      </div>

      {/* Step label */}
      <p className="text-center text-xs font-medium tracking-wide text-slate-500 mb-4">
        Étape {currentStep} sur {totalSteps} — {stepTitle}
      </p>

      {/* Progress card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-5 py-3 flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-slate-900">
          Étape {currentStep}/{totalSteps}{progressLabel ? ` — ${progressLabel}` : ''}
        </p>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </>
  );
}

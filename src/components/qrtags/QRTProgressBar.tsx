'use client';

/**
 * Barre de progression QRTags : 
 * - Dots en haut (trait horizontal par etape)
 * - Label "ETAPES X sur Y — TITRE" en majuscules
 * - Carte de progression avec barre remplie
 */
interface QRTProgressBarProps {
  /** Numero de l'etape actuelle (1-based) */
  currentStep: number;
  /** Nombre total d'etapes */
  totalSteps: number;
  /** Titre de l'etape en majuscules, ex: "VOS INFORMATIONS" */
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
          let dotClass = 'bg-black/15';
          if (step < currentStep) dotClass = 'bg-black';
          else if (step === currentStep) dotClass = 'bg-black';
          else dotClass = 'bg-black/15';

          return (
            <div
              key={step}
              className={`h-1.5 w-8 rounded-full transition-all duration-300 ${dotClass}`}
            />
          );
        })}
      </div>

      {/* Step label */}
      <p className="text-center text-[11px] font-bold tracking-wide text-black/60 uppercase mb-6">
        Etape {currentStep} sur {totalSteps} — {stepTitle}
      </p>

      {/* Progress card */}
      <div className="bg-white border-2 border-black rounded-[12px] shadow-[4px_4px_0_rgba(0,0,0,0.08)] px-5 py-3 flex flex-col gap-1.5">
        <p className="text-[13px] font-bold text-black">
          Etape {currentStep}/{totalSteps}{progressLabel ? ` — ${progressLabel}` : ''}
        </p>
        <div className="h-2 bg-gray-100 rounded-full border border-gray-200 overflow-hidden">
          <div
            className="h-full bg-[#6D28D9] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </>
  );
}

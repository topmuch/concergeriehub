'use client';

/**
 * Boutons B2B :
 * - variant="primary" : fond Slate 900 #0F172A, texte blanc
 * - variant="accent"  : fond Emerald 600 #059669, texte blanc (CTA hospitalité)
 * - variant="secondary" : fond blanc, texte slate-900, bordure slate-300
 * Large, effet press léger (translateY 1px), ombre douce.
 */
interface QRTButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'accent';
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
}

export function QRTButton({
  children,
  variant = 'primary',
  disabled = false,
  onClick,
  type = 'button',
  className = '',
}: QRTButtonProps) {
  const base =
    'w-full py-3.5 px-5 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer select-none';

  const styles =
    variant === 'primary'
      ? 'bg-[#0F172A] border-[#0F172A] text-white shadow-sm hover:bg-[#1E293B]'
      : variant === 'accent'
        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm hover:bg-emerald-700'
        : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50';

  const disabledStyles = disabled
    ? 'opacity-40 cursor-not-allowed pointer-events-none'
    : 'active:translate-y-[1px] active:shadow-none';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${disabledStyles} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Conteneur pour les boutons precedent / suivant alignes.
 * Bouton precedent 140px fixe, suivant prend le reste.
 */
interface QRTActionsProps {
  onPrevious?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  prevLabel?: string;
  /** Utiliser le bouton accent (emerald) pour l'action principale */
  nextAccent?: boolean;
}

export function QRTActions({
  onPrevious,
  onNext,
  nextDisabled = false,
  nextLabel = 'Suivant →',
  prevLabel = '← Précédent',
  nextAccent = false,
}: QRTActionsProps) {
  return (
    <div className="grid gap-3 sm:gap-4 mt-5 mb-10" style={{ gridTemplateColumns: onPrevious ? 'minmax(100px,140px) 1fr' : '1fr' }}>
      {onPrevious && (
        <QRTButton variant="secondary" onClick={onPrevious}>
          {prevLabel}
        </QRTButton>
      )}
      <QRTButton variant={nextAccent ? 'accent' : 'primary'} onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </QRTButton>
    </div>
  );
}

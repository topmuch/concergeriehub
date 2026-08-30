'use client';

/**
 * Boutons QRTags :
 * - variant="primary" : fond violet fonce #6D28D9, texte blanc, ombre 3px
 * - variant="secondary" : fond blanc, texte noir, bordure noire
 * - Large, avec fleche, effet press (translateY 2px)
 */
interface QRTButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
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
    'w-full py-3.5 px-5 rounded-[8px] text-[15px] font-bold flex items-center justify-center gap-2 border-2 border-black transition-all cursor-pointer select-none';

  const styles =
    variant === 'primary'
      ? 'bg-[#6D28D9] text-white shadow-[3px_3px_0_rgba(0,0,0,0.2)] hover:bg-[#5B21B6]'
      : 'bg-white text-black hover:bg-gray-50';

  const disabledStyles = disabled
    ? 'opacity-40 cursor-not-allowed pointer-events-none'
    : 'active:translate-y-[2px] active:shadow-[1px_1px_0_rgba(0,0,0,0.2)]';

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
}

export function QRTActions({
  onPrevious,
  onNext,
  nextDisabled = false,
  nextLabel = 'Suivant →',
  prevLabel = '← Précédent',
}: QRTActionsProps) {
  return (
    <div className="grid gap-3 sm:gap-4 mt-5 mb-10" style={{ gridTemplateColumns: onPrevious ? 'minmax(100px,140px) 1fr' : '1fr' }}>
      {onPrevious && (
        <QRTButton variant="secondary" onClick={onPrevious}>
          {prevLabel}
        </QRTButton>
      )}
      <QRTButton variant="primary" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </QRTButton>
    </div>
  );
}

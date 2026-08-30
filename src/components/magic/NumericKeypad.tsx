'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';

interface NumericKeypadProps {
  /** Number of digits */
  length?: number;
  /** Called when all digits are entered */
  onComplete?: (pin: string) => void;
  /** Called on backspace press */
  onBackspace?: () => void;
  /** Called every time pin changes */
  onChange?: (pin: string) => void;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'] as const;

const SUB_LABELS: Record<string, string> = {
  '1': '',
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': '',
};

export function NumericKeypad({
  length = 4,
  onComplete,
  onBackspace,
  onChange,
  disabled = false,
}: NumericKeypadProps) {
  const [pin, setPin] = useState('');
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep a hidden input focused for mobile accessibility
  useEffect(() => {
    if (typeof window === 'undefined') return;
    inputRef.current?.focus();
  }, []);

  const handleKeyPress = useCallback(
    (key: string) => {
      if (disabled) return;

      if (key === 'delete') {
        setPin((prev) => {
          const next = prev.slice(0, -1);
          onBackspace?.();
          onChange?.(next);
          return next;
        });
        return;
      }

      if (key === '' || pin.length >= length) return;

      setPressedKey(key);
      setTimeout(() => setPressedKey(null), 150);

      setPin((prev) => {
        const next = prev + key;
        onChange?.(next);

        if (next.length === length) {
          // Small delay so the visual completes before callback
          setTimeout(() => {
            onComplete?.(next);
          }, 200);
        }

        return next;
      });
    },
    [disabled, pin.length, length, onComplete, onBackspace, onChange]
  );

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      {/* Hidden input for accessibility */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        className="sr-only"
        tabIndex={-1}
        aria-label="Code PIN"
        value={pin}
        readOnly
      />

      {/* PIN Dots Display */}
      <div className="flex gap-4 justify-center">
        {Array.from({ length }).map((_, i) => {
          const filled = i < pin.length;
          const active = i === pin.length;
          return (
            <motion.div
              key={i}
              className={`w-14 h-14 rounded-full border-2 transition-colors duration-200 ${
                filled
                  ? 'bg-white border-white shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                  : 'bg-transparent border-white/30'
              }`}
              animate={
                active
                  ? { scale: [1, 1.1, 1] }
                  : filled
                    ? { scale: [1, 1.15, 1] }
                    : {}
              }
              transition={
                active
                  ? { duration: 0.8, repeat: Infinity, repeatType: 'reverse' as const }
                  : { type: 'spring', stiffness: 400, damping: 15 }
              }
            >
              {filled && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-full h-full rounded-full bg-white"
                />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {KEYS.map((key) => {
          if (key === '') {
            return <div key="empty" className="h-16" />;
          }

          const isDelete = key === 'delete';
          const isPressed = pressedKey === key;

          return (
            <motion.button
              key={key}
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => handleKeyPress(isDelete ? 'delete' : key)}
              disabled={disabled}
              className={
                `relative h-16 rounded-2xl font-semibold text-2xl
                bg-white/10 backdrop-blur-xl border border-white/20
                text-white active:bg-white/25
                transition-colors duration-100
                ${isDelete ? 'flex items-center justify-center' : ''}
                ${isPressed ? 'bg-white/30' : ''}
                disabled:opacity-40 disabled:cursor-not-allowed`
              }
              aria-label={isDelete ? 'Effacer' : `Chiffre ${key}`}
            >
              {isDelete ? (
                <Delete className="w-6 h-6" />
              ) : (
                <span className="flex flex-col items-center leading-tight">
                  <span>{key}</span>
                  {SUB_LABELS[key] && (
                    <span className="text-[9px] tracking-widest text-white/40 font-normal -mt-0.5">
                      {SUB_LABELS[key]}
                    </span>
                  )}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

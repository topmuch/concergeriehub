'use client';

import { useState, useCallback } from 'react';

/**
 * Clavier numerique style iOS/QRTags pour le PIN a 4 chiffres.
 * S'inspire du design QRTags (touches blanches, bordures noires).
 */
interface QRTNumericKeypadProps {
  /** Appele quand les 4 chiffres sont saisis */
  onComplete: (pin: string) => void;
  longueur?: number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;
const SUB_LABELS: Record<string, string> = {
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

export function QRTNumericKeypad({ onComplete, longueur = 4 }: QRTNumericKeypadProps) {
  const [pin, setPin] = useState('');
  const [shaking, setShaking] = useState(false);
  const len = longueur;

  const handleKey = useCallback(
    (key: string) => {
      if (key === 'del') {
        setPin((prev) => prev.slice(0, -1));
        return;
      }
      if (key === '' || pin.length >= len) return;
      const next = pin + key;
      setPin(next);
      if (next.length === len) {
        setTimeout(() => onComplete(next), 200);
      }
    },
    [pin, len, onComplete],
  );

  const handleDelete = useCallback(() => {
    if (pin.length === 0) {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
    }
    setPin((prev) => prev.slice(0, -1));
  }, [pin.length]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Dots */}
      <div className={`flex gap-5 ${shaking ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
        {Array.from({ length: len }, (_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 border-black transition-all duration-150 ${
              i < pin.length
                ? 'bg-[#6D28D9] border-[#6D28D9] scale-110'
                : 'bg-white'
            }`}
          />
        ))}
      </div>

      {/* Keypad grid */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {KEYS.map((key) => {
          if (key === '') {
            return <div key="empty" />;
          }
          const isDelete = key === 'del';
          return (
            <button
              key={key}
              type="button"
              onClick={() => (isDelete ? handleDelete() : handleKey(key))}
              className="bg-white border-2 border-black rounded-[10px] h-16 flex flex-col items-center justify-center cursor-pointer
                active:translate-y-[2px] active:shadow-none transition-all shadow-[2px_2px_0_rgba(0,0,0,0.08)]
                hover:bg-gray-50 select-none"
            >
              {isDelete ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              ) : (
                <>
                  <span className="text-2xl font-bold text-black leading-none">{key}</span>
                  {SUB_LABELS[key] && (
                    <span className="text-[9px] font-semibold text-gray-400 tracking-[0.15em] leading-none mt-0.5">
                      {SUB_LABELS[key]}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
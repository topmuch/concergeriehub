'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { useConfetti } from './ConfettiExplosion';

interface SuccessAnimationProps {
  show?: boolean;
  size?: number;
  className?: string;
  confettiColors?: string[];
  label?: string;
}

export function SuccessAnimation({
  show = true,
  size = 96,
  className = '',
  confettiColors,
  label,
}: SuccessAnimationProps) {
  const { fire } = useConfetti();
  const prevShow = useRef(show);

  // Fire confetti when show transitions from false to true
  useEffect(() => {
    if (show && !prevShow.current) {
      const t = setTimeout(() => fire(confettiColors), 300);
      prevShow.current = show;
      return () => clearTimeout(t);
    }
    prevShow.current = show;
  }, [show, fire, confettiColors]);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, duration: 0.6 }}
            className="flex flex-col items-center"
          >
            {/* Outer glow ring */}
            <motion.div
              className="rounded-full"
              style={{ width: size, height: size }}
              initial={{ boxShadow: '0 0 0 0 rgba(255,255,255,0.4)' }}
              animate={{
                boxShadow: [
                  '0 0 0 0 rgba(255,255,255,0.4)',
                  `0 0 0 ${size * 0.3}px rgba(255,255,255,0)`,
                ],
              }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            >
              {/* Circle that draws itself */}
              <motion.div
                className="w-full h-full rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/60 flex items-center justify-center"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 12 }}
              >
                {/* Checkmark */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 15 }}
                >
                  <Check
                    className="text-white"
                    style={{ width: size * 0.45, height: size * 0.45 }}
                    strokeWidth={2.5}
                  />
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Optional label */}
            {label && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                className="text-white/90 font-semibold text-lg mt-4"
              >
                {label}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

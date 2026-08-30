'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

interface SuccessCheckProps {
  show: boolean;
  size?: number;
  className?: string;
}

export function SuccessCheck({ show, size = 80, className = '' }: SuccessCheckProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1], opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`flex items-center justify-center ${className}`}
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatType: 'reverse' }}
            className={`flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm`}
            style={{ width: size, height: size }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            >
              <Check className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={3} />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

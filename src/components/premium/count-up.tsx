'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, useInView } from 'framer-motion';

// =============================================================
// DESIGN PREMIUM « LUXE TECH » — CountUp
// Compteur qui monte de 0 → `end` quand il entre dans le viewport
// (une seule fois). Formatage fr-FR (espace fine des milliers).
// =============================================================

export function CountUp({
  end,
  duration = 1.6,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: {
  end: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, end, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [inView, end, duration]);

  const formatted = value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${formatted}${suffix}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

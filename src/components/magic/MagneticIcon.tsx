'use client';

import { useRef, useState, type ReactNode } from 'react';

interface MagneticIconProps {
  children: ReactNode;
  className?: string;
  strength?: number;
}

export function MagneticIcon({ children, className = '', strength = 20 }: MagneticIconProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setPos({
      x: ((e.clientX - cx) / rect.width) * strength,
      y: ((e.clientY - cy) / rect.height) * strength,
    });
  };

  const handleMouseLeave = () => setPos({ x: 0, y: 0 });

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`transition-transform duration-300 ease-out ${className}`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
    >
      {children}
    </div>
  );
}

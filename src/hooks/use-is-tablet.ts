'use client';

// =============================================================
// v4.51 « OPTIMISATION TABLETTE — LUXE TOTAL » — hook media query
//
// Détecte les GRANDS ÉCRANS (≥ 1024 px) : iPad paysage, Android Tab,
// desktop. Sert à n'activer les éléments « Centre de Conciergerie »
// (écran de veille Ambiance) que sur les tablettes/grands écrans,
// sans jamais rien rendre côté serveur (défaut false avant montage).
//
// NB : la barre flottante et le header météo utilisent directement
// des classes CSS (hidden lg:flex) — ce hook ne sert qu'aux
// comportements qui ont besoin d'un état JS.
// =============================================================

import { useEffect, useState } from 'react';

/** true si la fenêtre fait au moins `minWidth` px (défaut 1024 = lg). */
export function useIsTablet(minWidth = 1024): boolean {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setIsTablet(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [minWidth]);

  return isTablet;
}

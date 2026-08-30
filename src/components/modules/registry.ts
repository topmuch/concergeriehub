/**
 * Module Registry — Maps QR module type to its Config and Display components
 *
 * Each module has:
 * - Config: Dashboard-side form for configuring the QR content
 * - Display: Public-side view shown when scanning the QR code
 */

import type { QrModuleType } from '@/types/database';

export interface ModuleDefinition {
  type: QrModuleType;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  category: 'essentiel' | 'quotidien' | 'avance';
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    type: 'wifi',
    label: 'Wi-Fi Invités',
    description: 'Partagez le Wi-Fi avec vos invités en un scan',
    icon: 'Wifi',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    category: 'essentiel',
  },
  {
    type: 'external_link',
    label: 'Lien Externe',
    description: 'Redirigez vers un site web ou une ressource',
    icon: 'Link2',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    category: 'essentiel',
  },
  {
    type: 'home_manual',
    label: 'Page Info / Guide',
    description: 'Créez un guide ou une page informative',
    icon: 'FileText',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
    category: 'essentiel',
  },
  {
    type: 'doorbell',
    label: 'Portier Virtuel',
    description: 'Gérez les visiteurs en votre absence',
    icon: 'Bell',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    category: 'avance',
  },
];

export const MODULE_MAP = new Map<QrModuleType, ModuleDefinition>(
  MODULE_DEFINITIONS.map((m) => [m.type, m])
);

export function getModuleDef(type: string): ModuleDefinition | undefined {
  return MODULE_MAP.get(type as QrModuleType);
}

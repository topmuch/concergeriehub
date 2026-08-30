'use client';

import type { QrModuleType } from '@/types/database';
import type { LucideIcon } from 'lucide-react';

/**
 * Base props every module component receives.
 *
 * - `content`: The persisted JSON content for this QR code (may be empty for new).
 * - `onSave`: Callback to persist updated content back to the server.
 * - `mode`: Whether the module is in demo/preview mode or live scan mode.
 * - `roomName`: The name of the room this QR is placed in (for context).
 */
export interface ModuleProps {
  content: Record<string, unknown>;
  onSave: (content: Record<string, unknown>) => void;
  mode: 'demo' | 'live';
  roomName?: string;
}

/** Descriptor used by the module explorer grid. */
export interface ModuleDescriptor {
  type: QrModuleType;
  label: string;
  description: string;
  icon: LucideIcon;
  version: 1 | 2 | 3;
  category: string;
  color: string;
}

/** All 53 module descriptors for the explorer grid. */
export type ModuleDescriptorMap = Record<QrModuleType, ModuleDescriptor>;

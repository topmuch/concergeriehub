'use client';

import { useSearchParams } from 'next/navigation';
import { QrCode, Layers, Map } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GenerateBatch } from '@/components/admin/generate-batch';
import { ManageBatches } from '@/components/admin/manage-batches';
import { ManagePhysicalQr } from '@/components/admin/manage-physical-qr';

// =============================================================
// AdminQrContent — Module 3 Générateur QR
// Rebranche les 3 composants réels existants :
//  - GenerateBatch    : création de lots (codes uniques + design)
//  - ManageBatches    : gestion des lots (détail, suppression)
//  - ManagePhysicalQr : plaques physiques (setup tokens, statuts)
// API réelles : /api/admin/batches, /api/admin/physical-qr.
// L'onglet initial peut être imposé via ?tab=plaques|lots (liens
// depuis la recherche globale et les notifications).
// =============================================================

const TAB_VALUES = ['generer', 'lots', 'plaques'] as const;
type TabValue = (typeof TAB_VALUES)[number];

export function AdminQrContent() {
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const initial = TAB_VALUES.includes(requested as TabValue) ? (requested as TabValue) : 'generer';

  return (
    <div className="p-4 sm:p-6">
      <Tabs defaultValue={initial} className="gap-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="generer" className="gap-1.5">
            <QrCode className="h-4 w-4" /> Générer un lot
          </TabsTrigger>
          <TabsTrigger value="lots" className="gap-1.5">
            <Layers className="h-4 w-4" /> Lots
          </TabsTrigger>
          <TabsTrigger value="plaques" className="gap-1.5">
            <Map className="h-4 w-4" /> Plaques physiques
          </TabsTrigger>
        </TabsList>
        <TabsContent value="generer">
          <GenerateBatch />
        </TabsContent>
        <TabsContent value="lots">
          <ManageBatches />
        </TabsContent>
        <TabsContent value="plaques">
          <ManagePhysicalQr />
        </TabsContent>
      </Tabs>
    </div>
  );
}

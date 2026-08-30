'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Phone, Flame, Droplets, ShieldCheck, MapPin } from 'lucide-react';
import type { ModuleProps } from '../types';

const DEFAULT_CONTENT = {
  address: '12 Rue de la Paix, 75002 Paris',
  emergencyNumber: '112',
  police: '17',
  fire: '18',
  ambulance: '15',
  poisonControl: '01 40 05 48 48',
  gasEmergency: '0 800 47 30 00',
  electricityEmergency: '09 72 67 50 75',
  waterShutoff: 'Cave, sous l\'escalier',
  gasShutoff: 'Cuisine, derrière le four',
  electricalPanel: 'Entrée, à droite de la porte',
  fireExtinguisher: 'Couloir 1er étage + Cuisine',
  firstAidKit: 'Salle de bain, sous l\'évier',
  evacuationPoint: 'Jardin, près du grand arbre',
  customAlerts: [],
};

export default function EmergencyModule({ content }: ModuleProps) {
  const data = { ...DEFAULT_CONTENT, ...content } as typeof DEFAULT_CONTENT;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      <div className="rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-950/50 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900 animate-pulse">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-red-700 dark:text-red-400">URGENCE</h2>
            <p className="text-sm text-red-600/80">Numéros d'urgence et consignes de sécurité</p>
          </div>
        </div>

        {/* Quick dial buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="destructive" className="h-auto py-3 flex-col gap-1" onClick={() => window.open(`tel:${data.emergencyNumber}`)}>
            <Phone className="h-5 w-5" />
            <span className="text-xs font-bold">112</span>
            <span className="text-[10px] opacity-80">Urgences</span>
          </Button>
          <Button variant="destructive" className="h-auto py-3 flex-col gap-1" onClick={() => window.open(`tel:${data.police}`)}>
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-bold">{data.police}</span>
            <span className="text-[10px] opacity-80">Police</span>
          </Button>
          <Button variant="destructive" className="h-auto py-3 flex-col gap-1" onClick={() => window.open(`tel:${data.fire}`)}>
            <Flame className="h-5 w-5" />
            <span className="text-xs font-bold">{data.fire}</span>
            <span className="text-[10px] opacity-80">Pompiers</span>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button variant="destructive" className="h-auto py-3 flex-col gap-1 opacity-90" onClick={() => window.open(`tel:${data.ambulance}`)}>
            <Phone className="h-4 w-4" />
            <span className="text-xs font-bold">{data.ambulance}</span>
            <span className="text-[10px] opacity-80">SAMU</span>
          </Button>
          <Button variant="destructive" className="h-auto py-3 flex-col gap-1 opacity-90" onClick={() => window.open(`tel:${data.poisonControl}`)}>
            <Droplets className="h-4 w-4" />
            <span className="text-xs font-bold">Centre anti-poison</span>
            <span className="text-[10px] opacity-80">{data.poisonControl}</span>
          </Button>
        </div>
      </div>

      {/* Safety locations */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Localisations importantes</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? 'Masquer' : 'Voir tout'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { icon: <Droplets className="h-4 w-4 text-blue-500" />, label: 'Coupe-eau', value: data.waterShutoff },
              { icon: <Flame className="h-4 w-4 text-orange-500" />, label: 'Coupe-gaz', value: data.gasShutoff },
              { icon: <ShieldCheck className="h-4 w-4 text-yellow-500" />, label: 'Tableau électrique', value: data.electricalPanel },
            ].slice(0, showDetails ? undefined : 3).map((item, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border p-2.5">
                {item.icon}
                <div className="min-w-0">
                  <p className="text-xs font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.value}</p>
                </div>
              </div>
            ))}
            {showDetails && [
              { icon: <Flame className="h-4 w-4 text-red-500" />, label: 'Extincteur', value: data.fireExtinguisher },
              { icon: <ShieldCheck className="h-4 w-4 text-green-500" />, label: 'Trousse premiers secours', value: data.firstAidKit },
              { icon: <MapPin className="h-4 w-4 text-teal-500" />, label: 'Point de rassemblement', value: data.evacuationPoint },
            ].map((item, i) => (
              <div key={`more-${i}`} className="flex items-center gap-2 rounded-md border p-2.5">
                {item.icon}
                <div className="min-w-0">
                  <p className="text-xs font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Adresse :</span>
        <span className="font-medium">{data.address}</span>
      </div>
    </div>
  );
}

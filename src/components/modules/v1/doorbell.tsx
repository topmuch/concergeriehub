'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, BellRing, Volume2, VolumeX, Clock } from 'lucide-react';
import type { ModuleProps } from '../types';

const DEFAULT_CONTENT = {
  label: 'Sonnette principale',
  location: 'Entrée principale',
  ringtone: 'classique',
  volume: 80,
  doNotDisturb: false,
  log: [
    { time: '14:32', date: '2024-12-20', name: 'Livreur DHL' },
    { time: '10:15', date: '2024-12-20', name: 'Visiteur' },
    { time: '09:00', date: '2024-12-19', name: 'Postier' },
  ],
};

export default function DoorbellModule({ content, onSave }: ModuleProps) {
  const data = { ...DEFAULT_CONTENT, ...content } as typeof DEFAULT_CONTENT & { log: { time: string; date: string; name: string }[] };
  const [ringing, setRinging] = useState(false);
  const [muted, setMuted] = useState(false);
  const [doNotDisturb, setDoNotDisturb] = useState(data.doNotDisturb);

  const handleRing = () => {
    if (doNotDisturb) return;
    setRinging(true);
    setTimeout(() => setRinging(false), 3000);
    const newLog = [{ time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), date: new Date().toISOString().split('T')[0], name: 'Visiteur' }, ...(data.log || [])];
    onSave({ ...content, log: newLog.slice(0, 20) });
  };

  const toggleDnd = () => {
    const newVal = !doNotDisturb;
    setDoNotDisturb(newVal);
    onSave({ ...content, doNotDisturb: newVal });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${ringing ? 'bg-orange-200 dark:bg-orange-900' : 'bg-orange-100 dark:bg-orange-950'}`}>
                {ringing ? <BellRing className="h-5 w-5 text-orange-600 animate-bounce" /> : <Bell className="h-5 w-5 text-orange-500" />}
              </div>
              <div>
                <CardTitle className="text-base">{data.label}</CardTitle>
                <p className="text-xs text-muted-foreground">📍 {data.location}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {doNotDisturb && <Badge variant="destructive" className="text-[10px]">Ne pas déranger</Badge>}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMuted(!muted)}>
                {muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ring button */}
          <div className="flex flex-col items-center gap-3 py-4">
            <Button
              size="lg"
              className={`h-20 w-20 rounded-full text-2xl transition-all ${ringing ? 'bg-orange-500 hover:bg-orange-600 scale-110 shadow-lg shadow-orange-200' : 'bg-primary hover:bg-primary/90'} ${doNotDisturb ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleRing}
              disabled={doNotDisturb}
            >
              <Bell className="h-8 w-8" />
            </Button>
            <p className="text-sm text-muted-foreground">Appuyez pour sonner</p>
          </div>

          {/* DND toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <VolumeX className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Ne pas déranger</span>
            </div>
            <Button variant={doNotDisturb ? 'destructive' : 'outline'} size="sm" onClick={toggleDnd}>
              {doNotDisturb ? 'Activé' : 'Désactivé'}
            </Button>
          </div>

          {/* Log */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Clock className="h-4 w-4" /> Historique des sonnettes</h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {(data.log || []).map((entry, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{entry.date} {entry.time}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

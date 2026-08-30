'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Brush, Timer as TimerIcon, Zap, Cpu, Mic,
  User, Calendar, Play, Pause, RotateCcw, Plus,
  CheckCircle2, Circle, Lightbulb, Thermometer, Lock,
  Volume2, Power, Wifi, Wind, Droplets,
} from 'lucide-react';
import type { ModuleProps } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  CHORE
// ═══════════════════════════════════════════════════════════════════════════

const CHORE_DEFAULT = {
  chores: [
    { id: '1', task: 'Passer l\'aspirateur salon', assignee: 'Emma', frequency: 'Hebdomadaire', done: false, points: 10 },
    { id: '2', task: 'Ranger la cuisine', assignee: 'Lucas', frequency: 'Quotidien', done: true, points: 5 },
    { id: '3', task: 'Sortir les poubelles', assignee: 'Pierre', frequency: 'Hebdomadaire', done: false, points: 10 },
    { id: '4', task: 'Arroser les plantes', assignee: 'Marie', frequency: '2x/semaine', done: false, points: 5 },
    { id: '5', task: 'Nettoyer la litière du chat', assignee: 'Emma', frequency: 'Quotidien', done: true, points: 5 },
  ] as { id: string; task: string; assignee: string; frequency: string; done: boolean; points: number }[],
  rewardSystem: true,
};

export function ChoreModule({ content, onSave }: ModuleProps) {
  const data = { ...CHORE_DEFAULT, ...content } as typeof CHORE_DEFAULT & { chores: { id: string; task: string; assignee: string; frequency: string; done: boolean; points: number }[] };
  const [chores, setChores] = useState(data.chores);

  const toggle = (id: string) => {
    const updated = chores.map(c => c.id === id ? { ...c, done: !c.done } : c);
    setChores(updated);
    onSave({ ...content, chores: updated });
  };

  const doneCount = chores.filter(c => c.done).length;
  const totalPoints = chores.filter(c => c.done).reduce((s, c) => s + c.points, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950">
              <Brush className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-base">Corvées familiales</CardTitle>
              <p className="text-xs text-muted-foreground">{doneCount}/{chores.length} terminée(s) · {totalPoints} pts gagnés</p>
            </div>
          </div>
          <Progress value={chores.length ? (doneCount / chores.length) * 100 : 0} className="w-20 h-2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {chores.map(chore => (
          <div key={chore.id} className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${chore.done ? 'bg-green-50/50 border-green-200' : ''}`}>
            <button onClick={() => toggle(chore.id)} className="shrink-0">
              {chore.done ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${chore.done ? 'line-through text-muted-foreground' : ''}`}>{chore.task}</p>
              <p className="text-xs text-muted-foreground">👤 {chore.assignee} · 🔄 {chore.frequency}</p>
            </div>
            {data.rewardSystem && <Badge variant="outline" className="text-[10px]">⭐ {chore.points}pts</Badge>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  TIMER
// ═══════════════════════════════════════════════════════════════════════════

export function TimerModule({ content }: ModuleProps) {
  const [totalSeconds, setTotalSeconds] = useState(300);
  const [timeLeft, setTimeLeft] = useState(300);
  const [running, setRunning] = useState(false);
  const [preset, setPreset] = useState('5min');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    if (timeLeft <= 0) return;
    intervalRef.current = setInterval(() => setTimeLeft(t => {
      if (t <= 1) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return 0;
      }
      return t - 1;
    }), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = totalSeconds > 0 ? ((totalSeconds - timeLeft) / totalSeconds) * 100 : 0;

  const setPresetTime = (mins: number, label: string) => {
    setPreset(label);
    const secs = mins * 60;
    setTotalSeconds(secs);
    setTimeLeft(secs);
    setRunning(false);
  };

  const presets = [
    { label: '1 min', mins: 1 }, { label: '5 min', mins: 5 }, { label: '10 min', mins: 10 },
    { label: '15 min', mins: 15 }, { label: '25 min', mins: 25 }, { label: '30 min', mins: 30 },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950">
            <TimerIcon className="h-5 w-5 text-sky-600" />
          </div>
          <CardTitle className="text-base">Minuterie</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center py-6">
          <div className={`text-6xl font-mono font-bold tabular-nums ${timeLeft === 0 ? 'text-red-500' : ''}`}>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div>
          <Progress value={progress} className="w-64 h-2 mt-4" />
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setRunning(false); setTimeLeft(totalSeconds); }}><RotateCcw className="h-4 w-4 mr-1" />Reset</Button>
          <Button size="lg" className="gap-2" onClick={() => setRunning(!running)} disabled={timeLeft === 0}>
            {running ? <><Pause className="h-5 w-5" />Pause</> : <><Play className="h-5 w-5" />Démarrer</>}
          </Button>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {presets.map(p => (
            <Button key={p.label} variant={preset === p.label ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setPresetTime(p.mins, p.label)}>{p.label}</Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ENERGY MONITOR
// ═══════════════════════════════════════════════════════════════════════════

const ENERGY_DEFAULT = {
  current: { power: '2.4 kW', daily: '18.5 kWh', monthly: '542 kWh', cost: '89 €' },
  breakdown: [
    { device: 'Chauffage', percent: 45, icon: '🔥' },
    { device: 'Eau chaude', percent: 20, icon: '💧' },
    { device: 'Électroménager', percent: 15, icon: '🔌' },
    { device: 'Éclairage', percent: 10, icon: '💡' },
    { device: 'Autres', percent: 10, icon: '📺' },
  ] as { device: string; percent: number; icon: string }[],
  tips: 'Baissez le thermostat de 1°C pour économiser ~7% sur la facture de chauffage.',
  alertThreshold: '5 kW',
};

export function EnergyMonitorModule({ content }: ModuleProps) {
  const data = { ...ENERGY_DEFAULT, ...content } as typeof ENERGY_DEFAULT & { breakdown: { device: string; percent: number; icon: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-100 dark:bg-yellow-950">
            <Zap className="h-5 w-5 text-yellow-500" />
          </div>
          <CardTitle className="text-base">Moniteur énergétique</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{ label: 'Puissance actuelle', value: data.current.power, icon: <Zap className="h-4 w-4 text-yellow-500" /> },
            { label: 'Aujourd\'hui', value: data.current.daily, icon: <Calendar className="h-4 w-4 text-blue-500" /> },
            { label: 'Ce mois', value: data.current.monthly, icon: <Calendar className="h-4 w-4 text-green-500" /> },
            { label: 'Coût estimé', value: data.current.cost, icon: <Zap className="h-4 w-4 text-red-500" /> },
          ].map((s, i) => (
            <div key={i} className="rounded-lg border p-3 text-center"><div className="flex items-center justify-center gap-1 mb-1">{s.icon}<span className="text-[10px] text-muted-foreground">{s.label}</span></div><p className="text-lg font-bold">{s.value}</p></div>
          ))}
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">Répartition par usage</p>
          <div className="space-y-2">{data.breakdown.map((b, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 text-center">{b.icon}</span>
              <span className="text-sm w-28 shrink-0">{b.device}</span>
              <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-yellow-400" style={{ width: `${b.percent}%` }} /></div>
              <span className="text-xs font-medium w-10 text-right">{b.percent}%</span>
            </div>
          ))}</div>
        </div>
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3"><p className="text-sm">💡 {data.tips}</p></div>
        <p className="text-xs text-muted-foreground">Alerte si dépassement de {data.alertThreshold}</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SMART HOME CONTROL
// ═══════════════════════════════════════════════════════════════════════════

const SMART_HOME_DEFAULT = {
  devices: [
    { id: '1', name: 'Lumière salon', type: 'light', room: 'Salon', state: true, value: '70%', icon: '💡' },
    { id: '2', name: 'Thermostat', type: 'thermostat', room: 'Salon', state: true, value: '21°C', icon: '🌡️' },
    { id: '3', name: 'Volets salon', type: 'blind', room: 'Salon', state: false, value: 'Fermés', icon: '🪟' },
    { id: '4', name: 'Lumière chambre', type: 'light', room: 'Chambre', state: false, value: '0%', icon: '💡' },
    { id: '5', name: 'Chauffe-eau', type: 'switch', room: 'Cave', state: true, value: 'On', icon: '🔥' },
    { id: '6', name: 'Serrure porte', type: 'lock', room: 'Entrée', state: true, value: 'Verrouillée', icon: '🔒' },
    { id: '7', name: 'Porte garage', type: 'switch', room: 'Garage', state: false, value: 'Fermée', icon: '🚗' },
    { id: '8', name: 'Aspirateur robot', type: 'switch', room: 'Tout', state: false, value: 'Arrêté', icon: '🤖' },
  ] as { id: string; name: string; type: string; room: string; state: boolean; value: string; icon: string }[],
  scenes: [
    { name: 'Bonsoir', description: 'Lumière tamisée, volets fermés, thermostat 20°C', icon: '🌙' },
    { name: 'Départ', description: 'Tout éteindre, thermostat 17°C, volets fermés', icon: '🚪' },
    { name: 'Cinéma', description: 'Lumière salon éteinte, TV allumée', icon: '🎬' },
    { name: 'Absence', description: 'Simulation de présence aléatoire', icon: '🏠' },
  ] as { name: string; description: string; icon: string }[],
};

export function SmartHomeControlModule({ content, onSave }: ModuleProps) {
  const data = { ...SMART_HOME_DEFAULT, ...content } as typeof SMART_HOME_DEFAULT & { devices: { id: string; name: string; type: string; room: string; state: boolean; value: string; icon: string }[]; scenes: { name: string; description: string; icon: string }[] };
  const [devices, setDevices] = useState(data.devices);

  const toggle = (id: string) => {
    const updated = devices.map(d => {
      if (d.id !== id) return d;
      const newState = !d.state;
      let newValue = d.value;
      if (d.type === 'light') newValue = newState ? '100%' : '0%';
      else if (d.type === 'lock') newValue = newState ? 'Verrouillée' : 'Déverrouillée';
      else if (d.type === 'switch') newValue = newState ? 'On' : 'Off';
      return { ...d, state: newState, value: newValue };
    });
    setDevices(updated);
    onSave({ ...content, devices: updated });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950">
            <Cpu className="h-5 w-5 text-violet-500" />
          </div>
          <CardTitle className="text-base">Contrôle domotique</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold mb-2">Appareils</p>
          <div className="grid gap-2 sm:grid-cols-2 max-h-64 overflow-y-auto">{devices.map(d => (
            <div key={d.id} className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${d.state ? 'bg-violet-50/50 border-violet-200' : ''}`}>
              <div className="flex items-center gap-2"><span className="text-lg">{d.icon}</span><div><p className="text-sm font-medium">{d.name}</p><p className="text-[10px] text-muted-foreground">{d.room} · {d.value}</p></div></div>
              <Button variant={d.state ? 'default' : 'outline'} size="sm" className="h-7" onClick={() => toggle(d.id)}>{d.state ? 'ON' : 'OFF'}</Button>
            </div>
          ))}</div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">Scènes</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{data.scenes.map((s, i) => (
            <button key={i} className="rounded-lg border p-3 text-center hover:bg-accent transition-colors"><span className="text-xl block mb-1">{s.icon}</span><span className="text-xs font-medium">{s.name}</span><p className="text-[10px] text-muted-foreground mt-0.5">{s.description}</p></button>
          ))}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  VOICE ASSISTANT
// ═══════════════════════════════════════════════════════════════════════════

const VOICE_DEFAULT = {
 assistantName: 'Alexa',
  deviceModel: 'Amazon Echo Dot (4ème génération)',
  wakeWord: '"Alexa"',
  location: 'Salon, sur l\'étagère près de la TV',
  commands: [
    { category: 'Lumières', examples: ['Alexa, allume le salon', 'Alexa, baisse la lumière à 50%', 'Alexa, éteins tout'] },
    { category: 'Musique', examples: ['Alexa, joue du jazz', 'Alexa, pause', 'Alexa, volume 5'] },
    { category: 'Météo', examples: ['Alexa, quelle est la météo ?', 'Alexa, est-ce qu\'il va pleuvoir demain ?'] },
    { category: 'Minuterie', examples: ['Alexa, minuteur 10 minutes', 'Alexa, rappelle-moi dans 30 minutes'] },
    { category: 'Maison', examples: ['Alexa, ferme le garage', 'Alexa, température du salon ?'] },
  ] as { category: string; examples: string[] }[],
  connectedServices: ['Spotify', 'Philips Hue', 'Thermostat Netatmo', 'Tuya'],
  privacyNote: 'L\'assistant ne transmet pas vos données en dehors de la maison. Vous pouvez le débrancher si vous le souhaitez.',
};

export function VoiceAssistantModule({ content }: ModuleProps) {
  const data = { ...VOICE_DEFAULT, ...content } as typeof VOICE_DEFAULT & { commands: { category: string; examples: string[] }[]; connectedServices: string[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-950">
            <Mic className="h-5 w-5 text-cyan-600" />
          </div>
          <div>
            <CardTitle className="text-base">{data.assistantName}</CardTitle>
            <p className="text-xs text-muted-foreground">{data.deviceModel} · Mot-clé : {data.wakeWord}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-sm">📍 {data.location}</p></div>
        <div>
          <p className="text-sm font-semibold mb-2">Commandes vocales</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">{data.commands.map(cmd => (
            <div key={cmd.category} className="rounded-lg border p-3"><p className="text-sm font-medium mb-1">{cmd.category}</p><ul className="space-y-0.5">{cmd.examples.map((ex, i) => <li key={i} className="text-xs text-muted-foreground">💬 "{ex}"</li>)}</ul></div>
          ))}</div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-1.5">Services connectés</p>
          <div className="flex flex-wrap gap-1.5">{data.connectedServices.map((s, i) => <Badge key={i} variant="outline" className="text-xs">{s}</Badge>)}</div>
        </div>
        {data.privacyNote && <p className="text-xs text-muted-foreground italic">🔒 {data.privacyNote}</p>}
      </CardContent>
    </Card>
  );
}

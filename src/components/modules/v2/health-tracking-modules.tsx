'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Pill, Flower2, Smile, Target, CloudSun, Clock, Plus,
  AlertCircle, Droplets, Sun, CheckCircle2, Thermometer,
} from 'lucide-react';
import type { ModuleProps } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
//  MEDICATION
// ═══════════════════════════════════════════════════════════════════════════

const MEDICATION_DEFAULT = {
  medications: [
    { id: '1', name: 'Doliprane 1000mg', dosage: '1 comprimé', frequency: 'Toutes les 6h si douleur', patient: 'Tous', time: '08h, 14h, 20h', notes: 'Max 3g/jour', icon: '💊' },
    { id: '2', name: 'Oméprazole 20mg', dosage: '1 gélule', frequency: '1x/jour le matin à jeun', patient: 'Pierre', time: '07h00', notes: '30 min avant le petit-déjeuner', icon: '💊' },
    { id: '3', name: 'Ventoline', dosage: '2 bouffées', frequency: 'En cas de crise', patient: 'Emma', time: 'Si besoin', notes: 'Shaker avant utilisation', icon: '💨' },
  ] as { id: string; name: string; dosage: string; frequency: string; patient: string; time: string; notes: string; icon: string }[],
  pharmacyInfo: 'Pharmacie du Centre, 8 Rue de la Paix · 01 42 56 78 90',
  allergyNote: 'Lucas est allergique aux arachides. Vérifier tous les médicaments.',
};

export function MedicationModule({ content }: ModuleProps) {
  const data = { ...MEDICATION_DEFAULT, ...content } as typeof MEDICATION_DEFAULT & { medications: typeof MEDICATION_DEFAULT.medications };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100 dark:bg-pink-950">
            <Pill className="h-5 w-5 text-pink-600" />
          </div>
          <CardTitle className="text-base">Médicaments du foyer</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.allergyNote && (
          <div className="rounded-lg border-2 border-red-200 bg-red-50 dark:bg-red-950/30 p-3">
            <p className="text-sm">⚠️ <strong>Allergies :</strong> {data.allergyNote}</p>
          </div>
        )}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {data.medications.map(med => (
            <div key={med.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{med.icon}</span>
                  <span className="text-sm font-semibold">{med.name}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">👤 {med.patient}</Badge>
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <p>💉 Posologie : {med.dosage} · {med.frequency}</p>
                <p>🕐 Horaires : {med.time}</p>
                {med.notes && <p>📝 {med.notes}</p>}
              </div>
            </div>
          ))}
        </div>
        {data.pharmacyInfo && <p className="text-xs text-muted-foreground">🏥 {data.pharmacyInfo}</p>}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLANT CARE
// ═══════════════════════════════════════════════════════════════════════════

const PLANT_DEFAULT = {
  plants: [
    { id: '1', name: 'Monstera Deliciosa', location: 'Salon', waterFrequency: '1x/semaine', lastWatered: '2024-12-18', nextWater: '2024-12-25', sunlight: 'Lumière indirecte', notes: 'Tourner le pot d\'1/4 de tour chaque semaine', icon: '🪴' },
    { id: '2', name: 'Ficus Lyrata', location: 'Bureau', waterFrequency: '1x/10 jours', lastWatered: '2024-12-17', nextWater: '2024-12-27', sunlight: 'Lumière vive', notes: 'Nécessite de la brume sur les feuilles', icon: '🌿' },
    { id: '3', name: 'Aloe Vera', location: 'Cuisine', waterFrequency: '1x/2 semaines', lastWatered: '2024-12-15', nextWater: '2024-12-29', sunlight: 'Soleil direct', notes: 'Ne pas trop arroser !', icon: '🌱' },
    { id: '4', name: 'Orchidée Phalaenopsis', location: 'Chambre', waterFrequency: '1x/semaine (bain)', lastWatered: '2024-12-19', nextWater: '2024-12-26', sunlight: 'Lumière indirecte', notes: 'Ajouter de l\'engrais orchidée 1x/mois', icon: '🌺' },
  ] as { id: string; name: string; location: string; waterFrequency: string; lastWatered: string; nextWater: string; sunlight: string; notes: string; icon: string }[],
  generalTips: 'Utiliser de l\'eau à température ambiante. Vider les soucoupes 15 min après arrosage.',
};

export function PlantCareModule({ content }: ModuleProps) {
  const data = { ...PLANT_DEFAULT, ...content } as typeof PLANT_DEFAULT & { plants: typeof PLANT_DEFAULT.plants };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
            <Flower2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <CardTitle className="text-base">Soins des plantes</CardTitle>
            <p className="text-xs text-muted-foreground">{data.plants.filter(p => p.nextWater <= today).length} à arroser aujourd\'hui</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {data.plants.map(plant => (
            <div key={plant.id} className={`rounded-lg border p-3 ${plant.nextWater <= today ? 'border-blue-300 bg-blue-50/50' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{plant.icon}</span>
                  <span className="text-sm font-semibold">{plant.name}</span>
                </div>
                {plant.nextWater <= today && <Badge className="bg-blue-100 text-blue-700">💧 À arroser</Badge>}
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <p>📍 {plant.location} · ☀️ {plant.sunlight}</p>
                <p>💧 {plant.waterFrequency} · Prochain : {plant.nextWater}</p>
                {plant.notes && <p>📝 {plant.notes}</p>}
              </div>
            </div>
          ))}
        </div>
        {data.generalTips && <p className="text-xs text-muted-foreground italic">💡 {data.generalTips}</p>}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MOOD TRACKER
// ═══════════════════════════════════════════════════════════════════════════

const MOOD_DEFAULT = {
  entries: [
    { date: '2024-12-20', mood: '😊', note: 'Bonne journée en famille' },
    { date: '2024-12-19', mood: '😐', note: 'Journée moyenne, un peu fatigué' },
    { date: '2024-12-18', mood: '😢', note: 'Mauvaise nouvelle au travail' },
    { date: '2024-12-17', mood: '😄', note: 'Super soirée entre amis' },
    { date: '2024-12-16', mood: '😊', note: '' },
    { date: '2024-12-15', mood: '😠', note: 'Conflit avec le voisin' },
    { date: '2024-12-14', mood: '😴', note: 'Journée calme' },
  ] as { date: string; mood: string; note: string }[],
};

const MOODS = ['😄', '😊', '😐', '😢', '😠', '😴'];

export function MoodTrackerModule({ content, onSave }: ModuleProps) {
  const data = { ...MOOD_DEFAULT, ...content } as typeof MOOD_DEFAULT & { entries: { date: string; mood: string; note: string }[] };
  const [entries, setEntries] = useState(data.entries);
  const [selectedMood, setSelectedMood] = useState('😊');
  const [newNote, setNewNote] = useState('');

  const logMood = () => {
    const today = new Date().toISOString().split('T')[0];
    const existing = entries.findIndex(e => e.date === today);
    const newEntry = { date: today, mood: selectedMood, note: newNote };
    let updated;
    if (existing >= 0) {
      updated = [...entries];
      updated[existing] = newEntry;
    } else {
      updated = [newEntry, ...entries].slice(0, 30);
    }
    setEntries(updated);
    setNewNote('');
    onSave({ ...content, entries: updated });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-100 dark:bg-yellow-950">
            <Smile className="h-5 w-5 text-yellow-500" />
          </div>
          <CardTitle className="text-base">Suivi d\'humeur</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Comment vous sentez-vous aujourd\'hui ?</p>
          <div className="flex gap-3 justify-center">
            {MOODS.map(m => (
              <button key={m} className={`text-3xl transition-transform hover:scale-125 ${selectedMood === m ? 'scale-125 ring-2 ring-primary rounded-lg p-1' : 'p-1'}`} onClick={() => setSelectedMood(m)}>{m}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Note (optionnel)..." value={newNote} onChange={e => setNewNote(e.target.value)} className="flex-1" />
            <Button onClick={logMood}>Enregistrer</Button>
          </div>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5">
              <span className="text-xl">{entry.mood}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{entry.date}</p>
                {entry.note && <p className="text-xs text-muted-foreground truncate">{entry.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  HABIT TRACKER
// ═══════════════════════════════════════════════════════════════════════════

const HABIT_DEFAULT = {
  habits: [
    { id: '1', name: 'Méditation', icon: '🧘', streak: 12, targetDays: 7, completedDays: ['2024-12-18', '2024-12-19', '2024-12-20'] },
    { id: '2', name: 'Sport', icon: '🏃', streak: 5, targetDays: 5, completedDays: ['2024-12-16', '2024-12-17', '2024-12-18', '2024-12-19', '2024-12-20'] },
    { id: '3', name: 'Lecture 30 min', icon: '📚', streak: 3, targetDays: 7, completedDays: ['2024-12-18', '2024-12-19', '2024-12-20'] },
    { id: '4', name: 'Boire 2L d\'eau', icon: '💧', streak: 8, targetDays: 7, completedDays: ['2024-12-14', '2024-12-15', '2024-12-16', '2024-12-17', '2024-12-18', '2024-12-19', '2024-12-20', '2024-12-21'] },
    { id: '5', name: 'Dors avant 23h', icon: '😴', streak: 1, targetDays: 5, completedDays: ['2024-12-20'] },
  ] as { id: string; name: string; icon: string; streak: number; targetDays: number; completedDays: string[] }[],
};

export function HabitTrackerModule({ content, onSave }: ModuleProps) {
  const data = { ...HABIT_DEFAULT, ...content } as typeof HABIT_DEFAULT & { habits: typeof HABIT_DEFAULT.habits };
  const [habits, setHabits] = useState(data.habits);

  const today = new Date().toISOString().split('T')[0];

  const toggleToday = (id: string) => {
    const updated = habits.map(h => {
      if (h.id !== id) return h;
      const done = h.completedDays.includes(today);
      return { ...h, completedDays: done ? h.completedDays.filter(d => d !== today) : [...h.completedDays, today] };
    });
    setHabits(updated);
    onSave({ ...content, habits: updated });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-950">
            <Target className="h-5 w-5 text-green-600" />
          </div>
          <CardTitle className="text-base">Suivi d\'habitudes</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {habits.map(habit => {
          const doneToday = habit.completedDays.includes(today);
          const weekProgress = Math.min(100, Math.round((habit.completedDays.length / Math.max(1, habit.targetDays)) * 100));
          return (
            <div key={habit.id} className={`rounded-lg border p-3 transition-colors ${doneToday ? 'bg-green-50/50 border-green-200' : ''}`}>
              <div className="flex items-center gap-3">
                <button className={`text-2xl transition-transform hover:scale-110 ${doneToday ? 'opacity-100' : 'opacity-40 grayscale'}`} onClick={() => toggleToday(habit.id)}>{habit.icon}</button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{habit.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">🔥 {habit.streak}j</span>
                      {doneToday && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    </div>
                  </div>
                  <Progress value={weekProgress} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground mt-1">{habit.completedDays.length}/{habit.targetDays} jours cette semaine</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  WEATHER STATION
// ═══════════════════════════════════════════════════════════════════════════

const WEATHER_DEFAULT = {
  location: 'Paris, France',
  indoor: { temperature: '22.5°C', humidity: '45%', co2: '420 ppm', noise: '35 dB' },
  outdoor: { temperature: '8°C', humidity: '78%', wind: '15 km/h', uv: '1 (faible)' },
  forecast: [
    { day: 'Lun', icon: '☀️', high: '10°C', low: '3°C' },
    { day: 'Mar', icon: '⛅', high: '9°C', low: '4°C' },
    { day: 'Mer', icon: '🌧️', high: '7°C', low: '2°C' },
    { day: 'Jeu', icon: '🌧️', high: '6°C', low: '1°C' },
    { day: 'Ven', icon: '☀️', high: '11°C', low: '4°C' },
  ] as { day: string; icon: string; high: string; low: string }[],
  alerts: 'Aucune alerte météo en cours.',
};

export function WeatherStationModule({ content }: ModuleProps) {
  const data = { ...WEATHER_DEFAULT, ...content } as typeof WEATHER_DEFAULT & { forecast: { day: string; icon: string; high: string; low: string }[] };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950">
            <CloudSun className="h-5 w-5 text-sky-500" />
          </div>
          <div>
            <CardTitle className="text-base">Station météo</CardTitle>
            <p className="text-xs text-muted-foreground">📍 {data.location}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">🏠 Intérieur</p>
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-lg font-bold">{data.indoor.temperature}</p><p className="text-[10px] text-muted-foreground">Température</p></div>
              <div><p className="text-lg font-bold">{data.indoor.humidity}</p><p className="text-[10px] text-muted-foreground">Humidité</p></div>
              <div><p className="text-sm font-bold">{data.indoor.co2}</p><p className="text-[10px] text-muted-foreground">CO₂</p></div>
              <div><p className="text-sm font-bold">{data.indoor.noise}</p><p className="text-[10px] text-muted-foreground">Bruit</p></div>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">🌤️ Extérieur</p>
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-lg font-bold">{data.outdoor.temperature}</p><p className="text-[10px] text-muted-foreground">Température</p></div>
              <div><p className="text-lg font-bold">{data.outdoor.humidity}</p><p className="text-[10px] text-muted-foreground">Humidité</p></div>
              <div><p className="text-sm font-bold">{data.outdoor.wind}</p><p className="text-[10px] text-muted-foreground">Vent</p></div>
              <div><p className="text-sm font-bold">{data.outdoor.uv}</p><p className="text-[10px] text-muted-foreground">UV</p></div>
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">Prévisions 5 jours</p>
          <div className="grid grid-cols-5 gap-1">
            {data.forecast.map((f, i) => (
              <div key={i} className="flex flex-col items-center rounded-lg border p-2">
                <span className="text-xs font-medium">{f.day}</span>
                <span className="text-lg my-1">{f.icon}</span>
                <span className="text-xs font-bold">{f.high}</span>
                <span className="text-[10px] text-muted-foreground">{f.low}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">📢 {data.alerts}</p>
      </CardContent>
    </Card>
  );
}

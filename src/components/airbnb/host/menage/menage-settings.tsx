'use client';

// =============================================================
// RÉGLAGES — onglet 5 du module « Ménage & Stock » (/airbnb/menage)
// Reprise EXACTE des blocs existants (v4.43) dans un onglet dédié :
//   1. CHECKLIST DE NETTOYAGE — checklist générale (10 essentiels)
//      ou personnalisée de l'hôte (servie à l'équipe dans le Hub) ;
//   2. MESSAGE VOCAL POUR L'ÉQUIPE — micro de l'hôte OU voix IA (TTS),
//      écoutable par l'équipe avant chaque passage.
// La configuration exige un bien précis : en « Toutes les propriétés »
// les deux blocs passent en guidance (readonly).
// =============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_CLEANING_CHECKLIST, MAX_CHECKLIST_ITEMS } from '@/lib/housekeeping';
import { pickRecorderMime } from '@/lib/voice-audio';
import { cn } from '@/lib/utils';
import type { ChecklistInfo, HostNoteInfo } from './types';
import { LuxBusyDot, LUX_FIELD, LUX_GHOST_BTN } from './menage-ui';

const MAX_NOTE_SEC = 90;

// =============================================================
// 1. CHECKLIST DE NETTOYAGE (logique inchangée)
// =============================================================
function ChecklistSection({
  propertyId,
  enabled,
  checklist,
  onSaved,
}: {
  propertyId: string | null;
  enabled: boolean;
  checklist: ChecklistInfo;
  onSaved: (c: ChecklistInfo) => void;
}) {
  const [mode, setMode] = useState<'default' | 'custom'>(checklist.source);
  const [items, setItems] = useState<string[]>(
    checklist.source === 'custom' ? checklist.items : [],
  );
  const [saving, setSaving] = useState(false);

  // Re-synchronise si le bien sélectionné change.
  useEffect(() => {
    setMode(checklist.source);
    setItems(checklist.source === 'custom' ? checklist.items : []);
  }, [checklist.source, checklist.items, propertyId]);

  const saveDefault = async () => {
    if (!propertyId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/airbnb/menage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, mode: 'default' }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; checklist?: ChecklistInfo };
      if (!res.ok || !json.checklist) {
        toast.error(json.error ?? 'Enregistrement impossible.');
        return;
      }
      onSaved(json.checklist);
      toast.success('Checklist générale activée ✓');
    } catch {
      toast.error('Erreur réseau. Réessayez dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  const saveCustom = async () => {
    if (!propertyId) return;
    const cleaned = items.map((i) => i.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast.error('Ajoutez au moins un point à votre checklist.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/airbnb/menage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, mode: 'custom', items: cleaned }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; checklist?: ChecklistInfo };
      if (!res.ok || !json.checklist) {
        toast.error(json.error ?? 'Enregistrement impossible.');
        return;
      }
      onSaved(json.checklist);
      setItems(json.checklist.items);
      toast.success('Votre checklist personnalisée est active ✓');
    } catch {
      toast.error('Erreur réseau. Réessayez dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    (mode === 'custom' &&
      (JSON.stringify(items.map((i) => i.trim()).filter(Boolean)) !==
        JSON.stringify(checklist.source === 'custom' ? checklist.items : []) ||
        checklist.source !== 'custom')) ||
    (mode === 'default' && checklist.source !== 'default');

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="lux-card p-4 sm:p-6"
      aria-label="Checklist de nettoyage"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="lux-eyebrow">Servie à votre équipe dans le hub</p>
          <h2 className="lux-display mt-1 text-lg text-white">Checklist de nettoyage</h2>
          <p className="mt-1 text-sm text-[#8fabc2]">
            Cochée point par point par votre équipe à chaque passage. Elle est affichée telle
            quelle dans le Mode Ménage du Hub.
          </p>
        </div>
        <span className="lux-chip shrink-0">
          <span
            className="lux-dot"
            style={{ backgroundColor: checklist.source === 'custom' ? '#2dd4bf' : 'rgba(143,160,194,0.55)' }}
            aria-hidden="true"
          />
          {checklist.source === 'custom' ? 'Personnalisée' : 'Checklist générale'}
        </span>
      </div>

      {/* Choix du mode */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Type de checklist">
        <button
          type="button"
          disabled={!enabled}
          onClick={() => setMode('default')}
          aria-pressed={mode === 'default'}
          className={cn(
            'rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60 disabled:opacity-50',
            mode === 'default'
              ? 'border-[#e9c47c]/45 bg-[#e9c47c]/8 ring-1 ring-[#e9c47c]/25'
              : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]',
          )}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className="lux-dot"
              style={{ backgroundColor: mode === 'default' ? '#e9c47c' : 'rgba(143,160,194,0.4)' }}
              aria-hidden="true"
            />
            Checklist générale
          </p>
          <p className="mt-0.5 text-xs text-[#8fabc2]">
            Les 10 essentiels du nettoyage (recommandé).
          </p>
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => {
            setMode('custom');
            if (items.length === 0) setItems(['']);
          }}
          aria-pressed={mode === 'custom'}
          className={cn(
            'rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60 disabled:opacity-50',
            mode === 'custom'
              ? 'border-[#e9c47c]/45 bg-[#e9c47c]/8 ring-1 ring-[#e9c47c]/25'
              : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]',
          )}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className="lux-dot"
              style={{ backgroundColor: mode === 'custom' ? '#2dd4bf' : 'rgba(143,160,194,0.4)' }}
              aria-hidden="true"
            />
            Ma checklist personnalisée
          </p>
          <p className="mt-0.5 text-xs text-[#8fabc2]">
            Écrivez vos propres points (20 maximum).
          </p>
        </button>
      </div>

      {/* Éditeur */}
      {mode === 'default' ? (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {DEFAULT_CLEANING_CHECKLIST.map((label) => (
            <li key={label} className="flex items-center gap-2 text-sm text-[#8fabc2]">
              <span aria-hidden="true" className="shrink-0 font-semibold text-[#2dd4bf]">
                ✓
              </span>
              {label}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => setItems((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))}
                maxLength={120}
                placeholder={`Point ${i + 1} (ex. « Lits refaits avec housse »)`}
                aria-label={`Point de checklist ${i + 1}`}
                className={cn('h-10', LUX_FIELD)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full border-white/12 bg-white/[0.04] text-[#8fabc2] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
                onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}
                aria-label={`Supprimer le point ${i + 1}`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  ×
                </span>
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-full border-dashed border-white/15 bg-transparent text-xs font-semibold text-[#8fabc2] hover:bg-white/5 hover:text-white"
            disabled={items.length >= MAX_CHECKLIST_ITEMS}
            onClick={() => setItems((arr) => [...arr, ''])}
          >
            + Ajouter un point ({items.length}/{MAX_CHECKLIST_ITEMS})
          </Button>
        </div>
      )}

      {enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {mode === 'custom' ? (
            <button
              type="button"
              className="lux-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60 disabled:pointer-events-none disabled:opacity-60"
              onClick={() => void saveCustom()}
              disabled={saving}
            >
              {saving && <LuxBusyDot />}
              Enregistrer ma checklist
            </button>
          ) : (
            <button
              type="button"
              className="lux-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60 disabled:pointer-events-none disabled:opacity-60"
              onClick={() => void saveDefault()}
              disabled={saving || checklist.source === 'default'}
            >
              {saving && <LuxBusyDot />}
              Utiliser la checklist générale
            </button>
          )}
          {dirty && mode === 'custom' && checklist.source === 'custom' && (
            <span className="text-xs text-[#8fabc2]">Modifications non enregistrées</span>
          )}
        </div>
      )}
      {!enabled && (
        <p className="mt-3 text-xs text-[#8fabc2]">
          Sélectionnez un bien précis (barre du haut) pour modifier sa checklist.
        </p>
      )}
    </motion.section>
  );
}

// =============================================================
// 2. MESSAGE VOCAL POUR L'ÉQUIPE (logique inchangée : TTS / micro)
// =============================================================
function HostNoteSection({
  propertyId,
  enabled,
  note,
  onSaved,
  onDeleted,
}: {
  propertyId: string | null;
  enabled: boolean;
  note: HostNoteInfo | null;
  onSaved: (n: HostNoteInfo) => void;
  onDeleted: () => void;
}) {
  const [ttsText, setTtsText] = useState('');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [pending, setPending] = useState<{ dataUrl: string; mime: string; sec: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recSecRef = useRef(0);

  const stopStreams = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopStreams, [stopStreams]);

  const startRecording = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Enregistrement non disponible sur ce navigateur. Utilisez la voix IA.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const sec = recSecRef.current;
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setPending({ dataUrl: reader.result, mime: blob.type.split(';')[0], sec });
          }
        };
        reader.readAsDataURL(blob);
        stopStreams();
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecSec(0);
      recSecRef.current = 0;
      timerRef.current = setInterval(() => {
        setRecSec((s) => {
          const next = s + 1;
          recSecRef.current = next;
          if (next >= MAX_NOTE_SEC && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop();
          }
          return next;
        });
      }, 1000);
    } catch {
      toast.error('Micro inaccessible. Vérifiez les autorisations du navigateur.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  };

  const sendPending = async () => {
    if (!pending || !propertyId) return;
    setUploadBusy(true);
    try {
      const res = await fetch('/api/airbnb/menage/voice-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          action: 'upload',
          audioData: pending.dataUrl,
          audioMime: pending.mime,
          durationSec: pending.sec,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Envoi impossible.');
        return;
      }
      setPending(null);
      onSaved({
        propertyId,
        propertyName: null,
        audioUrl: `/api/airbnb/menage/voice-note?propertyId=${encodeURIComponent(propertyId)}&v=${Date.now()}`,
        source: 'upload',
        text: null,
        durationSec: pending.sec,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Message vocal enregistré — visible par votre équipe');
    } catch {
      toast.error('Erreur réseau. Réessayez dans un instant.');
    } finally {
      setUploadBusy(false);
    }
  };

  const generateTts = async () => {
    if (!propertyId) return;
    const text = ttsText.trim();
    if (!text) {
      toast.error('Écrivez d’abord le message à transformer en voix.');
      return;
    }
    setTtsBusy(true);
    try {
      const res = await fetch('/api/airbnb/menage/voice-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, action: 'tts', text }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; durationSec?: number };
      if (!res.ok) {
        toast.error(json.error ?? 'Génération impossible.');
        return;
      }
      onSaved({
        propertyId,
        propertyName: null,
        audioUrl: `/api/airbnb/menage/voice-note?propertyId=${encodeURIComponent(propertyId)}&v=${Date.now()}`,
        source: 'tts',
        text,
        durationSec: json.durationSec ?? 0,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Voix générée — votre équipe peut l’écouter');
    } catch {
      toast.error('Erreur réseau. Réessayez dans un instant.');
    } finally {
      setTtsBusy(false);
    }
  };

  const deleteNote = async () => {
    if (!propertyId) return;
    try {
      const res = await fetch(
        `/api/airbnb/menage/voice-note?propertyId=${encodeURIComponent(propertyId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        toast.error('Suppression impossible.');
        return;
      }
      onDeleted();
      toast.success('Message vocal supprimé.');
    } catch {
      toast.error('Erreur réseau. Réessayez dans un instant.');
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
      className="lux-card p-4 sm:p-6"
      aria-label="Message vocal pour l'équipe de ménage"
    >
      <div className="min-w-0">
        <p className="lux-eyebrow">Écouté dans le mode ménage du hub</p>
        <h2 className="lux-display mt-1 text-lg text-white">Message vocal pour l&apos;équipe de ménage</h2>
        <p className="mt-1 text-sm text-[#8fabc2]">
          Laissez une consigne parlée (rangement particulier, produits à utiliser…) : votre équipe
          l&apos;écoute directement dans le Mode Ménage du Hub, avant de commencer.
        </p>
      </div>

      {enabled && note && (
        <div className="mt-4 rounded-2xl border border-[#2dd4bf]/25 bg-[#2dd4bf]/8 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#86e9cb]">
            <span className="lux-dot" style={{ backgroundColor: '#2dd4bf' }} aria-hidden="true" />
            Message actif{' '}
            <span className="font-normal text-[#8fabc2]">
              ({note.source === 'tts' ? 'voix IA' : 'micro'}
              {note.durationSec > 0 ? ` · ${note.durationSec} s` : ''})
            </span>
          </p>
          <audio controls preload="none" src={note.audioUrl} className="mt-2 w-full max-w-md" />
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full border-[#f07d6a]/30 bg-transparent text-xs font-semibold text-[#f07d6a] hover:bg-[#f07d6a]/10 hover:text-[#f07d6a]"
              onClick={() => void deleteNote()}
            >
              Supprimer
            </Button>
          </div>
        </div>
      )}

      {enabled ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Voix IA */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="lux-dot" style={{ backgroundColor: '#cdb6ff' }} aria-hidden="true" />
              Générer avec la voix IA
            </p>
            <p className="mt-1 text-xs text-[#8fabc2]">
              Écrivez votre consigne, elle est transformée en message vocal.
            </p>
            <Textarea
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Ex. : Bonjour ! Aujourd'hui, merci de changer aussi la housse de couette du lit double et de laisser la fenêtre de la chambre ouverte dix minutes."
              className={cn('mt-2', LUX_FIELD)}
              aria-label="Texte du message pour l'équipe de ménage"
            />
            <button
              type="button"
              className="lux-btn mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60 disabled:pointer-events-none disabled:opacity-60"
              onClick={() => void generateTts()}
              disabled={ttsBusy || recording}
            >
              {ttsBusy && <LuxBusyDot />}
              Générer la voix
            </button>
          </div>

          {/* Micro */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="lux-dot" style={{ backgroundColor: '#f07d6a' }} aria-hidden="true" />
              Enregistrer avec votre micro
            </p>
            <p className="mt-1 text-xs text-[#8fabc2]">Jusqu&apos;à {MAX_NOTE_SEC} secondes.</p>
            {recording ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#f07d6a]/30 bg-[#f07d6a]/10 px-3 py-1 text-sm font-semibold text-[#f07d6a]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#f07d6a]" aria-hidden="true" />
                  <span className="lux-num">{recSec}</span> s / {MAX_NOTE_SEC} s
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn('h-9 rounded-full', LUX_GHOST_BTN)}
                  onClick={stopRecording}
                >
                  Arrêter
                </Button>
              </div>
            ) : pending ? (
              <div className="mt-2 space-y-2">
                <audio controls preload="metadata" src={pending.dataUrl} className="w-full max-w-md" />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="lux-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5cadf0]/60 disabled:pointer-events-none disabled:opacity-60"
                    onClick={() => void sendPending()}
                    disabled={uploadBusy}
                  >
                    {uploadBusy && <LuxBusyDot />}
                    Envoyer à l&apos;équipe
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn('h-9 rounded-full', LUX_GHOST_BTN)}
                    onClick={() => setPending(null)}
                  >
                    Refaire
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 h-9 rounded-full border-[#2dd4bf]/30 bg-[#2dd4bf]/8 text-xs font-semibold text-[#2dd4bf] hover:bg-[#2dd4bf]/15 hover:text-[#86e9cb]"
                onClick={() => void startRecording()}
                disabled={ttsBusy}
              >
                Démarrer l&apos;enregistrement
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[#8fabc2]">
          Sélectionnez un bien précis (barre du haut) pour enregistrer un message vocal.
        </p>
      )}
    </motion.section>
  );
}

// ── Onglet RÉGLAGES — assemble les deux blocs ──
export function MenageSettings({
  propertyId,
  enabled,
  checklist,
  hostNote,
  onChecklistSaved,
  onNoteSaved,
  onNoteDeleted,
}: {
  propertyId: string | null;
  enabled: boolean;
  checklist: ChecklistInfo;
  hostNote: HostNoteInfo | null;
  onChecklistSaved: (c: ChecklistInfo) => void;
  onNoteSaved: (n: HostNoteInfo) => void;
  onNoteDeleted: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ChecklistSection
        propertyId={propertyId}
        enabled={enabled}
        checklist={checklist}
        onSaved={onChecklistSaved}
      />
      <HostNoteSection
        propertyId={propertyId}
        enabled={enabled}
        note={hostNote}
        onSaved={onNoteSaved}
        onDeleted={onNoteDeleted}
      />
    </div>
  );
}

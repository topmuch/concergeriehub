'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Send, Copy, Check, Phone, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { QRTCard, QRTButton, QRTNumericKeypad } from '@/components/qrtags';
import { QR_MODULE_LABELS } from '@/types/database';

// ── Types ──
interface QrCodeInfo {
  id: string;
  name: string;
  type: string;
  publicSlug: string | null;
  isPrivate: boolean;
  content: Record<string, unknown>;
}

interface RoomInfo {
  id: string;
  name: string;
  icon: string | null;
  qrCodes: QrCodeInfo[];
}

interface VoiceMsg {
  id: string;
  senderName: string;
  senderType: string;
  audioUrl: string;
  durationSec: number;
  createdAt: string;
}

interface HubData {
  home: { id: string; name: string; address: string | null; hasPin: boolean };
  ownerName: string | null;
  guestRooms: RoomInfo[];
  familyRooms: RoomInfo[];
  voiceMessages: VoiceMsg[];
}

type HubView = 'mode-select' | 'guest' | 'family' | 'room-detail' | 'voice-detail';
type PinModalFor = 'family' | 'settings' | null;

// ── Emoji mappings ──
const ROOM_EMOJIS: Record<string, string> = {
  salon: '\uD83D\uDECB\uFE0F', cuisine: '\uD83C\uDF73', chambre: '\uD83D\uDECF\uFE0F', 'chambre-principale': '\uD83D\uDECF\uFE0F',
  'salle-de-bain': '\uD83D\uDEBF', sdb: '\uD83D\uDEBF', bureau: '\uD83D\uDCBC', 'chambre-amis': '\uD83D\uDECF\uFE0F',
  entree: '\uD83D\uDEAA', 'piece-a-vivre': '\uD83D\uDECB\uFE0F', jardin: '\uD83C\uDF3F', garage: '\uD83D\uDE97',
  'salle-de-jeux': '\uD83C\uDFAE', musique: '\uD83C\uDFB5', sport: '\uD83D\uDCAA', bibliotheque: '\uD83D\uDCDA',
  tv: '\uD83D\uDCFA', sejour: '\uD83D\uDECB\uFE0F', 'salle-a-manger': '\uD83C\uDF7D\uFE0F', couloir: '\uD83D\uDEAA',
  wc: '\uD83D\uDEBD', cave: '\uD83C\uDF77', grenier: '\uD83D\uDCE6', balcon: '\uD83C\uDF3F', terrasse: '\uD83C\uDF3F',
};

const MODULE_EMOJIS: Record<string, string> = {
  wifi: '\uD83D\uDCF1', guestbook: '\uD83D\uDCD6', doorbell: '\uD83D\uDD14', emergency: '\uD83D\uDEA8',
  note: '\uD83D\uDCDD', contact: '\uD83D\uDC65', shopping_list: '\uD83D\uDED2', inventory: '\uD83D\uDCE6',
  chore: '\u2705', checklist: '\u2705', timer: '\u23F1\uFE0F', recipe: '\uD83C\uDF73',
  medication: '\uD83D\uDC8A', meal_planner: '\uD83C\uDF7D\uFE0F', external_link: '\uD83D\uDD17',
  home_manual: '\uD83D\uDCCB', house_rules: '\uD83D\uDEE1\uFE0F', voice_assistant: '\uD83C\uDFA4',
  merchant: '\uD83C\uDFEA', flash_sale: '\u26A1', coupon: '\uD83C\uDFAB',
};

function getModuleLabel(type: string) { return (QR_MODULE_LABELS as Record<string, string>)[type] || type; }
function getRoomEmoji(iconStr: string | null) { return iconStr ? (ROOM_EMOJIS[iconStr.toLowerCase()] || '\uD83C\uDFE0') : '\uD83C\uDFE0'; }
function getModuleEmoji(type: string) { return MODULE_EMOJIS[type] || '\uD83D\uDCCE'; }

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };
const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

// ── Voice Player Component ──
function VoicePlayer({ msg }: { msg: VoiceMsg }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    } else {
      audioRef.current.play().then(() => {
        intervalRef.current = setInterval(() => {
          if (audioRef.current) {
            const pct = audioRef.current.duration ? (audioRef.current.currentTime / audioRef.current.duration) * 100 : 0;
            setProgress(pct);
          }
        }, 200);
      }).catch(() => {});
    }
    setPlaying(!playing);
  };

  useEffect(() => {
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
    const el = audioRef.current;
    el?.addEventListener('ended', onEnded);
    return () => { el?.removeEventListener('ended', onEnded); if (intervalRef.current != null) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div className="flex items-center gap-3 bg-white border-2 border-black rounded-[12px] p-4">
      <audio ref={audioRef} src={msg.audioUrl} preload="metadata" />
      <button onClick={togglePlay} className="h-10 w-10 rounded-[8px] bg-white border-2 border-black flex items-center justify-center shrink-0 active:translate-y-[1px] transition-all shadow-[2px_2px_0_rgba(0,0,0,0.08)]">
        <span className="text-base">{playing ? '⏸️' : '▶️'}</span>
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-medium text-black truncate">{msg.senderName}</p>
          <span className="text-[10px] text-black/40 shrink-0 ml-2">{msg.durationSec}s</span>
        </div>
        <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[#6D28D9]"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </div>
      <span className="text-[10px] text-black/40 shrink-0">
        {new Date(msg.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
      </span>
    </div>
  );
}

// ── Voice Recorder Component ──
function VoiceRecorder({ slug, onSent }: { slug: string; onSent: () => void }) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [senderName, setSenderName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunksRef.current.length > 0) setShowNameInput(true);
        else toast.error('Enregistrement vide');
      };
      mr.start();
      mediaRecorderRef.current = mr;
      startTimeRef.current = Date.now();
      setDuration(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
        if (elapsed >= 30) stopRecording();
      }, 200);
    } catch {
      toast.error('Accès au micro refusé');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    if (timerRef.current != null) clearInterval(timerRef.current);
    setRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current != null) clearInterval(timerRef.current);
    chunksRef.current = [];
    setRecording(false);
    setDuration(0);
    setShowNameInput(false);
  };

  const handleSend = async () => {
    if (chunksRef.current.length === 0) return;
    setUploading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      formData.append('senderName', senderName.trim() || 'Invité');
      formData.append('durationSec', String(duration));
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice`, { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      toast.success('Message vocal envoyé !');
      setShowNameInput(false); setDuration(0); setSenderName(''); chunksRef.current = [];
      onSent();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur d'envoi";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    return () => { if (timerRef.current != null) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="space-y-3">
      {recording && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border-2 border-red-300 rounded-[12px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-semibold text-red-600">Enregistrement en cours</span>
            </div>
            <span className="text-sm font-mono text-red-500">
              {String(Math.floor(duration / 60)).padStart(2, '0')}:{String(duration % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="h-1 rounded-full bg-red-100 overflow-hidden">
            <motion.div className="h-full rounded-full bg-red-500" animate={{ width: `${Math.min((duration / 30) * 100, 100)}%` }} />
          </div>
          <div className="flex gap-2">
            <QRTButton variant="secondary" onClick={cancelRecording} className="flex-1 !py-2.5 !text-sm">Annuler</QRTButton>
            <QRTButton variant="primary" onClick={stopRecording} className="flex-1 !py-2.5 !text-sm !bg-red-600 hover:!bg-red-700">Arrêter</QRTButton>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showNameInput && !recording && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-white border-2 border-black rounded-[12px] p-4 space-y-3 shadow-[4px_4px_0_rgba(0,0,0,0.08)]">
            <p className="text-sm font-semibold text-black">Votre message ({duration}s)</p>
            <input
              type="text" placeholder="Votre nom (optionnel)" maxLength={50}
              value={senderName} onChange={(e) => setSenderName(e.target.value)}
              className="w-full h-11 bg-gray-50 border-2 border-black rounded-[8px] p-3.5 text-sm text-black focus:border-[#6D28D9] focus:bg-white outline-none transition-all"
              autoFocus
            />
            <div className="flex gap-2">
              <QRTButton variant="secondary" onClick={() => { setShowNameInput(false); chunksRef.current = []; }} className="flex-1 !py-2.5 !text-sm">Annuler</QRTButton>
              <QRTButton variant="primary" onClick={handleSend} disabled={uploading} className="flex-1 !py-2.5 !text-sm">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {uploading ? 'Envoi...' : 'Envoyer'}
              </QRTButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!recording && !showNameInput && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={startRecording}
          className="w-full bg-white border-2 border-black rounded-[12px] p-4 flex items-center justify-center gap-3 shadow-[4px_4px_0_rgba(0,0,0,0.08)] active:translate-y-[2px] active:shadow-[2px_2px_0_rgba(0,0,0,0.08)] transition-all hover:bg-gray-50">
          <span className="text-3xl">🎙️</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-black">Laisser un message vocal</p>
            <p className="text-xs text-black/40">Appuyez pour enregistrer (max 30s)</p>
          </div>
        </motion.button>
      )}
    </div>
  );
}

// ── PIN Modal Component ──
function PinModal({
  title,
  onVerify,
  onCancel,
  verifying,
}: {
  title: string;
  onVerify: (pin: string) => void;
  onCancel: () => void;
  verifying: boolean;
}) {
  const [key, setKey] = useState(0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <QRTCard className="w-full max-w-sm">
          <div className="text-center mb-6">
            <span className="text-3xl">🔐</span>
            <h3 className="text-lg font-bold text-black mt-2">{title}</h3>
          </div>

          {verifying ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 text-[#6D28D9] animate-spin" />
            </div>
          ) : (
            <QRTNumericKeypad
              key={key}
              longueur={4}
              onComplete={onVerify}
            />
          )}

          <button
            onClick={() => { setKey((k) => k + 1); onCancel(); }}
            className="mt-6 text-black/40 hover:text-black/70 text-sm w-full text-center transition-colors"
          >
            Annuler
          </button>
        </QRTCard>
      </motion.div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Enhanced Guest Quick Access Cards
// ══════════════════════════════════════════════════════════════

// ── WiFi Card ──
function WifiQuickCard({ content }: { content: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const networkName = (content.network_name as string) || (content.ssid as string) || 'Non configuré';
  const password = (content.password as string) || '';
  const securityType = (content.security_type as string) || (content.security as string) || 'WPA';

  // Build WiFi QR string
  const escWifi = (s: string) => s.replace(/([\\;,:":\'])/g, '\\$1');
  const wifiQrStr = networkName && networkName !== 'Non configuré'
    ? (password
        ? `WIFI:T:${securityType.toUpperCase().includes('WEP') ? 'WEP' : 'WPA'};S:${escWifi(networkName)};P:${escWifi(password)};;`
        : `WIFI:T:nopass;S:${escWifi(networkName)};;`)
    : '';

  const copyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success('Mot de passe copié !');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier');
    }
  };

  return (
    <motion.div variants={itemVariants}>
      <QRTCard header={{ emoji: '📱', title: 'Wi-Fi' }}>
        <div className="space-y-3">
          {/* Scannable WiFi QR Code */}
          {wifiQrStr && (
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-xl border-2 border-black/10">
                <QRCodeSVG
                  value={wifiQrStr}
                  size={140}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                />
              </div>
            </div>
          )}
          <p className="text-base font-bold text-black truncate">{networkName}</p>
          {securityType && (
            <p className="text-[10px] text-black/40">{securityType}</p>
          )}

          {password && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-10 bg-gray-50 border-2 border-black rounded-[8px] flex items-center px-3 gap-2">
                <span className="text-sm font-mono text-black flex-1 truncate">
                  {showPw ? password : '•'.repeat(Math.min(password.length, 16))}
                </span>
                <button
                  onClick={() => setShowPw(s => !s)}
                  className="text-black/40 hover:text-black/70 transition-colors text-sm"
                >
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={copyPassword}
                className="h-10 px-3 bg-white border-2 border-black rounded-[8px] text-black text-xs font-bold flex items-center gap-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.08)] active:translate-y-[1px] active:shadow-none transition-all hover:bg-gray-50"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copié' : 'Copier'}
              </motion.button>
            </div>
          )}
        </div>
      </QRTCard>
    </motion.div>
  );
}

// ── Contact Card ──
function ContactQuickCard({ content }: { content: Record<string, unknown> }) {
  const phone = (content.phone as string) || (content.telephone as string) || '';
  const email = (content.email as string) || '';
  const name = (content.name as string) || (content.owner_name as string) || '';
  const contacts = content.contacts as { name: string; phone: string; relation?: string }[] | undefined;
  const firstContact = contacts?.[0];

  const displayPhone = phone || firstContact?.phone || '';
  const displayName = name || firstContact?.name || '';

  return (
    <motion.div variants={itemVariants}>
      <QRTCard header={{ emoji: '📞', title: 'Contact' }}>
        {displayName && <p className="text-sm font-bold text-black truncate">{displayName}</p>}
        {displayPhone && (
          <a
            href={`tel:${displayPhone}`}
            className="inline-flex items-center gap-1.5 mt-1.5 text-sm text-black font-medium hover:text-[#6D28D9] transition-colors"
          >
            📞 {displayPhone}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="block mt-1 text-xs text-black/50 truncate hover:text-black/70 transition-colors"
          >
            {email}
          </a>
        )}
      </QRTCard>
    </motion.div>
  );
}

// ── Messages Quick Card ──
function MessagesQuickCard({
  count,
  latestSender,
  latestDuration,
  onTap,
}: {
  count: number;
  latestSender: string | null;
  latestDuration: number | null;
  onTap: () => void;
}) {
  return (
    <motion.div variants={itemVariants}>
      <motion.button whileTap={{ scale: 0.97 }} onClick={onTap} className="w-full text-left">
        <QRTCard header={{ emoji: '💬', title: 'Messages', badge: count > 0 ? String(count) : undefined }}>
          <p className="text-sm font-bold text-black">
            {count > 0 ? `${count} message${count > 1 ? 's' : ''}` : 'Aucun message'}
          </p>
          {latestSender && (
            <p className="text-xs text-black/40 mt-0.5 truncate">
              {latestSender}{latestDuration ? ` · ${latestDuration}s` : ''}
            </p>
          )}
          {count > 0 && (
            <div className="flex items-center justify-end mt-3 gap-1 text-black/50">
              <span className="text-[11px]">Écouter →</span>
            </div>
          )}
        </QRTCard>
      </motion.button>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// NEW: Inline Display Components for Guest View
// ══════════════════════════════════════════════════════════════

// ── Rules Inline Card (replaces RulesQuickCard + RulesDetailView) ──
function RulesInlineCard({ content }: { content: Record<string, unknown> }) {
  const rules = (content.rules as string[]) || [];
  const text = (content.text as string) || '';
  const description = (content.description as string) || '';

  return (
    <motion.div variants={itemVariants}>
      <QRTCard header={{ emoji: '📜', title: 'Règles' }}>
        {rules.length > 0 ? (
          <ul className="space-y-2.5">
            {rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="h-5 min-w-5 rounded-full bg-[#6D28D9] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-black leading-relaxed flex-1">{rule}</p>
              </li>
            ))}
          </ul>
        ) : text || description ? (
          <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">
            {text || description}
          </p>
        ) : (
          <p className="text-sm text-black/40">Aucune règle définie</p>
        )}
      </QRTCard>
    </motion.div>
  );
}

// ── Emergency Inline Card ──
function EmergencyInlineCard({ content }: { content: Record<string, unknown> }) {
  const phone = (content.phone as string) || (content.emergency_phone as string) || '112';
  const hospital = (content.nearest_hospital as string) || '';
  const pharmacy = (content.pharmacy as string) || '';
  const contactName = (content.contact_name as string) || (content.name as string) || '';
  const info = (content.info as string) || (content.instructions as string) || '';
  const contacts = content.contacts as { name: string; phone: string; relation?: string }[] | undefined;

  return (
    <motion.div variants={itemVariants} className="space-y-2">
      <QRTCard className="!border-red-300">
        <div className="text-center">
          <span className="text-3xl">🚨</span>
          <p className="text-base font-bold text-red-600 mt-1.5">Urgences</p>
        </div>
      </QRTCard>

      <a href={`tel:${phone}`} className="block">
        <QRTCard className="!bg-red-50 !border-red-400 cursor-pointer hover:!bg-red-100 transition-colors">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-100 border-2 border-red-400 flex items-center justify-center">
              <Phone className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-[10px] text-red-400 font-semibold uppercase">Appeler</p>
              <p className="text-sm font-bold text-red-700">{contactName || phone}</p>
            </div>
          </div>
        </QRTCard>
      </a>

      {contacts && contacts.length > 0 && (
        contacts.map((c, i) => (
          <a key={i} href={`tel:${c.phone}`} className="block">
            <QRTCard className="!bg-red-50 !border-red-300 cursor-pointer hover:!bg-red-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center">
                  <Phone className="h-4 w-4 text-red-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-black truncate">{c.name}</p>
                  <p className="text-xs text-red-600">{c.phone}{c.relation ? ` · ${c.relation}` : ''}</p>
                </div>
              </div>
            </QRTCard>
          </a>
        ))
      )}

      {hospital && (
        <QRTCard header={{ emoji: '🏥', title: 'Hôpital le plus proche' }}>
          <p className="text-sm text-black">{hospital}</p>
        </QRTCard>
      )}
      {pharmacy && (
        <QRTCard header={{ emoji: '💊', title: 'Pharmacie' }}>
          <p className="text-sm text-black">{pharmacy}</p>
        </QRTCard>
      )}
      {info && (
        <QRTCard>
          <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">{info}</p>
        </QRTCard>
      )}
    </motion.div>
  );
}

// ── Note Inline Card ──
function NoteInlineCard({ content }: { content: Record<string, unknown> }) {
  const text = (content.text as string) || (content.note as string) || (content.description as string) || '';
  const title = (content.title as string) || '';

  return (
    <motion.div variants={itemVariants}>
      <QRTCard header={{ emoji: '📝', title: title || 'Note' }}>
        <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">{text || 'Aucun contenu'}</p>
      </QRTCard>
    </motion.div>
  );
}

// ── Guestbook Inline Card ──
function GuestbookInlineCard({ content }: { content: Record<string, unknown> }) {
  const text = (content.text as string) || (content.note as string) || (content.description as string) || '';
  const title = (content.title as string) || '';
  const welcome = (content.welcome_message as string) || (content.welcome as string) || '';

  return (
    <motion.div variants={itemVariants}>
      <QRTCard header={{ emoji: '📖', title: title || "Livre d'or" }}>
        {welcome && (
          <p className="text-sm font-medium text-[#6D28D9] mb-2 leading-relaxed">{welcome}</p>
        )}
        <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">{text || 'Aucun contenu'}</p>
      </QRTCard>
    </motion.div>
  );
}

// ── Shopping List Inline Card ──
function ShoppingListInlineCard({ content }: { content: Record<string, unknown> }) {
  const items = (content.items as string[]) || [];
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <motion.div variants={itemVariants}>
      <QRTCard header={{ emoji: '🛒', title: 'Liste de courses' }}>
        {items.length > 0 ? (
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i}>
                <button
                  onClick={() => toggle(i)}
                  className={`w-full text-left flex items-center gap-2.5 py-0.5 transition-colors`}
                >
                  <div className={`h-4.5 w-4.5 min-w-[18px] rounded-[4px] border-2 flex items-center justify-center transition-colors ${checked.has(i) ? 'bg-green-500 border-green-500' : 'border-black'}`}>
                    {checked.has(i) && <span className="text-white text-[10px]">✓</span>}
                  </div>
                  <span className={`text-sm ${checked.has(i) ? 'text-black/40 line-through' : 'text-black font-medium'}`}>{item}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-4">
            <span className="text-2xl">🛒</span>
            <p className="text-xs text-black/40 mt-1">Liste vide</p>
          </div>
        )}
      </QRTCard>
    </motion.div>
  );
}

// ── Recipe Inline Card ──
function RecipeInlineCard({ content }: { content: Record<string, unknown> }) {
  const title = (content.title as string) || 'Recette';
  const ingredients = (content.ingredients as string[]) || [];
  const steps = (content.steps as string[]) || [];
  const description = (content.description as string) || '';
  const prepTime = (content.prep_time as string) || '';
  const cookTime = (content.cook_time as string) || '';

  return (
    <motion.div variants={itemVariants} className="space-y-2">
      <QRTCard header={{ emoji: '🍳', title }}>
        {description && <p className="text-sm text-black/60 mb-2">{description}</p>}
        <div className="flex items-center gap-3 text-xs text-black/40">
          {prepTime && <span>⏱️ Préparation : {prepTime}</span>}
          {cookTime && <span>🔥 Cuisson : {cookTime}</span>}
        </div>
      </QRTCard>

      {ingredients.length > 0 && (
        <QRTCard>
          <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider mb-2">Ingrédients</p>
          <ul className="space-y-1.5">
            {ingredients.map((ing, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-black">
                <span className="text-[#6D28D9] mt-0.5">•</span>
                {ing}
              </li>
            ))}
          </ul>
        </QRTCard>
      )}

      {steps.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider px-1">Préparation</p>
          {steps.map((step, i) => (
            <QRTCard key={i} className="!p-3">
              <div className="flex items-start gap-2.5">
                <span className="h-5 min-w-5 rounded-full bg-[#6D28D9] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <p className="text-sm text-black leading-relaxed flex-1">{step}</p>
              </div>
            </QRTCard>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── External Link Inline Card ──
function ExternalLinkInlineCard({ content }: { content: Record<string, unknown> }) {
  const url = (content.url as string) || '';
  const title = (content.title as string) || (content.name as string) || 'Lien externe';
  const description = (content.description as string) || '';

  return (
    <motion.div variants={itemVariants}>
      <QRTCard header={{ emoji: '🔗', title }}>
        {description && <p className="text-sm text-black/60 mb-3">{description}</p>}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-11 bg-[#6D28D9] text-white font-bold text-sm rounded-[8px] border-2 border-black shadow-[3px_3px_0_rgba(0,0,0,0.15)] active:translate-y-[1px] active:shadow-none transition-all hover:bg-[#5B21B6]"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir le lien
          </a>
        )}
      </QRTCard>
    </motion.div>
  );
}

// ── Generic Inline Card (fallback for any other module type) ──
function GenericInlineCard({ qr }: { qr: QrCodeInfo }) {
  const label = getModuleLabel(qr.type);
  const emoji = getModuleEmoji(qr.type);
  const entries = Object.entries(qr.content).filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k));

  return (
    <motion.div variants={itemVariants}>
      <QRTCard header={{ emoji, title: qr.name || label }}>
        {entries.length > 0 ? (
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-[10px] text-black/40 font-semibold uppercase tracking-wider min-w-[80px] pt-0.5">{key}</span>
                <span className="text-sm text-black flex-1">
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-black/40">Aucun contenu configuré</p>
        )}
      </QRTCard>
    </motion.div>
  );
}

// ── Inline Module Renderer ──
function renderModuleInline(qr: QrCodeInfo) {
  switch (qr.type) {
    case 'wifi': return <WifiQuickCard content={qr.content} />;
    case 'house_rules': return <RulesInlineCard content={qr.content} />;
    case 'emergency': return <EmergencyInlineCard content={qr.content} />;
    case 'emergency_contacts': return <EmergencyInlineCard content={qr.content} />;
    case 'contact': return <ContactQuickCard content={qr.content} />;
    case 'note': return <NoteInlineCard content={qr.content} />;
    case 'guestbook': return <GuestbookInlineCard content={qr.content} />;
    case 'shopping_list': return <ShoppingListInlineCard content={qr.content} />;
    case 'recipe': return <RecipeInlineCard content={qr.content} />;
    case 'external_link': return <ExternalLinkInlineCard content={qr.content} />;
    default: return <GenericInlineCard qr={qr} />;
  }
}

// ── Room Inline Section (shows all modules with full content inline) ──
function RoomInlineSection({ room }: { room: RoomInfo }) {
  const emoji = getRoomEmoji(room.icon);

  // Filter out modules that are already shown in the quick-access area
  const QUICK_ACCESS_TYPES = ['wifi', 'house_rules', 'contact', 'emergency_contacts', 'emergency'];
  const modules = room.qrCodes.filter(qr => !QUICK_ACCESS_TYPES.includes(qr.type));

  if (modules.length === 0) return null;

  return (
    <motion.div variants={itemVariants} className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-sm">{emoji}</span>
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">{room.name}</h3>
        <span className="text-xs text-white/20">({modules.length})</span>
      </div>
      <div className="space-y-3">
        {modules.map((qr) => (
          <div key={qr.id}>{renderModuleInline(qr)}</div>
        ))}
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Family Dashboard Cards
// ══════════════════════════════════════════════════════════════

function FamilyRoomCard({ room, onTap }: { room: RoomInfo; gradientIndex: number; onTap: () => void }) {
  const emoji = getRoomEmoji(room.icon);

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onTap}
      className="w-full bg-white border-2 border-black rounded-[12px] p-4 text-left shadow-[4px_4px_0_rgba(0,0,0,0.08)] active:translate-y-[2px] active:shadow-[2px_2px_0_rgba(0,0,0,0.08)] transition-all hover:shadow-[2px_2px_0_rgba(0,0,0,0.08)] group"
    >
      <span className="text-2xl">{emoji}</span>
      <h3 className="text-base font-bold text-black truncate mt-2">{room.name}</h3>
      <p className="text-xs text-black/50 mt-0.5">
        {room.qrCodes.length} module{room.qrCodes.length !== 1 ? 's' : ''}
      </p>

      {room.qrCodes.some(qr => qr.isPrivate) && (
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-[6px] font-bold px-2 py-0.5">
          🔒 Privé
        </div>
      )}
    </motion.button>
  );
}

function FamilyActionCard({
  emoji,
  label,
  subtitle,
  badge,
  onTap,
}: {
  emoji: string;
  label: string;
  subtitle: string;
  badge?: string;
  onTap: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onTap}
      className="w-full bg-white border-2 border-black rounded-[12px] p-4 text-left shadow-[4px_4px_0_rgba(0,0,0,0.08)] active:translate-y-[2px] active:shadow-[2px_2px_0_rgba(0,0,0,0.08)] transition-all hover:shadow-[2px_2px_0_rgba(0,0,0,0.08)]"
    >
      <span className="text-2xl">{emoji}</span>
      <h3 className="text-base font-bold text-black truncate mt-2">{label}</h3>
      <p className="text-xs text-black/50 mt-0.5">{subtitle}</p>
      {badge && (
        <div className="mt-2 inline-flex items-center text-[10px] font-bold text-black/60 bg-gray-100 border border-gray-300 px-2 py-0.5 rounded-[6px]">
          {badge}
        </div>
      )}
    </motion.button>
  );
}

// ══════════════════════════════════════════════════════════════
// Room Detail View (Family sub-view)
// ══════════════════════════════════════════════════════════════

function RoomDetailView({ room, onBack }: { room: RoomInfo; onBack: () => void }) {
  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center gap-4">
        <QRTButton variant="secondary" onClick={onBack} className="!w-11 !h-11 !p-0 !rounded-[8px]">←</QRTButton>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{getRoomEmoji(room.icon)}</span>
            <h2 className="text-xl font-bold text-white truncate">{room.name}</h2>
          </div>
          <p className="text-sm text-white/40 mt-0.5 ml-8">
            {room.qrCodes.length} module{room.qrCodes.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {room.qrCodes.length > 0 ? (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3">
          {room.qrCodes.map((qr) => (
            <motion.div key={qr.id} variants={itemVariants}>
              {renderModuleInline(qr)}
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="text-center py-16">
          <span className="text-4xl">📋</span>
          <p className="text-sm text-white/60 mt-3">Aucun module dans cette pièce</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Voice Detail View (Family sub-view)
// ══════════════════════════════════════════════════════════════

function VoiceDetailView({
  slug,
  voiceMsgs,
  onBack,
  onRefresh,
}: {
  slug: string;
  voiceMsgs: VoiceMsg[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center gap-4">
        <QRTButton variant="secondary" onClick={onBack} className="!w-11 !h-11 !p-0 !rounded-[8px]">←</QRTButton>
        <div>
          <h2 className="text-xl font-bold text-white">Répondeur</h2>
          <p className="text-sm text-white/40 mt-0.5">
            {voiceMsgs.length} message{voiceMsgs.length !== 1 ? 's' : ''} vocal{voiceMsgs.length !== 1 ? 'aux' : ''}
          </p>
        </div>
      </div>

      <VoiceRecorder slug={slug} onSent={onRefresh} />

      {voiceMsgs.length > 0 ? (
        <motion.div
          variants={containerVariants} initial="hidden" animate="visible"
          className="space-y-2.5 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1"
        >
          {voiceMsgs.map((vm) => (
            <motion.div key={vm.id} variants={itemVariants}>
              <VoicePlayer msg={vm} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="text-center py-12">
          <span className="text-4xl">🎙️</span>
          <p className="text-sm text-white/60 mt-3">Aucun message vocal</p>
          <p className="text-xs text-white/40 mt-1">Enregistrez le premier message !</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════

export function HubPageContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<HubView>('mode-select');
  const [pinModalFor, setPinModalFor] = useState<PinModalFor>(null);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [voiceMsgs, setVoiceMsgs] = useState<VoiceMsg[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [slideDirection, setSlideDirection] = useState(0);

  const fetchHub = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Hub non trouvé');
      setData(json);
      setVoiceMsgs(json.voiceMessages || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const refreshVoice = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/voice?limit=10`);
      if (res.ok) { const json = await res.json(); setVoiceMsgs(json.messages || []); }
    } catch { /* silent */ }
  }, [slug]);

  useEffect(() => { fetchHub(); }, [fetchHub]);
  useEffect(() => { if (view === 'guest' || view === 'family') refreshVoice(); }, [view, refreshVoice]);

  // Navigation helpers
  const parentViewRef = useRef<'guest' | 'family'>('guest');

  const goBack = useCallback(() => {
    setSlideDirection(-1);
    if (view === 'room-detail' || view === 'voice-detail') {
      setView(parentViewRef.current);
      setSelectedRoomId(null);
    } else {
      setView('mode-select');
    }
  }, [view]);

  const goToFamilyRoom = useCallback((roomId: string) => {
    setSlideDirection(1);
    setSelectedRoomId(roomId);
    setView('room-detail');
  }, []);

  const goToVoiceDetail = useCallback(() => {
    setSlideDirection(1);
    parentViewRef.current = view === 'family' ? 'family' : 'guest';
    setView('voice-detail');
  }, [view]);

  const goToGuest = useCallback(() => {
    setSlideDirection(1);
    parentViewRef.current = 'guest';
    setView('guest');
  }, []);

  // PIN verification
  const doVerifyPin = useCallback((pinVal: string) => {
    setPinVerifying(true);
    fetch(`/api/public/hub/${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinVal }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) {
          toast.error(j.error || 'PIN incorrect');
          setPinModalFor(null);
        } else {
          setPinModalFor(null);
          if (pinModalFor === 'family') {
            setSlideDirection(1);
            parentViewRef.current = 'family';
            setView('family');
          } else if (pinModalFor === 'settings') {
            toast.success('Bienvenue ! Redirection vers le dashboard...');
            setTimeout(() => { window.location.href = '/dashboard'; }, 1000);
          }
        }
      })
      .catch(() => { toast.error('Erreur réseau'); setPinModalFor(null); })
      .finally(() => setPinVerifying(false));
  }, [slug, pinModalFor]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
          <QRTCard className="!p-6">
            <span className="text-4xl">🏠</span>
          </QRTCard>
          <p className="text-sm text-white/60">Chargement du Hub...</p>
        </motion.div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center p-4">
        <QRTCard className="w-full max-w-sm">
          <div className="text-center">
            <span className="text-5xl">❌</span>
            <h1 className="text-xl font-bold text-black mt-3 mb-2">Hub introuvable</h1>
            <p className="text-sm text-black/50 mb-6">{error || "Ce Hub n'existe pas ou a été désactivé."}</p>
            <div className="h-10 bg-gray-50 border-2 border-black rounded-[8px] flex items-center justify-center gap-2 text-sm text-black/60">
              <span>📱</span><span className="font-mono text-xs">{slug}</span>
            </div>
          </div>
        </QRTCard>
      </div>
    );
  }

  // Extract quick-access modules from guest rooms
  const allGuestQrs = data.guestRooms.flatMap(r => r.qrCodes);
  const wifiQr = allGuestQrs.find(qr => qr.type === 'wifi');
  const rulesQr = allGuestQrs.find(qr => qr.type === 'house_rules');
  const contactQr = allGuestQrs.find(qr => qr.type === 'contact' || qr.type === 'emergency_contacts');
  const emergencyQr = allGuestQrs.find(qr => qr.type === 'emergency' || qr.type === 'emergency_contacts');

  // Get the selected room for detail view
  const selectedRoom = selectedRoomId
    ? data.familyRooms.find(r => r.id === selectedRoomId) || null
    : null;

  const totalGuestModules = data.guestRooms.reduce((s, r) => s + r.qrCodes.length, 0);
  const totalFamilyModules = data.familyRooms.reduce((s, r) => s + r.qrCodes.length, 0);

  // Rooms for guest view (excluding quick-access modules from the grid display)
  const QUICK_ACCESS_TYPES = ['wifi', 'house_rules', 'contact', 'emergency_contacts', 'emergency'];
  const guestModuleRooms = data.guestRooms.filter(r =>
    r.qrCodes.some(qr => !QUICK_ACCESS_TYPES.includes(qr.type))
  );

  return (
    <>
      <div className="min-h-screen bg-[#8B5CF6]">
        <div className="min-h-screen flex flex-col relative z-10">
          {/* Header */}
          <header className="w-full px-5 sm:px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2">
            <div className="max-w-lg lg:max-w-xl mx-auto">
              <div className="flex items-center justify-between">
                {view !== 'mode-select' ? (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={goBack}
                    className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
                  >
                    ← Retour
                  </motion.button>
                ) : (
                  <h1 className="text-2xl font-bold text-white">
                    {data.home.name}
                  </h1>
                )}

                <div className="flex items-center gap-2">
                  {view === 'guest' && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-[10px] font-bold bg-white text-[#6D28D9] px-2.5 py-1 rounded-[6px] border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.08)]"
                    >
                      INVITÉ
                    </motion.span>
                  )}
                  {(view === 'family' || view === 'room-detail' || view === 'voice-detail') && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-[10px] font-bold bg-[#6D28D9] text-white px-2.5 py-1 rounded-[6px] border-2 border-black shadow-[2px_2px_0_rgba(0,0,0,0.08)]"
                    >
                      FAMILLE
                    </motion.span>
                  )}

                  {view === 'mode-select' && data.home.hasPin && (
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setPinModalFor('settings')}
                      className="h-10 w-10 bg-white border-2 border-black rounded-[8px] flex items-center justify-center shadow-[2px_2px_0_rgba(0,0,0,0.08)] active:translate-y-[1px] active:shadow-none transition-all"
                    >
                      ⚙️
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 flex flex-col px-5 sm:px-6 py-5 sm:py-6 max-w-lg lg:max-w-xl mx-auto w-full">
            <AnimatePresence mode="wait" custom={slideDirection}>

              {/* ══════════ MODE SELECT ══════════ */}
              {view === 'mode-select' && (
                <motion.div
                  key="mode-select"
                  custom={slideDirection}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="flex-1 flex flex-col gap-6"
                >
                  {/* Home info */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-center space-y-2"
                  >
                    {data.ownerName && (
                      <p className="text-sm text-white/50">
                        Propriété de{' '}
                        <span className="text-white/80 font-medium">{data.ownerName}</span>
                      </p>
                    )}
                    <div className="flex items-center justify-center gap-4 text-xs text-white/30">
                      <span className="flex items-center gap-1">🏠 {data.guestRooms.length} pièces</span>
                      <span className="flex items-center gap-1">📱 {totalGuestModules} modules</span>
                    </div>
                  </motion.div>

                  {/* Two big mode buttons */}
                  <div className="flex-1 flex flex-col gap-4">
                    {/* INVITÉ button */}
                    <motion.button
                      onClick={goToGuest}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98, translateY: 2 }}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, type: 'spring' }}
                      className="w-full bg-white border-2 border-black rounded-[12px] p-6 shadow-[4px_4px_0_rgba(0,0,0,0.08)] hover:shadow-[2px_2px_0_rgba(0,0,0,0.08)] transition-all text-left"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-4xl">👤</span>
                        <div>
                          <h2 className="text-2xl font-bold text-black">Mode Invité</h2>
                          <p className="text-black/50 text-sm">Wi-Fi, messages, infos pratiques</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 pl-14">
                        <span className="text-[11px] bg-gray-100 border border-gray-300 rounded-[6px] font-bold px-2.5 py-0.5">{totalGuestModules} modules</span>
                        <span className="text-[11px] bg-gray-100 border border-gray-300 rounded-[6px] font-bold px-2.5 py-0.5">Sans code</span>
                      </div>
                    </motion.button>

                    {/* FAMILLE button */}
                    {data.home.hasPin && (
                      <motion.button
                        onClick={() => setPinModalFor('family')}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98, translateY: 2 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, type: 'spring' }}
                        className="w-full bg-[#6D28D9] border-2 border-black rounded-[12px] p-6 shadow-[4px_4px_0_rgba(0,0,0,0.15)] hover:shadow-[2px_2px_0_rgba(0,0,0,0.15)] transition-all text-left"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-4xl">👨‍👩‍👧‍👦</span>
                          <div>
                            <h2 className="text-2xl font-bold text-white">Mode Famille</h2>
                            <p className="text-white/80 text-sm">Accès complet à votre maison</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 pl-14">
                          <span className="text-[11px] bg-white/15 rounded-[6px] font-bold px-2.5 py-0.5 text-white">{totalFamilyModules} modules</span>
                          <span className="text-[11px] bg-white/15 rounded-[6px] font-bold px-2.5 py-0.5 text-white flex items-center gap-1">
                            🔒 PIN requis
                          </span>
                        </div>
                      </motion.button>
                    )}
                  </div>

                  {/* Recent voice messages preview */}
                  {voiceMsgs.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center gap-2 text-sm text-white/50">
                        <span>💬</span>
                        <span>{voiceMsgs.length} message{voiceMsgs.length > 1 ? 's' : ''} vocal{voiceMsgs.length > 1 ? 'aux' : ''}</span>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin">
                        {voiceMsgs.slice(0, 3).map((vm) => (
                          <QRTCard key={vm.id} className="!p-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">🔊</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-black truncate">{vm.senderName}</p>
                                <p className="text-xs text-black/40">{vm.durationSec}s</p>
                              </div>
                            </div>
                          </QRTCard>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* ══════════ GUEST VIEW (ALL INLINE) ══════════ */}
              {view === 'guest' && (
                <motion.div
                  key="guest"
                  custom={slideDirection}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="space-y-6 pb-4"
                >
                  {/* 1. Home name + address subtitle */}
                  <div>
                    <h2 className="text-xl font-bold text-white">{data.home.name}</h2>
                    {data.home.address && (
                      <p className="text-sm text-white/50 mt-1">{data.home.address}</p>
                    )}
                  </div>

                  {/* 2. WiFi full card (if exists) */}
                  {wifiQr && (
                    <motion.div variants={itemVariants} initial="hidden" animate="visible">
                      <WifiQuickCard content={wifiQr.content} />
                    </motion.div>
                  )}

                  {/* 3. Quick access 2-col grid: Messages, Emergency, Rules, Contact */}
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-2 gap-3"
                  >
                    <MessagesQuickCard
                      count={voiceMsgs.length}
                      latestSender={voiceMsgs[0]?.senderName ?? null}
                      latestDuration={voiceMsgs[0]?.durationSec ?? null}
                      onTap={goToVoiceDetail}
                    />

                    {emergencyQr && (
                      <motion.div variants={itemVariants}>
                        <motion.button whileTap={{ scale: 0.97 }} className="w-full text-left">
                          <QRTCard header={{ emoji: '🚨', title: 'Urgences' }}>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-red-500" />
                              <p className="text-sm font-bold text-red-600">
                                {(emergencyQr.content.emergency_phone as string) || (emergencyQr.content.phone as string) || '112'}
                              </p>
                            </div>
                            <p className="text-xs text-black/40 mt-1">Appeler en cas d'urgence</p>
                          </QRTCard>
                        </motion.button>
                      </motion.div>
                    )}

                    {rulesQr && <RulesInlineCard content={rulesQr.content} />}
                    {contactQr && <ContactQuickCard content={contactQr.content} />}
                  </motion.div>

                  {/* 4. Emergency full inline content (if exists, shown full-width below grid) */}
                  {emergencyQr && (
                    <motion.div variants={itemVariants} initial="hidden" animate="visible">
                      <EmergencyInlineCard content={emergencyQr.content} />
                    </motion.div>
                  )}

                  {/* 5. Voice recorder */}
                  <div className="space-y-3">
                    <VoiceRecorder slug={slug} onSent={refreshVoice} />
                  </div>

                  {/* 6. Voice messages list */}
                  {voiceMsgs.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
                        <span>🔊</span> Messages vocaux
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                        {voiceMsgs.map((vm) => <VoicePlayer key={vm.id} msg={vm} />)}
                      </div>
                    </div>
                  )}

                  {/* 7. All remaining modules by room section (full inline content) */}
                  {guestModuleRooms.length > 0 && (
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
                        <span>📱</span> Modules par pièce
                      </div>
                      {guestModuleRooms.map((room) => (
                        <RoomInlineSection key={room.id} room={room} />
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* ══════════ FAMILY VIEW ══════════ */}
              {view === 'family' && (
                <motion.div
                  key="family"
                  custom={slideDirection}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="space-y-6 pb-4"
                >
                  {/* Title */}
                  <div>
                    <h2 className="text-xl font-bold text-white">{data.home.name}</h2>
                    <p className="text-sm text-white/50 mt-1">
                      Mode Famille{data.home.address && ` · ${data.home.address}`}
                    </p>
                  </div>

                  {/* 6-card Dashboard Grid */}
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-2 gap-3"
                  >
                    {/* Room cards (up to 4) */}
                    {data.familyRooms.slice(0, 4).map((room, i) => (
                      <motion.div key={room.id} variants={itemVariants}>
                        <FamilyRoomCard
                          room={room}
                          gradientIndex={i}
                          onTap={() => goToFamilyRoom(room.id)}
                        />
                      </motion.div>
                    ))}

                    {/* More rooms indicator */}
                    {data.familyRooms.length > 4 && (
                      <motion.div variants={itemVariants}>
                        <FamilyActionCard
                          emoji="🏠"
                          label="Plus de pièces"
                          subtitle={`${data.familyRooms.length - 4} autre${data.familyRooms.length - 4 > 1 ? 's' : ''}`}
                          badge={`${data.familyRooms.length} pièces au total`}
                          onTap={() => {
                            toast.info('Utilisez l\'application complète pour voir toutes les pièces');
                          }}
                        />
                      </motion.div>
                    )}

                    {/* Répondeur Card */}
                    <motion.div variants={itemVariants}>
                      <FamilyActionCard
                        emoji="📞"
                        label="Répondeur"
                        subtitle={voiceMsgs.length > 0
                          ? `${voiceMsgs.length} message${voiceMsgs.length > 1 ? 's' : ''}`
                          : 'Aucun message'
                        }
                        badge={voiceMsgs.length > 0 ? `${voiceMsgs.length} nouveau${voiceMsgs.length > 1 ? 'x' : ''}` : undefined}
                        onTap={goToVoiceDetail}
                      />
                    </motion.div>

                    {/* Paramètres Card */}
                    <motion.div variants={itemVariants}>
                      <FamilyActionCard
                        emoji="⚙️"
                        label="Paramètres"
                        subtitle="Accès au tableau de bord"
                        badge="Sécurisé"
                        onTap={() => {
                          toast.info('Connectez-vous sur qrdomotik.roomscan.pro pour gérer votre maison');
                        }}
                      />
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}

              {/* ══════════ ROOM DETAIL VIEW ══════════ */}
              {view === 'room-detail' && selectedRoom && (
                <motion.div
                  key={`room-${selectedRoom.id}`}
                  custom={slideDirection}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <RoomDetailView room={selectedRoom} onBack={goBack} />
                </motion.div>
              )}

              {/* ══════════ VOICE DETAIL VIEW ══════════ */}
              {view === 'voice-detail' && (
                <motion.div
                  key="voice-detail"
                  custom={slideDirection}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <VoiceDetailView
                    slug={slug}
                    voiceMsgs={voiceMsgs}
                    onBack={goBack}
                    onRefresh={refreshVoice}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Footer */}
          <div className="mt-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
            <img src="/logo-ordomotik.png" alt="ORDOMOTIK" className="h-6 w-auto object-contain rounded opacity-30 mx-auto mb-1" />
            <p className="text-[10px] text-white/25">
              qrdomotik.roomscan.pro
            </p>
          </div>
        </div>
      </div>

      {/* ══════════ PIN MODAL ══════════ */}
      <AnimatePresence>
        {pinModalFor && (
          <PinModal
            title={pinModalFor === 'family' ? 'Entrez votre code PIN' : 'Accès Paramètres'}
            onVerify={doVerifyPin}
            onCancel={() => setPinModalFor(null)}
            verifying={pinVerifying}
          />
        )}
      </AnimatePresence>
    </>
  );
}

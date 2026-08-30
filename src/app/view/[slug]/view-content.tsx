'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Send, Copy, Check, Phone, Mail, ExternalLink, ArrowLeft, Home } from 'lucide-react';
import { toast } from 'sonner';
import { QRTCard, QRTButton } from '@/components/qrtags';
import { QR_MODULE_LABELS } from '@/types/database';

// ── Types ──
interface QrCodeData {
  id: string;
  name: string;
  type: string;
  publicSlug: string;
  isActive: boolean;
  homeName: string | null;
}

interface VoiceMsg {
  id: string;
  senderName: string;
  senderType: string;
  audioUrl: string;
  durationSec: number;
  createdAt: string;
}

const MODULE_EMOJIS: Record<string, string> = {
  wifi: '\uD83D\uDCF1', guestbook: '\uD83D\uDCD6', doorbell: '\uD83D\uDD14', emergency: '\uD83D\uDEA8',
  note: '\uD83D\uDCDD', contact: '\uD83D\uDC65', shopping_list: '\uD83D\uDED2', inventory: '\uD83D\uDCE6',
  chore: '\u2705', checklist: '\u2705', timer: '\u23F1\uFE0F', recipe: '\uD83C\uDF73',
  medication: '\uD83D\uDC8A', meal_planner: '\uD83C\uDF7D\uFE0F', external_link: '\uD83D\uDD17',
  home_manual: '\uD83D\uDCCB', house_rules: '\uD83D\uDEE1\uFE0F', voice_assistant: '\uD83C\uDFA4',
  emergency_contacts: '\uD83D\uDCE0',
};

function getModuleEmoji(type: string) { return MODULE_EMOJIS[type] || '\uD83D\uDCE6'; }
function getModuleLabel(type: string) { return (QR_MODULE_LABELS as Record<string, string>)[type] || type; }

const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

// ══════════════════════════════════════════════════════════════
// WiFi QR Code Generator
// ══════════════════════════════════════════════════════════════
function buildWifiQrString(ssid: string, password: string, security: string = 'WPA'): string {
  const esc = (s: string) => s.replace(/([\\;,:"'])/g, '\\$1');
  if (!password) return `WIFI:T:nopass;S:${esc(ssid)};;`;
  const t = security.toUpperCase().includes('WEP') ? 'WEP' : 'WPA';
  return `WIFI:T:${t};S:${esc(ssid)};P:${esc(password)};;`;
}

// ══════════════════════════════════════════════════════════════
// WiFi View
// ══════════════════════════════════════════════════════════════
function WifiView({ content }: { content: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const ssid = (content.network_name as string) || (content.ssid as string) || '';
  const password = (content.password as string) || '';
  const security = (content.security_type as string) || (content.security as string) || 'WPA2';
  const qrString = ssid ? buildWifiQrString(ssid, password, security) : '';

  const copyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success('Mot de passe copi\u00e9 !');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier');
    }
  };

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-4">
      {/* QR Code scannable */}
      {qrString && (
        <QRTCard className="!p-6 flex flex-col items-center">
          <p className="text-xs text-black/40 font-semibold uppercase tracking-wider mb-3">Scannez pour vous connecter</p>
          <div className="bg-white p-4 rounded-xl border-2 border-black/10">
            <QRCodeSVG
              value={qrString}
              size={200}
              level="M"
              includeMargin={false}
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>
          <p className="text-[10px] text-black/30 mt-3">Utilisez l'appareil photo de votre t\u00e9l\u00e9phone</p>
        </QRTCard>
      )}

      {/* Network info */}
      <QRTCard header={{ emoji: '\uD83D\uDCF1', title: 'R\u00e9seau Wi-Fi' }}>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider">Nom du r\u00e9seau</p>
            <p className="text-base font-bold text-black mt-1 truncate">{ssid || 'Non configur\u00e9'}</p>
          </div>
          {security && (
            <div>
              <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider">S\u00e9curit\u00e9</p>
              <p className="text-sm text-black mt-1">{security}</p>
            </div>
          )}
          {password && (
            <div>
              <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider">Mot de passe</p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-11 bg-gray-50 border-2 border-black rounded-[8px] flex items-center px-3">
                  <span className="text-sm font-mono text-black flex-1 truncate">
                    {showPw ? password : '\u2022'.repeat(Math.min(password.length, 20))}
                  </span>
                  <button
                    onClick={() => setShowPw(s => !s)}
                    className="text-black/40 hover:text-black/70 transition-colors text-sm ml-2"
                  >
                    {showPw ? '\uD83D\uDE48' : '\uD83D\uDC41\uFE0F'}
                  </button>
                </div>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={copyPassword}
                  className="h-11 px-4 bg-white border-2 border-black rounded-[8px] text-black text-xs font-bold flex items-center gap-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.08)] active:translate-y-[1px] active:shadow-none transition-all hover:bg-gray-50"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copi\u00e9' : 'Copier'}
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </QRTCard>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// House Rules View
// ══════════════════════════════════════════════════════════════
function RulesView({ content }: { content: Record<string, unknown> }) {
  const rules = (content.rules as string[]) || [];
  const text = (content.text as string) || '';
  const description = (content.description as string) || '';

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-3">
      {content.title && (
        <QRTCard>
          <p className="text-base font-bold text-black">{content.title as string}</p>
        </QRTCard>
      )}
      {rules.length > 0 ? (
        rules.map((rule, i) => (
          <motion.div key={i} variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: i * 0.05 }}>
            <QRTCard>
              <div className="flex items-start gap-3">
                <span className="h-6 min-w-6 rounded-full bg-[#6D28D9] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-black leading-relaxed flex-1">{rule}</p>
              </div>
            </QRTCard>
          </motion.div>
        ))
      ) : (text || description) ? (
        <QRTCard>
          <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">{text || description}</p>
        </QRTCard>
      ) : (
        <QRTCard>
          <div className="text-center py-6">
            <span className="text-3xl">\uD83D\uDCDC</span>
            <p className="text-sm text-black/40 mt-2">Aucune r\u00e8gle d\u00e9finie</p>
          </div>
        </QRTCard>
      )}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Contact View
// ══════════════════════════════════════════════════════════════
function ContactView({ content }: { content: Record<string, unknown> }) {
  const phone = (content.phone as string) || (content.telephone as string) || '';
  const email = (content.email as string) || '';
  const name = (content.name as string) || (content.owner_name as string) || '';
  const contacts = content.contacts as { name: string; phone: string; relation?: string }[] | undefined;

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-3">
      {/* Main contact */}
      {(name || phone || email) && (
        <QRTCard header={{ emoji: '\uD83D\uDCDE', title: name || 'Contact' }}>
          <div className="space-y-2">
            {phone && (
              <a
                href={`tel:${phone}`}
                className="flex items-center gap-3 p-3 bg-gray-50 border-2 border-black rounded-[8px] text-black hover:bg-gray-100 transition-colors"
              >
                <Phone className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">{phone}</span>
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-3 p-3 bg-gray-50 border-2 border-black rounded-[8px] text-black hover:bg-gray-100 transition-colors"
              >
                <Mail className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium truncate">{email}</span>
              </a>
            )}
          </div>
        </QRTCard>
      )}

      {/* Multiple contacts */}
      {contacts && contacts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/50 font-semibold uppercase tracking-wider px-1">Contacts</p>
          {contacts.map((c, i) => (
            <QRTCard key={i}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-black">{c.name}</p>
                  {c.relation && <p className="text-[10px] text-black/40">{c.relation}</p>}
                </div>
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="h-10 px-3 bg-white border-2 border-black rounded-[8px] text-black text-xs font-bold flex items-center gap-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.08)] active:translate-y-[1px] transition-all hover:bg-gray-50"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Appeler
                  </a>
                )}
              </div>
            </QRTCard>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Emergency View
// ══════════════════════════════════════════════════════════════
function EmergencyView({ content }: { content: Record<string, unknown> }) {
  const phone = (content.phone as string) || (content.emergency_phone as string) || '112';
  const hospital = (content.nearest_hospital as string) || '';
  const pharmacy = (content.pharmacy as string) || '';
  const contactName = (content.contact_name as string) || (content.name as string) || '';
  const info = (content.info as string) || (content.instructions as string) || '';

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-3">
      <QRTCard className="!border-red-300">
        <div className="text-center">
          <span className="text-4xl">\uD83D\uDEA8</span>
          <p className="text-lg font-bold text-red-600 mt-2">Urgences</p>
        </div>
      </QRTCard>

      <a
        href={`tel:${phone}`}
        className="block"
      >
        <QRTCard className="!bg-red-50 !border-red-400 cursor-pointer hover:!bg-red-100 transition-colors">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-red-100 border-2 border-red-400 flex items-center justify-center">
              <Phone className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-[10px] text-red-400 font-semibold uppercase">Appeler</p>
              <p className="text-lg font-bold text-red-700">{contactName || phone}</p>
            </div>
          </div>
        </QRTCard>
      </a>

      {hospital && (
        <QRTCard header={{ emoji: '\uD83C\uDFE5', title: 'H\u00f4pital le plus proche' }}>
          <p className="text-sm text-black">{hospital}</p>
        </QRTCard>
      )}
      {pharmacy && (
        <QRTCard header={{ emoji: '\uD83D\uDC8A', title: 'Pharmacie' }}>
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

// ══════════════════════════════════════════════════════════════
// Recipe View
// ══════════════════════════════════════════════════════════════
function RecipeView({ content }: { content: Record<string, unknown> }) {
  const title = (content.title as string) || 'Recette';
  const ingredients = (content.ingredients as string[]) || [];
  const steps = (content.steps as string[]) || [];

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-4">
      <QRTCard header={{ emoji: '\uD83C\uDF73', title }}>
        {content.description && (
          <p className="text-sm text-black/60 mb-3">{content.description as string}</p>
        )}
        {content.prep_time && (
          <p className="text-xs text-black/40">\u23F1\uFE0F Pr\u00e9paration : {content.prep_time as string}</p>
        )}
        {content.cook_time && (
          <p className="text-xs text-black/40">\uD83D\uDD25 Cuisson : {content.cook_time as string}</p>
        )}
      </QRTCard>

      {ingredients.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/50 font-semibold uppercase tracking-wider px-1">Ingr\u00e9dients</p>
          <QRTCard>
            <ul className="space-y-1.5">
              {ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-black">
                  <span className="text-[#6D28D9] mt-0.5">\u2022</span>
                  {ing}
                </li>
              ))}
            </ul>
          </QRTCard>
        </div>
      )}

      {steps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/50 font-semibold uppercase tracking-wider px-1">Pr\u00e9paration</p>
          {steps.map((step, i) => (
            <QRTCard key={i}>
              <div className="flex items-start gap-3">
                <span className="h-6 min-w-6 rounded-full bg-[#6D28D9] text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <p className="text-sm text-black leading-relaxed flex-1">{step}</p>
              </div>
            </QRTCard>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Note / Text View
// ══════════════════════════════════════════════════════════════
function NoteView({ content }: { content: Record<string, unknown> }) {
  const text = (content.text as string) || (content.note as string) || (content.description as string) || '';
  const title = (content.title as string) || '';

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible">
      <QRTCard>
        {title && <p className="text-base font-bold text-black mb-2">{title}</p>}
        <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">{text || 'Aucun contenu'}</p>
      </QRTCard>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Shopping List View
// ══════════════════════════════════════════════════════════════
function ShoppingListView({ content }: { content: Record<string, unknown> }) {
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
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-2">
      {items.length > 0 ? (
        items.map((item, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.98 }}
            onClick={() => toggle(i)}
            className={`w-full text-left bg-white border-2 rounded-[12px] p-3.5 flex items-center gap-3 shadow-[3px_3px_0_rgba(0,0,0,0.08)] active:translate-y-[1px] active:shadow-none transition-all ${checked.has(i) ? 'border-green-400 bg-green-50' : 'border-black'}`}
          >
            <div className={`h-5 w-5 rounded-[6px] border-2 flex items-center justify-center shrink-0 transition-colors ${checked.has(i) ? 'bg-green-500 border-green-500' : 'border-black'}`}>
              {checked.has(i) && <span className="text-white text-xs">\u2713</span>}
            </div>
            <span className={`text-sm ${checked.has(i) ? 'text-black/40 line-through' : 'text-black font-medium'}`}>{item}</span>
          </motion.button>
        ))
      ) : (
        <QRTCard>
          <div className="text-center py-6">
            <span className="text-3xl">\uD83D\uDED2</span>
            <p className="text-sm text-black/40 mt-2">Liste vide</p>
          </div>
        </QRTCard>
      )}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// External Link View
// ══════════════════════════════════════════════════════════════
function ExternalLinkView({ content }: { content: Record<string, unknown> }) {
  const url = (content.url as string) || '';
  const title = (content.title as string) || (content.name as string) || 'Lien externe';
  const description = (content.description as string) || '';

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-4">
      <QRTCard header={{ emoji: '\uD83D\uDD17', title }}>
        {description && <p className="text-sm text-black/60 mb-4">{description}</p>}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 bg-[#6D28D9] text-white font-bold text-sm rounded-[8px] border-2 border-black shadow-[3px_3px_0_rgba(0,0,0,0.15)] active:translate-y-[1px] active:shadow-none transition-all hover:bg-[#5B21B6]"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir le lien
          </a>
        )}
      </QRTCard>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Generic JSON View (fallback)
// ══════════════════════════════════════════════════════════════
function GenericView({ content, type }: { content: Record<string, unknown>; type: string }) {
  const entries = Object.entries(content).filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k));

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-3">
      <QRTCard header={{ emoji: getModuleEmoji(type), title: getModuleLabel(type) }}>
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
          <p className="text-sm text-black/40">Aucun contenu configur\u00e9</p>
        )}
      </QRTCard>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// Voice Player
// ══════════════════════════════════════════════════════════════
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
    <div className="flex items-center gap-3 bg-white border-2 border-black rounded-[12px] p-3">
      <audio ref={audioRef} src={msg.audioUrl} preload="metadata" />
      <button onClick={togglePlay} className="h-9 w-9 rounded-[8px] bg-white border-2 border-black flex items-center justify-center shrink-0 active:translate-y-[1px] transition-all shadow-[2px_2px_0_rgba(0,0,0,0.08)]">
        <span className="text-sm">{playing ? '\u23F8\uFE0F' : '\u25B6\uFE0F'}</span>
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium text-black truncate">{msg.senderName}</p>
          <span className="text-[10px] text-black/40 shrink-0 ml-2">{msg.durationSec}s</span>
        </div>
        <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
          <motion.div className="h-full rounded-full bg-[#6D28D9]" animate={{ width: `${progress}%` }} transition={{ duration: 0.2 }} />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Voice Recorder
// ══════════════════════════════════════════════════════════════
function VoiceRecorder({ homeId, onSent }: { homeId: string; onSent: () => void }) {
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
      toast.error('Acc\u00e8s au micro refus\u00e9');
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
      formData.append('senderName', senderName.trim() || 'Invit\u00e9');
      formData.append('durationSec', String(duration));
      const res = await fetch(`/api/public/qr-voice/${encodeURIComponent(homeId)}`, { method: 'POST', body: formData });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || 'Erreur');
      }
      toast.success('Message vocal envoy\u00e9 !');
      setShowNameInput(false);
      setDuration(0);
      setSenderName('');
      chunksRef.current = [];
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
            <QRTButton variant="primary" onClick={stopRecording} className="flex-1 !py-2.5 !text-sm !bg-red-600 hover:!bg-red-700">Arr\u00eater</QRTButton>
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
          <span className="text-3xl">\uD83C\uDFA4</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-black">Laisser un message vocal</p>
            <p className="text-xs text-black/40">Appuyez pour enregistrer (max 30s)</p>
          </div>
        </motion.button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════
export function ViewPageContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [qrData, setQrData] = useState<QrCodeData | null>(null);
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voiceMsgs, setVoiceMsgs] = useState<VoiceMsg[]>([]);
  const [hubSlug, setHubSlug] = useState<string | null>(null);

  const fetchQr = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/qr/${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Module non trouv\u00e9');
      setQrData(json.qrCode);
      setContent(json.content || {});
      setHubSlug((json.hubSlug as string) || null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const refreshVoice = useCallback(async () => {
    if (!qrData?.id) return;
    try {
      const res = await fetch(`/api/public/qr-voice/${encodeURIComponent(qrData.id)}?limit=10`);
      if (res.ok) { const json = await res.json(); setVoiceMsgs(json.messages || []); }
    } catch { /* silent */ }
  }, [qrData?.id]);

  useEffect(() => { fetchQr(); }, [fetchQr]);
  useEffect(() => { if (qrData) refreshVoice(); }, [qrData, refreshVoice]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
          <QRTCard className="!p-6">
            <span className="text-4xl animate-pulse">{getModuleEmoji(qrData?.type || '')}</span>
          </QRTCard>
          <p className="text-sm text-white/60">Chargement...</p>
        </motion.div>
      </div>
    );
  }

  // ── Error ──
  if (error || !qrData) {
    return (
      <div className="min-h-screen bg-[#8B5CF6] flex items-center justify-center p-4">
        <QRTCard className="w-full max-w-sm">
          <div className="text-center">
            <span className="text-5xl">\u274C</span>
            <h1 className="text-xl font-bold text-black mt-3 mb-2">Module introuvable</h1>
            <p className="text-sm text-black/50 mb-6">{error || "Ce module n'existe pas ou a \u00e9t\u00e9 d\u00e9sactiv\u00e9."}</p>
            <div className="h-10 bg-gray-50 border-2 border-black rounded-[8px] flex items-center justify-center gap-2 text-sm text-black/60">
              <span>\uD83D\uDCE6</span><span className="font-mono text-xs">{slug}</span>
            </div>
          </div>
        </QRTCard>
      </div>
    );
  }

  // ── Render module content by type ──
  const renderModule = () => {
    switch (qrData.type) {
      case 'wifi': return <WifiView content={content} />;
      case 'house_rules': return <RulesView content={content} />;
      case 'contact':
      case 'emergency_contacts': return <ContactView content={content} />;
      case 'emergency': return <EmergencyView content={content} />;
      case 'recipe': return <RecipeView content={content} />;
      case 'note':
      case 'guestbook': return <NoteView content={content} />;
      case 'shopping_list': return <ShoppingListView content={content} />;
      case 'external_link': return <ExternalLinkView content={content} />;
      default: return <GenericView content={content} type={qrData.type} />;
    }
  };

  return (
    <>
      <div className="min-h-screen bg-[#8B5CF6]">
        <div className="min-h-screen flex flex-col relative z-10">
          {/* Header */}
          <header className="w-full px-5 sm:px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2">
            <div className="max-w-lg lg:max-w-xl mx-auto">
              <div className="flex items-center gap-3">
                {hubSlug ? (
                  <a
                    href={`/hub/${hubSlug}`}
                    className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
                  >
                    <Home className="h-4 w-4" />
                    <span className="hidden sm:inline">Hub</span>
                  </a>
                ) : (
                  <a
                    href="/"
                    className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Retour</span>
                  </a>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getModuleEmoji(qrData.type)}</span>
                    <h1 className="text-lg font-bold text-white truncate">{qrData.name}</h1>
                  </div>
                  {qrData.homeName && (
                    <p className="text-[10px] text-white/40 ml-7 truncate">{qrData.homeName}</p>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 flex flex-col px-5 sm:px-6 py-5 max-w-lg lg:max-w-xl mx-auto w-full space-y-6">
            {renderModule()}

            {/* Voice messages section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
                <span>\uD83D\uDCAC</span> Messages vocaux
              </div>
              <VoiceRecorder homeId={qrData.id} onSent={refreshVoice} />
              {voiceMsgs.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                  {voiceMsgs.map((vm) => <VoicePlayer key={vm.id} msg={vm} />)}
                </div>
              )}
            </div>
          </main>

          {/* Footer */}
          <div className="mt-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
            <p className="text-xs text-white/30">
              Propuls\u00e9 par QR Domotik \uD83C\uDFE0
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

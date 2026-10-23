'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Phone, Mail, ExternalLink, ArrowLeft, Home } from 'lucide-react';
import { toast } from 'sonner';
import { QRTCard, QRTButton } from '@/components/qrtags';
import { QR_MODULE_LABELS } from '@/types/database';
import { buildWifiQrString } from '@/lib/wifi-qr';

// ── Types ──
interface QrCodeData {
  id: string;
  name: string;
  type: string;
  publicSlug: string;
  isActive: boolean;
  homeName: string | null;
}

const MODULE_EMOJIS: Record<string, string> = {
  wifi: '📱', guestbook: '📖', doorbell: '🔔', emergency: '🚨',
  note: '📝', contact: '👥', shopping_list: '🛒', inventory: '📦',
  chore: '✅', checklist: '✅', timer: '⏱️', recipe: '🍳',
  medication: '💊', meal_planner: '🍽️', external_link: '🔗',
  home_manual: '📋', house_rules: '🛡️', voice_assistant: '🎤',
  emergency_contacts: '📠',
};

function getModuleEmoji(type: string) { return MODULE_EMOJIS[type] || '📦'; }
function getModuleLabel(type: string) { return (QR_MODULE_LABELS as Record<string, string>)[type] || type; }

const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

// ══════════════════════════════════════════════════════════════
// WiFi QR Code Generator — FIX-16 : implémentation déplacée dans
// src/lib/wifi-qr.ts (partagée avec la carte Wi-Fi du Hub invité)
// ══════════════════════════════════════════════════════════════

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
      toast.success('Mot de passe copié !');
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
          <p className="text-[10px] text-black/30 mt-3">Utilisez l'appareil photo de votre téléphone</p>
        </QRTCard>
      )}

      {/* Network info */}
      <QRTCard header={{ emoji: '📱', title: 'Réseau Wi-Fi' }}>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider">Nom du réseau</p>
            <p className="text-base font-bold text-black mt-1 truncate">{ssid || 'Non configuré'}</p>
          </div>
          {security && (
            <div>
              <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider">Sécurité</p>
              <p className="text-sm text-black mt-1">{security}</p>
            </div>
          )}
          {password && (
            <div>
              <p className="text-[10px] text-black/40 font-semibold uppercase tracking-wider">Mot de passe</p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-11 bg-gray-50 border-2 border-black rounded-[8px] flex items-center px-3">
                  <span className="text-sm font-mono text-black flex-1 truncate">
                    {showPw ? password : '•'.repeat(Math.min(password.length, 20))}
                  </span>
                  <button
                    onClick={() => setShowPw(s => !s)}
                    className="text-black/40 hover:text-black/70 transition-colors text-sm ml-2"
                  >
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={copyPassword}
                  className="h-11 px-4 bg-white border-2 border-black rounded-[8px] text-black text-xs font-bold flex items-center gap-1.5 shadow-[2px_2px_0_rgba(0,0,0,0.08)] active:translate-y-[1px] active:shadow-none transition-all hover:bg-gray-50"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copié' : 'Copier'}
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
      {!!content.title && (
        <QRTCard>
          <p className="text-base font-bold text-black">{content.title as string}</p>
        </QRTCard>
      )}
      {rules.length > 0 ? (
        rules.map((rule, i) => (
          <motion.div key={i} variants={itemVariants} initial="hidden" animate="visible" transition={{ delay: i * 0.05 }}>
            <QRTCard>
              <div className="flex items-start gap-3">
                <span className="h-6 min-w-6 rounded-full bg-[#055492] text-white text-xs font-bold flex items-center justify-center mt-0.5">
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
            <span className="text-3xl">📜</span>
            <p className="text-sm text-black/40 mt-2">Aucune règle définie</p>
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
        <QRTCard header={{ emoji: '📞', title: name || 'Contact' }}>
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
          <span className="text-4xl">🚨</span>
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

// ══════════════════════════════════════════════════════════════
// Recipe View
// ══════════════════════════════════════════════════════════════
function RecipeView({ content }: { content: Record<string, unknown> }) {
  const title = (content.title as string) || 'Recette';
  const ingredients = (content.ingredients as string[]) || [];
  const steps = (content.steps as string[]) || [];

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-4">
      <QRTCard header={{ emoji: '🍳', title }}>
        {!!content.description && (
          <p className="text-sm text-black/60 mb-3">{content.description as string}</p>
        )}
        {!!content.prep_time && (
          <p className="text-xs text-black/40">⏱️ Préparation : {content.prep_time as string}</p>
        )}
        {!!content.cook_time && (
          <p className="text-xs text-black/40">🔥 Cuisson : {content.cook_time as string}</p>
        )}
      </QRTCard>

      {ingredients.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/50 font-semibold uppercase tracking-wider px-1">Ingrédients</p>
          <QRTCard>
            <ul className="space-y-1.5">
              {ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-black">
                  <span className="text-[#055492] mt-0.5">•</span>
                  {ing}
                </li>
              ))}
            </ul>
          </QRTCard>
        </div>
      )}

      {steps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/50 font-semibold uppercase tracking-wider px-1">Préparation</p>
          {steps.map((step, i) => (
            <QRTCard key={i}>
              <div className="flex items-start gap-3">
                <span className="h-6 min-w-6 rounded-full bg-[#055492] text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
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
              {checked.has(i) && <span className="text-white text-xs">✓</span>}
            </div>
            <span className={`text-sm ${checked.has(i) ? 'text-black/40 line-through' : 'text-black font-medium'}`}>{item}</span>
          </motion.button>
        ))
      ) : (
        <QRTCard>
          <div className="text-center py-6">
            <span className="text-3xl">🛒</span>
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
      <QRTCard header={{ emoji: '🔗', title }}>
        {description && <p className="text-sm text-black/60 mb-4">{description}</p>}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 bg-[#055492] text-white font-bold text-sm rounded-[8px] border-2 border-black shadow-[3px_3px_0_rgba(0,0,0,0.15)] active:translate-y-[1px] active:shadow-none transition-all hover:bg-[#04467a]"
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
// ──────────────────────────────────────────────────────────────
// Guidebook View (home_manual — module B2B Guidebook)
// ──────────────────────────────────────────────────────────────
function GuidebookView({ content }: { content: Record<string, unknown> }) {
  const title = (content.title as string) || 'Guide de bienvenue';
  const body = (content.body as string) || (content.text as string) || '';
  const sections = body.split('\n\n').filter(Boolean);

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-3">
      <QRTCard header={{ emoji: '📖', title }}>
        {sections.length === 0 && <p className="text-sm text-black/40">Guide vide</p>}
        {sections.map((section, i) => (
          <div key={i} className={i > 0 ? 'mt-4 pt-4 border-t-2 border-dashed border-gray-100' : ''}>
            <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">{section}</p>
          </div>
        ))}
      </QRTCard>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Checkout View (checklist — module B2B Check-out)
// ──────────────────────────────────────────────────────────────
function CheckoutView({ content }: { content: Record<string, unknown> }) {
  const title = (content.title as string) || 'Check-out — avant votre départ';
  const body = (content.body as string) || '';
  const items = Array.isArray(content.items)
    ? (content.items as string[])
    : body.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
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
      <div className="text-center py-1">
        <span className="text-3xl">🧹</span>
        <p className="text-sm font-bold text-white mt-1">{title}</p>
        {items.length > 0 && (
          <p className="text-xs text-white/60 mt-0.5">{checked.size}/{items.length} fait{checked.size > 1 ? 's' : ''}</p>
        )}
      </div>
      {items.length > 0 ? (
        items.map((item, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.98 }}
            onClick={() => toggle(i)}
            className={`w-full text-left bg-white border-2 rounded-[12px] p-3.5 flex items-center gap-3 shadow-[3px_3px_0_rgba(0,0,0,0.08)] active:translate-y-[1px] active:shadow-none transition-all ${checked.has(i) ? 'border-green-400 bg-green-50' : 'border-black'}`}
          >
            <div className={`h-5 w-5 rounded-[6px] border-2 flex items-center justify-center shrink-0 transition-colors ${checked.has(i) ? 'bg-green-500 border-green-500' : 'border-black'}`}>
              {checked.has(i) && <span className="text-white text-xs">✓</span>}
            </div>
            <span className={`text-sm ${checked.has(i) ? 'text-black/40 line-through' : 'text-black font-medium'}`}>{item}</span>
          </motion.button>
        ))
      ) : (
        <QRTCard>
          <p className="text-sm text-black/40 text-center py-4">Aucune étape configurée</p>
        </QRTCard>
      )}
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Upselling View (promo — module B2B Upselling)
// ──────────────────────────────────────────────────────────────
function UpsellingView({ content }: { content: Record<string, unknown> }) {
  const title = (content.title as string) || 'Offre spéciale';
  const body = (content.body as string) || (content.description as string) || '';
  const price = (content.price as string) || '';

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible">
      <QRTCard header={{ emoji: '⭐', title, badge: price || 'Offre' }}>
        {body && <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">{body}</p>}
        {price && (
          <div className="mt-4 flex items-center justify-between bg-[#055492]/10 border-2 border-[#055492] rounded-[10px] px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-[#04467a]">Prix</span>
            <span className="text-lg font-black text-[#04467a]">{price}</span>
          </div>
        )}
        <p className="text-xs text-black/40 mt-3">👋 Demandez à votre hôte pour en profiter</p>
      </QRTCard>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Provider Directory View (artisan_directory — module B2B Annuaire)
// ──────────────────────────────────────────────────────────────
function DirectoryView({ content }: { content: Record<string, unknown> }) {
  const name = (content.name as string) || 'Prestataire';
  const phone = (content.phone as string) || '';
  const body = (content.body as string) || (content.details as string) || '';

  return (
    <motion.div variants={itemVariants} initial="hidden" animate="visible">
      <QRTCard header={{ emoji: '🛠️', title: name, badge: 'Prestataire' }}>
        {body && <p className="text-sm text-black leading-relaxed whitespace-pre-wrap">{body}</p>}
        {phone && (
          <a
            href={`tel:${phone.replace(/\s/g, '')}`}
            className="mt-4 flex items-center justify-center gap-2 h-12 bg-[#055492] text-white font-bold text-sm rounded-[8px] border-2 border-black shadow-[3px_3px_0_rgba(0,0,0,0.15)] active:translate-y-[1px] active:shadow-none transition-all hover:bg-[#04467a]"
          >
            📞 Appeler {name}
          </a>
        )}
      </QRTCard>
    </motion.div>
  );
}

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
          <p className="text-sm text-black/40">Aucun contenu configuré</p>
        )}
      </QRTCard>
    </motion.div>
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
  const [hubSlug, setHubSlug] = useState<string | null>(null);

  const fetchQr = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/qr/${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Module non trouvé');
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

  useEffect(() => { fetchQr(); }, [fetchQr]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#10B981] flex items-center justify-center">
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
      <div className="min-h-screen bg-[#10B981] flex items-center justify-center p-4">
        <QRTCard className="w-full max-w-sm">
          <div className="text-center">
            <span className="text-5xl">❌</span>
            <h1 className="text-xl font-bold text-black mt-3 mb-2">Module introuvable</h1>
            <p className="text-sm text-black/50 mb-6">{error || "Ce module n'existe pas ou a été désactivé."}</p>
            <div className="h-10 bg-gray-50 border-2 border-black rounded-[8px] flex items-center justify-center gap-2 text-sm text-black/60">
              <span>📦</span><span className="font-mono text-xs">{slug}</span>
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
      // Modules B2B RoomScan
      case 'home_manual': return <GuidebookView content={content} />;
      case 'checklist': return <CheckoutView content={content} />;
      case 'promo': return <UpsellingView content={content} />;
      case 'artisan_directory': return <DirectoryView content={content} />;
      default: return <GenericView content={content} type={qrData.type} />;
    }
  };

  return (
    <>
      <div className="min-h-screen bg-[#10B981]">
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

          </main>

          {/* Footer */}
          <div className="mt-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
            <p className="text-xs text-white/30">
              Propulsé par RoomScan 🗝️
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

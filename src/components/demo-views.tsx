'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──
type DemoView = 'setup' | 'hub-mode' | 'hub-guest' | 'hub-family' | 'hub-room';

interface QrItem { id: string; name: string; type: string; content: Record<string, unknown>; isPrivate: boolean; }
interface RoomData { id: string; name: string; icon: string; qrs: QrItem[]; }

// ── Static demo data (no API calls needed) ──
const DEMO_GUEST_ROOMS: RoomData[] = [
  {
    id: 'r1', name: 'Salon', icon: '🛋️',
    qrs: [
      { id: 'q1', name: 'WiFi Maison', type: 'wifi', isPrivate: false, content: { network_name: 'LePetitNid_5G', password: 'Demo2025!', security_type: 'WPA2' } },
      { id: 'q2', name: 'Règles de la maison', type: 'house_rules', isPrivate: false, content: { rules: ['Pas de fumer à l\'intérieur', 'Pas d\'animaux sans autorisation', 'Départ avant 11h', 'Pas de bruit après 22h'] } },
      { id: 'q3', name: 'Urgences', type: 'emergency', isPrivate: false, content: { phone: '+33 1 42 60 31 70', contact_name: 'Marie Dupont' } },
    ],
  },
  {
    id: 'r2', name: 'Cuisine', icon: '🍳',
    qrs: [
      { id: 'q4', name: 'Recette locale', type: 'recipe', isPrivate: false, content: { title: 'Quiche Lorraine Maison' } },
    ],
  },
  {
    id: 'r3', name: 'Chambre Principale', icon: '🛏️',
    qrs: [
      { id: 'q5', name: 'Livre d\'or', type: 'guestbook', isPrivate: false, content: { text: 'Bienvenue !' } },
    ],
  },
];

const DEMO_FAMILY_ROOMS: RoomData[] = [
  { ...DEMO_GUEST_ROOMS[0], qrs: [...DEMO_GUEST_ROOMS[0].qrs, { id: 'fq1', name: 'Contacts Famille', type: 'contact', isPrivate: true, content: { contacts: [{ name: 'Maman', phone: '+33 6 12 34 56 78' }] } }, { id: 'fq2', name: 'Liste de courses', type: 'shopping_list', isPrivate: true, content: { items: ['Lait', 'Pain', 'Œufs'] } }] },
  DEMO_GUEST_ROOMS[1],
  { ...DEMO_GUEST_ROOMS[2], qrs: [...DEMO_GUEST_ROOMS[2].qrs, { id: 'fq3', name: 'Médicaments', type: 'medication', isPrivate: true, content: { medications: ['Doliprane - étagère haute'] } }] },
  { id: 'r4', name: 'Bureau', icon: '💼', qrs: [{ id: 'fq4', name: 'Inventaire', type: 'inventory', isPrivate: true, content: { items: ['Cartouches d\'encre (x2)', 'Papier A4'] } }] },
];

const GRADIENT_COLORS: Record<string, { from: string; to: string }> = {
  wifi: { from: '#10b981', to: '#14b8a6' },
  house_rules: { from: '#f59e0b', to: '#f97316' },
  emergency: { from: '#ef4444', to: '#f43f5e' },
  guestbook: { from: '#8b5cf6', to: '#a855f7' },
  recipe: { from: '#f97316', to: '#ef4444' },
  contact: { from: '#3b82f6', to: '#6366f1' },
  shopping_list: { from: '#ec4899', to: '#f43f5e' },
  medication: { from: '#14b8a6', to: '#06b6d4' },
  inventory: { from: '#6366f1', to: '#8b5cf6' },
  chore: { from: '#f59e0b', to: '#eab308' },
};

function getGradient(type: string) { return GRADIENT_COLORS[type] || { from: '#10b981', to: '#14b8a6' }; }

// ══════════════════════════════════════════════════════════
// SETUP DEMO (Simplified 5-step wizard)
// ══════════════════════════════════════════════════════════

function SetupDemo() {
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState('');
  const [pinKey, setPinKey] = useState(0);

  const next = () => setStep((s) => Math.min(s + 1, 4));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handlePin = (digit: string) => {
    if (pin.length < 4) setPin((p) => p + digit);
  };
  const handlePinDelete = () => setPin((p) => p.slice(0, -1));
  useEffect(() => { if (pin.length === 4) { setTimeout(next, 400); } }, [pin]);

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="text-center space-y-6">
      <div className="mx-auto w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center text-4xl">📱</div>
      <h1 className="text-2xl font-bold text-white">Bienvenue !</h1>
      <p className="text-white/60 text-sm leading-relaxed px-4">Scannez votre plaque QR et configurez votre maison connectée en 5 minutes.</p>
      <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Plaque démo détectée
      </div>
    </div>,
    // Step 1: Account
    <div key="account" className="space-y-5">
      <h2 className="text-xl font-bold text-white">Créez votre compte</h2>
      <input placeholder="Nom complet" defaultValue="Marie Dupont" className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/40" />
      <input placeholder="Email" type="email" defaultValue="marie@exemple.com" className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/40" />
      <input placeholder="Mot de passe" type="password" defaultValue="demo1234" className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/40" />
    </div>,
    // Step 2: PIN
    <div key="pin" className="space-y-6 text-center">
      <h2 className="text-xl font-bold text-white">Choisissez votre code PIN</h2>
      <p className="text-white/50 text-sm">4 chiffres pour protéger l\'accès famille</p>
      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-14 w-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${pin[i] ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/15 text-transparent'}
            `}>
            {pin[i] || '●'}
          </div>
        ))}
      </div>
      <div key={pinKey} className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => handlePin(String(n))} className="h-12 rounded-xl bg-white/10 text-white text-lg font-semibold hover:bg-white/20 transition-colors cursor-pointer">{n}</button>
        ))}
        <button onClick={handlePinDelete} className="h-12 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition-colors cursor-pointer">⌫</button>
        <button onClick={() => handlePin('0')} className="h-12 rounded-xl bg-white/10 text-white text-lg font-semibold hover:bg-white/20 transition-colors cursor-pointer">0</button>
        <div />
      </div>
    </div>,
    // Step 3: Config
    <div key="config" className="space-y-5">
      <h2 className="text-xl font-bold text-white">Configuration</h2>
      <input placeholder="Nom du logement" defaultValue="Le Petit Nid" className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/40" />
      <div className="grid grid-cols-1 gap-2">
        {[{ id: 'famille', name: 'Famille', price: '49€/an', color: 'from-emerald-500 to-teal-500' }, { id: 'airbnb_solo', name: 'Airbnb Solo', price: '9,90€/mois', color: 'from-violet-500 to-purple-500' }, { id: 'airbnb_pro', name: 'Airbnb Pro', price: '199€/an', color: 'from-amber-500 to-orange-500' }].map((plan) => (
          <button key={plan.id} className={`w-full p-4 rounded-2xl bg-gradient-to-r ${plan.color} text-white text-left flex justify-between items-center cursor-pointer`}>
            <span className="font-semibold">{plan.name}</span>
            <span className="text-sm opacity-90">{plan.price}</span>
          </button>
        ))}
      </div>
    </div>,
    // Step 4: Success
    <div key="success" className="text-center space-y-6">
      <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400/40 flex items-center justify-center text-4xl">🎉</div>
      <h2 className="text-2xl font-bold text-white">Tout est prêt !</h2>
      <p className="text-white/60 text-sm">Votre maison connectée est configurée.</p>
      <div className="bg-white/10 rounded-2xl p-4 text-left space-y-2">
        <p className="text-white/50 text-xs">Hub URL</p>
        <p className="text-emerald-300 text-sm font-mono">qrdomotik.roomscan.pro/hub/le-petit-nid</p>
      </div>
    </div>,
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 flex flex-col">
      {/* Header */}
      <div className="px-6 pt-12 pb-3">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center text-sm">QR</div>
            <span className="text-sm font-bold text-white">QR Domotik</span>
          </div>
          {step < 4 && (
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-white/60 transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }} />
            </div>
          )}
        </div>
      </div>
      {/* Step content */}
      <div className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="w-full max-w-md">{steps[step]}</div>
      </div>
      {/* Navigation */}
      {step < 4 && (
        <div className="px-6 pb-8">
          <div className="max-w-md mx-auto flex gap-3">
            {step > 0 && (
              <button onClick={back} className="flex-1 h-12 rounded-2xl bg-white/10 border border-white/20 text-white/80 text-sm font-semibold hover:bg-white/15 transition-colors cursor-pointer">Retour</button>
            )}
            <button onClick={next} className={`${step > 0 ? 'flex-1' : 'w-full'} h-12 rounded-2xl bg-white text-violet-700 text-sm font-bold hover:bg-white/90 transition-colors cursor-pointer`}>Continuer</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// HUB DEMO (Guest + Family modes)
// ══════════════════════════════════════════════════════════

function WifiCard({ content }: { content: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const copy = () => { navigator.clipboard.writeText((content.password as string) || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-emerald-400/30 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">📶</div>
        <div><p className="text-sm font-bold text-white">WiFi</p><p className="text-xs text-white/50">{content.network_name as string}</p></div>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-sm text-white/70">{showPw ? (content.password as string) : '••••••••'}</span>
        <button onClick={() => setShowPw(!showPw)} className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white/50 hover:text-white text-xs cursor-pointer">{showPw ? '🙈' : '👁'}</button>
        <button onClick={copy} className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white/50 hover:text-white text-xs cursor-pointer">{copied ? '✅' : '📋'}</button>
      </div>
    </div>
  );
}

function ModuleCard({ qr }: { qr: QrItem }) {
  const g = getGradient(qr.type);
  if (qr.type === 'wifi') return <WifiCard content={qr.content} />;
  if (qr.type === 'house_rules') {
    const rules = (qr.content.rules as string[]) || [];
    return (
      <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">📜</div>
          <p className="text-sm font-bold text-white">Règles de la maison</p>
        </div>
        <div className="space-y-2">{rules.map((r, i) => (
          <div key={i} className="flex items-start gap-2"><span className="h-5 min-w-5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span><p className="text-xs text-white/70 leading-relaxed flex-1">{r}</p></div>
        ))}</div>
      </div>
    );
  }
  if (qr.type === 'emergency') {
    return (
      <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-red-400/30 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center">🚨</div>
          <div><p className="text-sm font-bold text-white">Urgences</p><p className="text-xs text-white/50">{qr.content.contact_name as string}</p></div>
        </div>
        <p className="text-xs text-white/70 font-mono">📞 {qr.content.phone as string}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-4">
      <div className="h-9 w-9 rounded-lg mb-2 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}>
        <span className="text-white text-sm">{qr.isPrivate ? '🔒' : '📌'}</span>
      </div>
      <p className="text-xs font-semibold text-white truncate">{qr.name}</p>
      <p className="text-[10px] text-white/30 mt-0.5 capitalize">{qr.type.replace(/_/g, ' ')}</p>
    </div>
  );
}

function HubDemo() {
  const [view, setView] = useState<DemoView>('hub-mode');
  const [selectedRoom, setSelectedRoom] = useState<RoomData | null>(null);
  const [pin, setPin] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinKey, setPinKey] = useState(0);

  const handlePin = (digit: string) => { if (pin.length < 4) setPin((p) => p + digit); };
  const handlePinDelete = () => setPin((p) => p.slice(0, -1));
  const verifyPin = useCallback(() => {
    if (pin.length === 4) { setPinVerified(true); setView('hub-family'); }
  }, [pin]);
  useEffect(() => { if (pin.length === 4) setTimeout(verifyPin, 300); }, [pin, verifyPin]);

  const rooms = view === 'hub-guest' || view === 'hub-mode' ? DEMO_GUEST_ROOMS : DEMO_FAMILY_ROOMS;

  // Room detail view
  if (view === 'hub-room' && selectedRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 flex flex-col">
        <div className="px-5 py-4 flex items-center gap-3">
          <button onClick={() => { setView(pinVerified ? 'hub-family' : 'hub-guest'); setSelectedRoom(null); }} className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 cursor-pointer">←</button>
          <div className="flex-1"><p className="text-base font-bold text-white">{selectedRoom.icon} {selectedRoom.name}</p><p className="text-xs text-white/40">{selectedRoom.qrs.length} module(s)</p></div>
        </div>
        <div className="flex-1 px-5 pb-6">
          <div className="grid grid-cols-2 gap-3">{selectedRoom.qrs.map((qr) => <ModuleCard key={qr.id} qr={qr} />)}</div>
        </div>
      </div>
    );
  }

  // PIN modal
  if (view === 'hub-mode') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-6 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center text-3xl">🏠</div>
            <h1 className="text-2xl font-bold text-white">Le Petit Nid</h1>
            <p className="text-white/50 text-sm">12 Rue de la Paix, 75002 Paris</p>
            <p className="text-white/30 text-xs">Par Marie Dupont</p>
          </div>
        </div>
        <div className="px-6 pb-8 space-y-4">
          <button onClick={() => setView('hub-guest')} className="w-full h-14 rounded-2xl bg-white text-emerald-700 font-bold text-sm shadow-xl cursor-pointer hover:bg-white/90 transition-colors">🏠 Mode Invité</button>
          <button onClick={() => setView('hub-family')} className="w-full h-14 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 text-white font-bold text-sm cursor-pointer hover:bg-white/15 transition-colors">👨‍👩‍👧‍👦 Mode Famille</button>
          <p className="text-center text-white/30 text-[10px]">QR Domotik • qrdomotik.roomscan.pro</p>
        </div>
      </div>
    );
  }
  // PIN entry for family
  if (view === 'hub-family' && !pinVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-700 via-purple-700 to-fuchsia-700 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">🔐</div>
          <h2 className="text-xl font-bold text-white">Code PIN</h2>
          <p className="text-white/50 text-sm">Entrez le code à 4 chiffres (n\'importe lequel en démo)</p>
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-14 w-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${pin[i] ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/15 text-transparent'}
              `}>{pin[i] || '●'}</div>
            ))}
          </div>
          <div key={pinKey} className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} onClick={() => handlePin(String(n))} className="h-12 rounded-xl bg-white/10 text-white text-lg font-semibold hover:bg-white/20 transition-colors cursor-pointer">{n}</button>
            ))}
            <button onClick={handlePinDelete} className="h-12 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition-colors cursor-pointer">⌫</button>
            <button onClick={() => handlePin('0')} className="h-12 rounded-xl bg-white/10 text-white text-lg font-semibold hover:bg-white/20 transition-colors cursor-pointer">0</button>
            <div />
          </div>
          <button onClick={() => { setView('hub-mode'); setPin(''); setPinVerified(false); }} className="text-white/40 text-sm hover:text-white/60 cursor-pointer">Retour</button>
        </div>
      </div>
    );
  }

  // Guest or Family room list
  const isFamily = view === 'hub-family' && pinVerified;
  return (
    <div className={`min-h-screen flex flex-col ${isFamily ? 'bg-gradient-to-br from-violet-700 via-purple-700 to-fuchsia-700' : 'bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600'}`}>
      <div className="px-5 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { setView('hub-mode'); setPinVerified(false); setPin(''); }} className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 cursor-pointer">←</button>
          <div className="flex-1"><p className="text-base font-bold text-white">{isFamily ? '👨‍👩‍👧‍👦 Famille' : '🏠 Invité'}</p><p className="text-xs text-white/40">Le Petit Nid</p></div>
          <div className="bg-violet-500/15 border border-violet-500/30 px-2.5 py-1 rounded-full flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" /><span className="text-[10px] font-bold text-violet-300">DÉMO</span></div>
        </div>
      </div>
      <div className="flex-1 px-5 pb-6 space-y-4 overflow-y-auto">
        {rooms.map((room) => (
          <button key={room.id} onClick={() => { setSelectedRoom(room); setView('hub-room'); }} className="w-full rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-4 flex items-center gap-3 hover:bg-white/15 transition-colors text-left cursor-pointer">
            <span className="text-2xl">{room.icon}</span>
            <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{room.name}</p><p className="text-xs text-white/40">{room.qrs.length} module(s)</p></div>
            <span className="text-white/30">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════

export function SetupDemoView() {
  return <SetupDemo />;
}

export function HubDemoView() {
  return <HubDemo />;
}

'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellRing,
  MessageSquare,
  Package,
  Home,
  Send,
  Loader2,
  ArrowLeft,
  Eye,
} from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  PulseButton,
  useConfetti,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
  SuccessCheck,
} from '@/components/magic';

type View = 'home' | 'instructions' | 'message' | 'success-ring' | 'success-message';

const v = {
  enter: { opacity: 0, y: 32, scale: 0.97 },
  center: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -24, scale: 0.97 },
};

const t = { type: 'spring' as const, stiffness: 260, damping: 28, mass: 0.8 };

export default function DoorbellDisplayV3({ content, qrCodeId, qrName }: { content: Record<string, any>; qrCodeId?: string; qrName?: string }) {
  const [view, setView] = useState<View>('home');
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const { fire: fireConfetti } = useConfetti();

  const isPresent = content?.mode === 'present';
  const instructions: string = content?.instructions ?? '';
  const allowMessages = content?.allowMessages !== false;
  const allowDoorbell = content?.allowDoorbell !== false;
  const presentMessage: string = content?.presentMessage ?? '';
  const absentMessage: string = content?.absentMessage ?? '';
  const steps = instructions.split('\n').map((s: string) => s.trim()).filter(Boolean);

  const postAction = useCallback(async (action: 'ring' | 'message', text?: string) => {
    if (!qrCodeId) return;
    setLoading(true);
    try {
      await fetch('/api/client/doorbell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qrCodeId, action, text }) });
    } catch { /* silent */ }
    setLoading(false);
  }, [qrCodeId]);

  const handleRing = useCallback(async () => {
    setLoading(true);
    await postAction('ring');
    setView('success-ring');
    fireConfetti(['#fbbf24', '#fb923c', '#f97316', '#ffffff', '#fde68a']);
  }, [postAction, fireConfetti]);

  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim()) return;
    setLoading(true);
    await postAction('message', messageText.trim());
    setMessageText('');
    setView('success-message');
    fireConfetti(['#fbbf24', '#fb923c', '#f97316', '#ffffff', '#fde68a']);
  }, [messageText, postAction, fireConfetti]);

  const goHome = useCallback(() => setView('home'), []);

  function renderView() {
    switch (view) {
      case 'home':
        return <HomeView qrName={qrName} isPresent={isPresent} presentMessage={presentMessage} absentMessage={absentMessage} instructions={instructions} steps={steps} allowDoorbell={allowDoorbell} allowMessages={allowMessages} loading={loading} handleRing={handleRing} setView={setView} />;
      case 'instructions':
        return <InstructionsView steps={steps} goHome={goHome} />;
      case 'message':
        return <MessageView messageText={messageText} setMessageText={setMessageText} loading={loading} handleSendMessage={handleSendMessage} goHome={goHome} />;
      case 'success-ring':
        return <SuccessView title="Sonné !" subtitle="Le propriétaire est notifié" goHome={goHome} />;
      case 'success-message':
        return <SuccessView title="Message envoyé !" subtitle="Le propriétaire recevra votre message" goHome={goHome} />;
      default:
        return null;
    }
  }

  return (
    <GradientBackground moduleType="doorbell">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={15} />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-start px-5 pt-12 pb-8">
        <div className="w-full max-w-md flex flex-col items-center flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={view} variants={v} initial="enter" animate="center" exit="exit" transition={t} className="w-full flex flex-col items-center gap-8">
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </GradientBackground>
  );
}

/* ─── Home View ─── */
function HomeView({ qrName, isPresent, presentMessage, absentMessage, instructions, steps, allowDoorbell, allowMessages, loading, handleRing, setView }: any) {
  return (
    <>
      <AnimatedIcon delay={0.05} className="mb-2">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-white/20 blur-xl animate-pulse" />
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm border border-white/25 shadow-lg">
            {isPresent ? <Home className="text-white" width={40} height={40} strokeWidth={1.8} /> : <Bell className="text-white" width={40} height={40} strokeWidth={1.8} />}
          </div>
        </div>
      </AnimatedIcon>

      <AnimatedTitle delay={0.15} className="text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-lg">
          Bienvenue{qrName ? `, ${qrName}` : ''}
        </h1>
      </AnimatedTitle>

      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}>
        <div className={['inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold backdrop-blur-sm border', isPresent ? 'bg-emerald-500/30 border-emerald-400/40 text-white' : 'bg-amber-400/30 border-amber-300/40 text-white'].join(' ')}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isPresent ? '#34d399' : '#fbbf24', boxShadow: `0 0 8px ${isPresent ? '#34d399' : '#fbbf24'}` }} />
          {isPresent ? 'Le propriétaire est présent' : 'Le propriétaire est absent'}
        </div>
      </motion.div>

      {(isPresent && presentMessage) || (!isPresent && absentMessage) ? (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-white/80 text-center text-base max-w-xs leading-relaxed">
          {isPresent ? presentMessage : absentMessage}
        </motion.p>
      ) : null}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }} className="w-full flex flex-col gap-4 mt-2">
        {instructions && <GlassActionButton icon={<Package className="text-white" width={26} height={26} strokeWidth={2} />} label="Instructions" glowColor="rgba(251,191,36,0.5)" onClick={() => setView('instructions')} />}
        {allowDoorbell && <GlassActionButton icon={<BellRing className="text-white" width={26} height={26} strokeWidth={2} />} label="Sonner" glowColor="rgba(249,115,22,0.5)" onClick={handleRing} disabled={loading} loading={loading} />}
        {allowMessages && <GlassActionButton icon={<MessageSquare className="text-white" width={26} height={26} strokeWidth={2} />} label="Laisser un message" glowColor="rgba(252,211,77,0.5)" onClick={() => setView('message')} />}
      </motion.div>

      <BrandedFooter delay={0.7} />
    </>
  );
}

/* ─── Instructions View ─── */
function InstructionsView({ steps, goHome }: { steps: string[]; goHome: () => void }) {
  return (
    <>
      <div className="w-full flex items-center gap-3">
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={goHome} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm border border-white/20">
          <ArrowLeft className="text-white" width={22} height={22} />
        </motion.button>
        <h2 className="text-2xl font-bold text-white">Instructions</h2>
      </div>
      <GlassCard className="w-full p-6 sm:p-8" hover={false}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-400/25">
            <Eye className="text-white" width={20} height={20} />
          </div>
          <span className="text-white/90 text-sm font-medium">{steps.length} étape{steps.length > 1 ? 's' : ''}</span>
        </div>
        <ol className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 200 }} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-white/20 text-white text-sm font-bold">{i + 1}</span>
              <p className="text-white/90 text-base leading-relaxed pt-0.5">{step}</p>
            </motion.li>
          ))}
        </ol>
      </GlassCard>
      <BrandedFooter delay={0.5} />
    </>
  );
}

/* ─── Message View ─── */
function MessageView({ messageText, setMessageText, loading, handleSendMessage, goHome }: any) {
  return (
    <>
      <div className="w-full flex items-center gap-3">
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={goHome} className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm border border-white/20">
          <ArrowLeft className="text-white" width={22} height={22} />
        </motion.button>
        <h2 className="text-2xl font-bold text-white">Laisser un message</h2>
      </div>
      <GlassCard className="w-full p-6 sm:p-8" hover={false}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-400/25">
            <MessageSquare className="text-white" width={20} height={20} />
          </div>
          <span className="text-white/90 text-sm font-medium">Votre message sera envoyé au propriétaire</span>
        </div>
        <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Écrivez votre message ici…" rows={5} maxLength={500} className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-white placeholder:text-white/40 text-base resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/40 transition-all" />
        <div className="mt-3 mb-1"><span className="text-white/40 text-xs">{messageText.length}/500</span></div>
        <PulseButton glow="0 0 24px rgba(251,191,36,0.45)" pulse={false} onClick={handleSendMessage} disabled={loading || !messageText.trim()} className="!rounded-2xl !py-4 !text-base !font-bold disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? <Loader2 className="animate-spin" width={20} height={20} /> : <Send className="text-white" width={20} height={20} />}
          <span>{loading ? 'Envoi en cours…' : 'Envoyer le message'}</span>
        </PulseButton>
      </GlassCard>
      <BrandedFooter delay={0.5} />
    </>
  );
}

/* ─── Success View ─── */
function SuccessView({ title, subtitle, goHome }: { title: string; subtitle: string; goHome: () => void }) {
  return (
    <>
      <div className="flex flex-col items-center justify-center gap-8 flex-1 min-h-[60vh] -mt-8">
        <SuccessCheck show size={100} className="drop-shadow-2xl" />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="text-center space-y-2">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-lg">{title}</h2>
          <p className="text-white/80 text-base sm:text-lg">{subtitle}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <PulseButton glow="0 0 20px rgba(255,255,255,0.35)" pulse={false} onClick={goHome} className="!rounded-2xl !px-10 !py-4 !text-base">
            <ArrowLeft className="text-white" width={20} height={20} />
            <span>Retour</span>
          </PulseButton>
        </motion.div>
      </div>
      <BrandedFooter delay={0.7} />
    </>
  );
}

/* ─── Glass Action Button ─── */
function GlassActionButton({ icon, label, glowColor, onClick, disabled, loading }: { icon: React.ReactNode; label: string; glowColor: string; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <motion.button whileHover={{ scale: 1.03, boxShadow: `0 0 28px ${glowColor}` }} whileTap={{ scale: 0.97 }} onClick={onClick} disabled={disabled} className="relative w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-white/12 backdrop-blur-xl border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.10)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden">
      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <span className="relative z-10 flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-white/15 border border-white/20">
        {loading ? <Loader2 className="text-white animate-spin" width={26} height={26} /> : icon}
      </span>
      <span className="relative z-10 text-white text-lg font-semibold tracking-wide">{label}</span>
      <motion.span className="relative z-10 ml-auto text-white/50" initial={{ x: -4, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </motion.span>
    </motion.button>
  );
}

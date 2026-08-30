'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Copy, Check, Eye, EyeOff, Shield, Smartphone, Apple, Monitor } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  PulseButton,
  useConfetti,
  StaggerList,
  StaggerItem,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

// ─── Types ───────────────────────────────────────────────────────────

interface WifiDisplayV3Props {
  content: Record<string, any>; // { ssid, password, security, hidden }
  qrCodeId?: string;
  qrName?: string;
}

// ─── Platform Detection ──────────────────────────────────────────────

function detectPlatform(): 'android' | 'ios' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (
    /Android/i.test(ua) ||
    (navigator as any).userAgentData?.platform === 'android'
  )
    return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'desktop';
}

// ─── Sub-components ──────────────────────────────────────────────────

/** Security badge with a shield icon */
function SecurityBadge({ type }: { type: string }) {
  const label =
    type === 'WPA3'
      ? 'WPA3'
      : type === 'WPA2-EAP'
        ? 'WPA2 Enterprise'
        : type === 'WPA2'
          ? 'WPA2'
          : type === 'WPA'
            ? 'WPA'
            : type === 'WEP'
              ? 'WEP'
              : type?.toUpperCase?.() || 'OPEN';

  const isOpen = !type || type === 'OPEN' || type === '';

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase
        bg-white/10 border border-white/20 text-white/90 backdrop-blur-sm"
    >
      <Shield className="w-3.5 h-3.5" />
      <span>{label}</span>
      {isOpen && (
        <span className="ml-0.5 text-[10px] font-normal text-white/60">
          (open)
        </span>
      )}
    </motion.div>
  );
}

/** Platform icon with label for the connect button */
function PlatformLabel({ platform }: { platform: 'android' | 'ios' | 'desktop' }) {
  if (platform === 'android') {
    return (
      <span className="flex items-center gap-2">
        <Smartphone className="w-5 h-5" />
        <span>Se connecter</span>
      </span>
    );
  }
  if (platform === 'ios') {
    return (
      <span className="flex items-center gap-2">
        <Apple className="w-5 h-5" />
        <span>Se connecter</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <Monitor className="w-5 h-5" />
      <span>Copier les infos</span>
    </span>
  );
}

/** Password row with show/hide + copy */
function PasswordRow({
  password,
  onCopy,
  copied,
}: {
  password: string;
  onCopy: () => void;
  copied: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const display = visible ? password : '•'.repeat(Math.min(password.length, 24));

  return (
    <div className="flex items-center gap-2 w-full">
      {/* Password text */}
      <motion.div
        layout
        className="flex-1 min-w-0 bg-white/8 rounded-xl px-4 py-3 border border-white/10
          font-mono text-base tracking-widest text-white/90 select-all"
      >
        {display}
      </motion.div>

      {/* Toggle visibility */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setVisible((v) => !v)}
        className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl
          bg-white/10 border border-white/15 text-white/80 hover:text-white hover:bg-white/20
          transition-colors"
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={visible ? 'on' : 'off'}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center"
          >
            {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Copy button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onCopy}
        className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl
          bg-white/10 border border-white/15 text-white/80 hover:text-white hover:bg-white/20
          transition-colors"
        aria-label="Copier le mot de passe"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? 'check' : 'copy'}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            transition={{ type: 'spring', stiffness: 250, damping: 15 }}
            className="flex items-center justify-center"
          >
            {copied ? (
              <Check className="w-5 h-5 text-emerald-300" />
            ) : (
              <Copy className="w-5 h-5" />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function WifiDisplayV3({
  content,
  qrCodeId,
  qrName,
}: WifiDisplayV3Props) {
  const ssid = content?.ssid ?? 'Réseau inconnu';
  const password = content?.password ?? '';
  const security = content?.security ?? 'WPA2';
  const hidden = content?.hidden ?? false;

  const [copied, setCopied] = useState(false);
  const platform = detectPlatform();
  const { fire: fireConfetti } = useConfetti();

  // Reset copied state after 3 seconds
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(t);
  }, [copied]);

  // ─── Handlers ────────────────────────────────────────────────────

  const handleCopyPassword = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      fireConfetti();
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = password;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      fireConfetti();
    }
  }, [password, fireConfetti]);

  const handleConnect = useCallback(() => {
    if (platform === 'android') {
      const intent = `intent://connect#wifi;S:${ssid};T:${security};P:${password};;#Intent;scheme=wifi;action=android.net.wifi.CONNECT;end`;
      window.location.href = intent;
    } else if (platform === 'ios') {
      const uri = `WIFI:S:${ssid};T:${security};P:${password};H:${hidden ? 'true' : 'false'};;`;
      window.location.href = uri;
    } else {
      // Desktop: copy all Wi-Fi info
      const info = `Wi-Fi\nSSID: ${ssid}\nMot de passe: ${password}\nSécurité: ${security}`;
      navigator.clipboard.writeText(info).then(() => {
        setCopied(true);
        fireConfetti();
      });
    }
  }, [platform, ssid, password, security, hidden, fireConfetti]);

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <GradientBackground moduleType="wifi">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={30} size={4} duration={18} />

      <div className="flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 py-12 sm:py-16">
        {/* ── Glass Card ── */}
        <GlassCard
          className="w-full max-w-md mx-auto p-6 sm:p-8"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.1 }}
        >
          <div className="flex flex-col items-center gap-6">
            {/* Animated Wifi Icon with pulse rings + wobble */}
            <AnimatedIcon delay={0.15} pulseRings={3} wobble ringColor="rgba(255,255,255,0.3)">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center rounded-full
                  bg-white/15 border border-white/25 backdrop-blur-sm shadow-xl"
              >
                <Wifi className="w-10 h-10 sm:w-12 sm:h-12 text-white" strokeWidth={1.8} />
              </motion.div>
            </AnimatedIcon>

            {/* Title */}
            <AnimatedTitle delay={0.25} className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Bienvenue ! 🎉
              </h1>
              <p className="text-sm sm:text-base text-white/70 mt-1.5 font-medium">
                Connectez-vous au Wi-Fi en un clic
              </p>
            </AnimatedTitle>

            {/* Staggered Content */}
            <StaggerList className="w-full flex flex-col gap-5">
              {/* SSID */}
              <StaggerItem>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Nom du réseau
                  </label>
                  <div className="bg-white/8 rounded-xl px-4 py-3 border border-white/10">
                    <p className="text-lg sm:text-xl font-semibold text-white tracking-wide truncate">
                      {ssid}
                    </p>
                  </div>
                </div>
              </StaggerItem>

              {/* Security Badge */}
              <StaggerItem>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/50">
                    Sécurité
                  </label>
                  <div className="flex items-center gap-2">
                    <SecurityBadge type={security} />
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 }}
                      whileHover={{ scale: 1.05 }}
                      className="px-3 py-1.5 bg-emerald-400/20 backdrop-blur rounded-full text-emerald-300 text-xs font-semibold border border-emerald-400/30"
                    >
                      ● Sécurisé
                    </motion.span>
                    {hidden && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xs text-white/50 italic"
                      >
                        Réseau masqué
                      </motion.span>
                    )}
                  </div>
                </div>
              </StaggerItem>

              {/* Password */}
              {password && (
                <StaggerItem>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      Mot de passe
                    </label>
                    <PasswordRow
                      password={password}
                      onCopy={handleCopyPassword}
                      copied={copied}
                    />
                  </div>
                </StaggerItem>
              )}
            </StaggerList>

            {/* Divider */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent origin-center"
            />

            {/* Connect Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, type: 'spring', stiffness: 200, damping: 18 }}
              className="w-full"
            >
              <PulseButton
                onClick={handleConnect}
                variant="white"
                glow="0 0 30px rgba(255,255,255,0.5), 0 0 60px rgba(59,130,246,0.3)"
                className="!text-base sm:!text-lg font-bold"
              >
                <PlatformLabel platform={platform} />
              </PulseButton>
            </motion.div>

            {/* Copy Password Secondary Button */}
            {password && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.85, type: 'spring', stiffness: 200, damping: 18 }}
                className="w-full"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCopyPassword}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl
                    text-sm font-semibold text-white/80 bg-white/5 border border-white/10
                    hover:bg-white/10 hover:text-white transition-all"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copied ? 'copied' : 'copy'}
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 10, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-300" />
                          <span>Copié !</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copier le mot de passe</span>
                        </>
                      )}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            )}
          </div>
        </GlassCard>

        {/* ── Footer ── */}
        <BrandedFooter delay={1.1} />
      </div>
    </GradientBackground>
  );
}

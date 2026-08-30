'use client';

import { motion } from 'framer-motion';
import { BookOpen, Star } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
  StaggerList,
  StaggerItem,
} from '@/components/magic';

interface GuestbookEntry {
  name: string;
  message: string;
  date: string;
}

interface GuestbookDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

/** Scattered twinkling stars for the top area */
const TWINKLE_STARS = [
  { x: '8%', y: '4%', size: 14, delay: 0 },
  { x: '22%', y: '2%', size: 10, delay: 0.8 },
  { x: '38%', y: '5%', size: 16, delay: 1.4 },
  { x: '55%', y: '1%', size: 12, delay: 0.3 },
  { x: '70%', y: '4%', size: 14, delay: 1.1 },
  { x: '85%', y: '2%', size: 10, delay: 0.6 },
  { x: '14%', y: '8%', size: 12, delay: 1.7 },
  { x: '62%', y: '7%', size: 16, delay: 0.2 },
  { x: '92%', y: '5%', size: 12, delay: 1.3 },
  { x: '46%', y: '0%', size: 10, delay: 0.9 },
];

export default function GuestbookDisplayV3({ content, qrCodeId, qrName }: GuestbookDisplayV3Props) {
  const rawTitle: string = content?.title || 'Livre d\'or';
  const rawEntries: GuestbookEntry[] = Array.isArray(content?.entries)
    ? content.entries
    : [];

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <GradientBackground moduleType="guestbook">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={20} />

      {/* ── Twinkling scattered stars ── */}
      {TWINKLE_STARS.map((s, i) => (
        <motion.span
          key={`twinkle-${i}`}
          className="absolute z-10 pointer-events-none"
          style={{ left: s.x, top: s.y }}
          animate={{ opacity: [0.2, 0.9, 0.2] }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: s.delay,
          }}
        >
          <Star
            className="text-amber-200/70 fill-amber-200/40"
            style={{ width: s.size, height: s.size }}
            strokeWidth={0}
          />
        </motion.span>
      ))}

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon with pulse rings + wobble */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(251,191,36,0.3)">
          <div className="w-20 h-20 rounded-full bg-violet-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <BookOpen className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
        </AnimatedTitle>

        {/* Star decoration — staggered twinkle */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 200 }}
          className="flex items-center gap-2 mt-3"
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={`deco-star-${i}`}
              animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.25, 1] }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.35,
              }}
            >
              <Star
                className="w-4 h-4 text-amber-300/80 fill-amber-300/60"
                strokeWidth={0}
              />
            </motion.span>
          ))}
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-6"
        >
          <GlassCard>
            {/* Shimmer overlay */}
            <motion.div
              className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none"
              aria-hidden="true"
            >
              <motion.div
                className="absolute -inset-full"
                animate={{ x: ['-100%', '100%'] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'linear',
                  repeatDelay: 3,
                }}
                style={{
                  background:
                    'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 55%, transparent 60%)',
                  transform: 'skewX(-15deg)',
                }}
              />
            </motion.div>

            <div className="p-5 sm:p-6">
              {rawEntries.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  {/* Pulsing glow behind icon */}
                  <motion.div
                    className="absolute w-28 h-28 rounded-full bg-amber-400/15 blur-2xl"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    aria-hidden="true"
                  />
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1, y: [0, -10, 0] }}
                    transition={{
                      scale: { type: 'spring', stiffness: 200, delay: 0.1 },
                      y: { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
                    }}
                    className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center mb-5 relative"
                  >
                    <BookOpen
                      className="w-10 h-10 text-amber-300/70"
                      strokeWidth={1.5}
                    />
                  </motion.div>
                  <p className="text-white/50 text-center text-base">
                    Soyez le premier à laisser un message
                  </p>
                </div>
              ) : (
                <StaggerList>
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                    {rawEntries.map((entry, index) => (
                      <StaggerItem key={index}>
                        <motion.div
                          whileHover={{ scale: 1.01 }}
                          className="relative rounded-2xl p-4 border border-white/10 bg-white/5 border-l-[3px] border-l-amber-400/60 overflow-hidden"
                        >
                          {/* Hover glow */}
                          <motion.div
                            className="absolute inset-0 rounded-2xl opacity-0 pointer-events-none"
                            style={{
                              background: 'radial-gradient(300px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(251,191,36,0.08), transparent 70%)',
                            }}
                            whileHover={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            aria-hidden="true"
                          />
                          {/* Name + Date row */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                <span className="text-white text-sm font-bold">
                                  {entry.name?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                              </div>
                              <span className="text-white font-bold text-base">
                                {entry.name || 'Anonyme'}
                              </span>
                            </div>
                            {entry.date && (
                              <span className="text-white/40 text-xs">
                                {formatDate(entry.date)}
                              </span>
                            )}
                          </div>
                          {/* Message */}
                          <p className="text-white/80 text-sm leading-relaxed pl-10">
                            {entry.message}
                          </p>
                        </motion.div>
                      </StaggerItem>
                    ))}
                  </div>
                </StaggerList>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

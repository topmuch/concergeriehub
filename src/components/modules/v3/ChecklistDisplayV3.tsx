'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListChecks, Check, Circle } from 'lucide-react';
import {
  FloatingParticles,
  GradientBackground,
  GlassCard,
  useConfetti,
  StaggerList,
  StaggerItem,
  AnimatedCounter,
  SuccessCheck,
  AnimatedIcon,
  AnimatedTitle,
  BrandedFooter,
} from '@/components/magic';

interface ChecklistItem {
  text: string;
  checked: boolean;
}

interface ChecklistDisplayV3Props {
  content: Record<string, any>;
  qrCodeId?: string;
  qrName?: string;
}

/** Parse body text (line-separated or bullet list) into structured items */
function parseBodyToItems(body: string): ChecklistItem[] {
  if (!body?.trim()) return [];
  return body
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .map((text) => ({ text, checked: false }));
}

export default function ChecklistDisplayV3({ content, qrCodeId, qrName }: ChecklistDisplayV3Props) {
  const rawTitle: string = content?.title || 'Ma liste';
  const rawBody: string = content?.body || '';
  const hasStructuredItems = Array.isArray(content?.items) && content.items.length > 0;
  const rawItems: ChecklistItem[] = hasStructuredItems
    ? content.items
    : parseBodyToItems(rawBody);

  const [items, setItems] = useState<ChecklistItem[]>(rawItems);
  const { fire } = useConfetti();

  const checkedCount = useMemo(() => items.filter((i) => i.checked).length, [items]);
  const totalCount = items.length;
  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
  const allChecked = totalCount > 0 && checkedCount === totalCount;

  const toggleItem = useCallback(
    (index: number) => {
      setItems((prev) => {
        const next = [...prev];
        const wasChecked = next[index].checked;
        next[index] = { ...next[index], checked: !wasChecked };
        const nowAllChecked = next.every((i) => i.checked);
        if (nowAllChecked) {
          fire(['#a78bfa', '#c4b5fd', '#ffffff', '#fbbf24']);
        }
        return next;
      });
    },
    [fire]
  );

  return (
    <GradientBackground moduleType="checklist">
      <FloatingParticles color="rgba(255,255,255,0.2)" count={22} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 pb-24">
        {/* Icon */}
        <AnimatedIcon delay={0} pulseRings={2} wobble ringColor="rgba(139,92,246,0.3)">
          <div className="w-20 h-20 rounded-full bg-violet-400/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <ListChecks className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
        </AnimatedIcon>

        {/* Title */}
        <AnimatedTitle delay={0.2}>
          <h1 className="text-3xl sm:text-4xl font-bold text-white text-center mt-5 drop-shadow-lg">
            {rawTitle}
          </h1>
        </AnimatedTitle>

        {/* Body subtitle — only show if not used as items source */}
        <AnimatePresence>
          {rawBody && hasStructuredItems && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="text-white/70 text-center text-base sm:text-lg mt-3 max-w-md leading-relaxed"
            >
              {rawBody}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-lg mt-6"
        >
          <GlassCard>
            <div className="p-5 sm:p-6 space-y-5">
              {/* Progress section */}
              {totalCount > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 text-sm font-medium">Progression</span>
                    <span className="text-white/90 text-sm font-semibold">
                      <AnimatedCounter value={checkedCount} />{' '}
                      <span className="text-white/50">/</span>{' '}
                      <AnimatedCounter value={totalCount} />{' '}
                      <span className="text-white/60">éléments</span>
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, #a78bfa, #8b5cf6, #7c3aed)',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: 'spring', stiffness: 100, damping: 18 }}
                    />
                  </div>

                  {/* Percentage label */}
                  <motion.p
                    key={checkedCount}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-violet-200/80 text-xs font-medium text-center"
                  >
                    {Math.round(progress)}% terminé
                  </motion.p>
                </div>
              )}

              {/* Divider */}
              {totalCount > 0 && <div className="h-px bg-white/10" />}

              {/* Items list */}
              {totalCount === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                    className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4"
                  >
                    <ListChecks className="w-7 h-7 text-white/30" strokeWidth={1.5} />
                  </motion.div>
                  <p className="text-white/60 text-center text-sm">
                    Aucun élément pour le moment
                  </p>
                </div>
              ) : (
                <StaggerList>
                  <div className="space-y-2.5">
                    {items.map((item, index) => (
                      <StaggerItem key={index} index={index}>
                        <motion.button
                          type="button"
                          onClick={() => toggleItem(index)}
                          whileTap={{ scale: 0.97 }}
                          className={
                            'w-full bg-white/5 rounded-xl p-3.5 sm:p-4 flex items-center gap-3.5 ' +
                            'transition-colors duration-300 active:bg-white/10 '
                          }
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          {/* Check circle */}
                          <motion.div
                            animate={{
                              scale: item.checked ? [1, 1.2, 1] : 1,
                            }}
                            transition={{ duration: 0.3 }}
                            className={
                              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ' +
                              (item.checked
                                ? 'bg-white shadow-lg shadow-violet-400/30'
                                : 'bg-white/10 border border-white/20 backdrop-blur-sm')
                            }
                          >
                            <AnimatePresence mode="wait">
                              {item.checked ? (
                                <motion.div
                                  key="checked"
                                  initial={{ scale: 0, rotate: -90 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  exit={{ scale: 0, rotate: 90 }}
                                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                >
                                  <Check className="w-4 h-4 text-violet-700" strokeWidth={3} />
                                </motion.div>
                              ) : (
                                <motion.div
                                  key="unchecked"
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  exit={{ scale: 0 }}
                                >
                                  <Circle className="w-4 h-4 text-white/40" strokeWidth={1.5} />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>

                          {/* Item text */}
                          <motion.span
                            animate={{
                              color: item.checked ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,1)',
                            }}
                            transition={{ duration: 0.3 }}
                            className={
                              'text-left text-base sm:text-lg leading-snug flex-1 ' +
                              (item.checked ? 'line-through decoration-white/30 decoration-2' : '')
                            }
                          >
                            {item.text}
                          </motion.span>
                        </motion.button>
                      </StaggerItem>
                    ))}
                  </div>
                </StaggerList>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Success overlay */}
      <AnimatePresence>
        {allCheckedTriggered && (
          <SuccessCheck>
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center"
              >
                <Check className="w-12 h-12 text-white" strokeWidth={2.5} />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg"
              >
                Bravo ! 🎉
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
                className="text-white/80 text-lg sm:text-xl"
              >
                Tout est coché !
              </motion.p>
            </div>
          </SuccessCheck>
        )}
      </AnimatePresence>

      <BrandedFooter delay={1} />
    </GradientBackground>
  );
}

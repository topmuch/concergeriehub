'use client';

// =============================================================
// v4.74 « SMART PROMPTS » — HOOK DE DÉTECTION & D'AFFICHAGE
// useSmartNotifications({ slug, enabled, checkoutDate })
//
// Logique (recheck toutes les 60 s + au montage) :
//   1. Charge les NotificationSettings du bien (public API).
//   2. Respecte le kill switch plateforme (platformEnabled).
//   3. Pour chaque type configuré : l'heure actuelle est-elle dans la
//      fenêtre de déclenchement (±5 min autour de l'heure configurée) ?
//      — veille de départ : uniquement la veille du check-out (date
//        locale de `checkoutDate` = demain).
//   4. Anti-doublon DOUBLE :
//      — localStorage `hub-smart-notif-<slug>-<type>-<YYYY-MM-DD>`
//        (instantané, multi-onglets) ;
//      — serveur NotificationLog (GET → shown? puis POST à l'affichage).
//   5. Une SEULE notification à la fois (priorité petit-déjeuner →
//      déjeuner → dîner → veille de départ).
//
// v4.112 « MOTEUR DE RECOMMANDATION CONTEXTUEL » — si aucun prompt
// horaire n'est dû, le hook interroge le moteur serveur
// (/api/public/hub/[slug]/recommendations) : heure locale du logement,
// météo en cache, prestataires & minibar RÉELLEMENT configurés, jour
// du séjour → la suggestion la plus prioritaire est affichée via la
// même carte SmartNotification. Anti-spam : le serveur filtre déjà
// les types journalisés aujourd'hui (NotificationLog) + garde local
// identique aux prompts horaires.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SmartNotificationType } from '@/components/hub-premium/smart-notification';

export interface ActiveSmartNotification {
  type: SmartNotificationType;
  title: string;
  message: string;
  duration: number;
}

interface SettingsPayload {
  ok?: boolean;
  platformEnabled?: boolean;
  settings?: {
    enableBreakfast: boolean;
    breakfastTime: string;
    breakfastMessage: string;
    enableLunch: boolean;
    lunchTime: string;
    lunchMessage: string;
    enableDinner: boolean;
    dinnerTime: string;
    dinnerMessage: string;
    enableCheckoutReminder: boolean;
    checkoutReminderTime: string;
    checkoutReminderMessage: string;
    displayDuration: number;
  };
}

const TRIGGER_WINDOW_MIN = 5;

/**
 * v4.112 — mapping type moteur (majuscules, côté serveur) → clé
 * NotificationLog/SmartNotification (minuscules). Le lib moteur
 * importe la DB (serveur seul) : le mapping est dupliqué ici,
 * client-safe, et doit rester en phase avec RECOMMENDATION_LOG_TYPE.
 */
const CONTEXTUAL_TYPE_TO_LOG: Record<string, SmartNotificationType> = {
  BREAKFAST: 'breakfast',
  MINIBAR: 'minibar',
  FOOD: 'food',
  ACTIVITY: 'activity',
};

interface ContextualRecommendation {
  type: string;
  title: string;
  message: string;
  priority: number;
  providerName?: string;
}

function hhmmToMinutes(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isTriggerTime(hhmm: string, now: Date): boolean {
  const target = hhmmToMinutes(hhmm);
  if (target < 0) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return Math.abs(current - target) <= TRIGGER_WINDOW_MIN;
}

/** Clé journalière locale (YYYY-MM-DD) pour l'anti-doublon. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seenKey(slug: string, type: string, day: string): string {
  return `hub-smart-notif-${slug}-${type}-${day}`;
}

function wasSeen(slug: string, type: string, day: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(slug, type, day)) === '1';
  } catch {
    return false;
  }
}

function markSeen(slug: string, type: string, day: string): void {
  try {
    window.localStorage.setItem(seenKey(slug, type, day), '1');
  } catch {
    // localStorage indisponible → le garde-fou serveur reste actif.
  }
}

// ── v4.112 — pont anti-spam CONTEXTUEL par SESSION (sessionStorage) :
// chaque type reste limité à 1×/jour (localStorage + NotificationLog),
// et DEUX recommandations contextuelles ne peuvent pas se remplacer à
// 1 minute d'intervalle : 30 min minimum entre deux cartes moteur.
const CONTEXTUAL_GAP_MS = 30 * 60 * 1000;
const recGapKey = (slug: string) => `hub-rec-last-${slug}`;

function lastContextualAt(slug: string): number {
  try {
    return Number(window.sessionStorage.getItem(recGapKey(slug)) ?? 0);
  } catch {
    return 0;
  }
}

function markContextualShown(slug: string): void {
  try {
    window.sessionStorage.setItem(recGapKey(slug), String(Date.now()));
  } catch {
    // session indisponible → le pont saute, acceptable
  }
}

/** La veille de départ : la date locale de checkoutDate est demain. */
function isCheckoutEve(checkoutDate: string | null | undefined, now: Date): boolean {
  if (!checkoutDate) return false;
  const t = new Date(checkoutDate).getTime();
  if (Number.isNaN(t)) return false;
  const checkout = new Date(t);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return (
    checkout.getFullYear() === tomorrow.getFullYear() &&
    checkout.getMonth() === tomorrow.getMonth() &&
    checkout.getDate() === tomorrow.getDate()
  );
}

/**
 * v4.76 — FENÊTRE DE SÉJOUR STRICTE : aucune carte Smart Prompt hors du
 * séjour (plus de « Petit-déjeuner » affiché à un invité déjà parti, ni
 * de prompts avant l'arrivée quand le hub reste ouvert sans verrou).
 * Retourne `null` quand les dates sont absentes (données insuffisantes
 * → comportement antérieur conservé, jamais de régression).
 */
function isWithinStay(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
  now: Date,
): boolean | null {
  const ci = checkIn ? new Date(checkIn).getTime() : NaN;
  const co = checkOut ? new Date(checkOut).getTime() : NaN;
  if (Number.isNaN(ci) && Number.isNaN(co)) return null;
  const t = now.getTime();
  if (!Number.isNaN(ci) && t < ci) return false;
  // 1 min de grâce sur la fin (la fin effective est déjà rallongée par
  // un départ tardif validé — payload.stay.endAt).
  if (!Number.isNaN(co) && t > co + 60_000) return false;
  return true;
}

export function useSmartNotifications(opts: {
  slug: string;
  /** Monté uniquement quand la vue invité est active. */
  enabled: boolean;
  /** Fin de séjour effective (ISO — payload.stay.endAt). */
  checkoutDate?: string | null;
  /** v4.76 — début du séjour (ISO — payload.stay.checkIn) : fenêtre stricte. */
  checkInDate?: string | null;
}) {
  const { slug, enabled, checkoutDate, checkInDate } = opts;
  const [active, setActive] = useState<ActiveSmartNotification | null>(null);
  // v4.112 — miroir ref de `active` : la closure de check() ne voit pas
  // l'état à jour (effet non relancé) → sans ce ref, un recheck 60 s
  // pendant l'affichage pouvait REMPLACER la carte visible.
  const activeRef = useRef(false);
  const settingsRef = useRef<SettingsPayload['settings'] | null>(null);
  const settingsAtRef = useRef(0);
  const platformEnabledRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let alive = true;

    const check = async () => {
      if (busyRef.current) return;
      if (activeRef.current) return; // une notification affichée ne doit pas être remplacée
      busyRef.current = true;
      try {
        // 1) Settings (cache mémoire du hook — refetch ≤ 1/10 min).
        const now = Date.now();
        if (!settingsRef.current || now - settingsAtRef.current > 10 * 60_000) {
          const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/notification-settings`, {
            cache: 'no-store',
          });
          const json = (await res.json().catch(() => null)) as SettingsPayload | null;
          if (!alive) return;
          if (json?.ok && json.settings) {
            settingsRef.current = json.settings;
            settingsAtRef.current = now;
            platformEnabledRef.current = json.platformEnabled !== false;
          } else {
            platformEnabledRef.current = false; // erreur → silence
          }
        }
        if (!alive || !platformEnabledRef.current || !settingsRef.current) return;
        const s = settingsRef.current;

        const nowDate = new Date();
        const day = dayKey(nowDate);

        // 2) v4.76 — hors fenêtre de séjour → silence total (ni repas ni
        // veille de départ). `null` (dates absentes) = comportement antérieur.
        if (isWithinStay(checkInDate, checkoutDate, nowDate) === false) return;

        // 3) Candidats dans l'ordre de priorité.
        const candidates: { type: SmartNotificationType; enabled: boolean; time: string; message: string; title: string }[] = [
          { type: 'breakfast', enabled: s.enableBreakfast, time: s.breakfastTime, message: s.breakfastMessage, title: 'Petit-déjeuner' },
          { type: 'lunch', enabled: s.enableLunch, time: s.lunchTime, message: s.lunchMessage, title: 'Déjeuner' },
          { type: 'dinner', enabled: s.enableDinner, time: s.dinnerTime, message: s.dinnerMessage, title: 'Dîner' },
          {
            type: 'checkout_reminder',
            enabled: s.enableCheckoutReminder && isCheckoutEve(checkoutDate, nowDate),
            time: s.checkoutReminderTime,
            message: s.checkoutReminderMessage,
            title: 'Souvenirs & cadeaux',
          },
        ];

        for (const c of candidates) {
          if (!c.enabled) continue;
          if (!isTriggerTime(c.time, nowDate)) continue;
          if (wasSeen(slug, c.type, day)) continue;

          // 3) Double garde-fou serveur (autre onglet / autre appareil).
          try {
            const res = await fetch(
              `/api/public/hub/${encodeURIComponent(slug)}/notification-log?type=${c.type}&date=${day}`,
              { cache: 'no-store' },
            );
            const json = (await res.json().catch(() => null)) as { ok?: boolean; shown?: boolean } | null;
            if (json?.ok && json.shown) {
              markSeen(slug, c.type, day);
              continue;
            }
          } catch {
            // Serveur injoignable → le garde-fou local suffit.
          }

          // 4) Affichage + journalisation (fire-and-forget).
          if (!alive) return;
          setActive({
            type: c.type,
            title: c.title,
            message: c.message,
            duration: Math.min(60, Math.max(5, s.displayDuration || 30)),
          });
          markSeen(slug, c.type, day);
          void fetch(`/api/public/hub/${encodeURIComponent(slug)}/notification-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: c.type }),
          }).catch(() => undefined);
          break; // une seule à la fois
        }

        // ── v4.112 MOTEUR DE RECOMMANDATION CONTEXTUEL ──
        // Aucun prompt horaire dû → le moteur serveur (heure locale du
        // logement, météo en cache, prestataires/minibar réels, jour du
        // séjour) propose la recommandation la plus prioritaire. Le
        // serveur a déjà filtré les types journalisés aujourd'hui
        // (NotificationLog) ; on applique en plus le garde local ET le
        // pont de 30 min par session.
        if (Date.now() - lastContextualAt(slug) < CONTEXTUAL_GAP_MS) return;
        const displayDuration = Math.min(60, Math.max(5, s.displayDuration || 30));
        const recRes = await fetch(
          `/api/public/hub/${encodeURIComponent(slug)}/recommendations`,
          { cache: 'no-store' },
        );
        const recJson = (await recRes.json().catch(() => null)) as {
          ok?: boolean;
          recommendations?: ContextualRecommendation[];
        } | null;
        if (alive && recJson?.ok && Array.isArray(recJson.recommendations)) {
          for (const rec of recJson.recommendations) {
            const recType = CONTEXTUAL_TYPE_TO_LOG[rec.type];
            if (!recType) continue;
            if (wasSeen(slug, recType, day)) continue;
            setActive({
              type: recType,
              title: rec.title,
              message: rec.message,
              duration: displayDuration,
            });
            markSeen(slug, recType, day);
            markContextualShown(slug);
            // Journalisation serveur (fire-and-forget) → anti-doublon.
            void fetch(`/api/public/hub/${encodeURIComponent(slug)}/notification-log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: recType }),
            }).catch(() => undefined);
            break; // une seule à la fois
          }
        }
      } catch {
        // Jamais bloquant : le hub fonctionne sans smart prompts.
      } finally {
        busyRef.current = false;
      }
    };

    void check();
    const interval = setInterval(() => void check(), 60_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
    // `active` volontairement hors deps : on veut tester la valeur la
    // plus récente sans relancer l'intervalle. busyRef + activeRef
    // évitent les courses.
  }, [slug, enabled, checkoutDate, checkInDate]);

  useEffect(() => {
    activeRef.current = active != null;
  }, [active]);

  const dismiss = useCallback(() => setActive(null), []);

  return { active, dismiss };
}

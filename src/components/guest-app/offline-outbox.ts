// =============================================================
// PHASE FINALE (V4.9) — Outbox hors-ligne de l'app invitée.
// Les pings « session invité » (POST guest-session) émis hors
// connexion — ou dont l'envoi a échoué — sont stockés puis
// rejoués automatiquement au retour du réseau → l'hôte reçoit
// bien « 👋 … vient d'arriver et a scanné votre Hub ! » même si
// le scan a eu lieu sans internet (Wi-Fi capricieux, sous-sol…).
// Stockage : localStorage par slug (léger, synchrone, suffisant).
// =============================================================

const OUTBOX_PREFIX = 'ch-guest-outbox-';
const MAX_ITEMS = 12;

interface QueuedPing {
  deviceId: string;
  bookingId: string | null;
  at: number;
}

function storageKey(slug: string): string {
  return `${OUTBOX_PREFIX}${slug}`;
}

function readOutbox(slug: string): QueuedPing[] {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolérant aux entrées corrompues.
    return parsed.filter(
      (item): item is QueuedPing =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as QueuedPing).deviceId === 'string' &&
        !!(item as QueuedPing).deviceId,
    );
  } catch {
    return [];
  }
}

function writeOutbox(slug: string, items: QueuedPing[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(storageKey(slug));
    else window.localStorage.setItem(storageKey(slug), JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    /* stockage indisponible — silencieux */
  }
}

/** Met en file un ping émis hors-ligne (ou dont l'envoi a échoué). */
export function queueGuestPing(slug: string, deviceId: string, bookingId: string | null): void {
  try {
    const items = readOutbox(slug);
    items.push({ deviceId, bookingId, at: Date.now() });
    writeOutbox(slug, items);
  } catch {
    /* silencieux — la file ne doit jamais perturber l'app */
  }
}

async function sendPing(slug: string, ping: QueuedPing): Promise<boolean> {
  try {
    const res = await fetch(`/api/public/hub/${encodeURIComponent(slug)}/guest-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: ping.deviceId, bookingId: ping.bookingId }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Rejoue les pings en attente. Appelé au retour du réseau. */
export async function flushGuestPings(slug: string): Promise<void> {
  try {
    const items = readOutbox(slug);
    if (items.length === 0) return;

    // Déduplique par appareil en gardant le ping le plus ANCIEN :
    // c'est lui qui déclenche la notification « premier scan ».
    const oldestByDevice = new Map<string, QueuedPing>();
    for (const ping of items) {
      const existing = oldestByDevice.get(ping.deviceId);
      if (!existing || ping.at < existing.at) oldestByDevice.set(ping.deviceId, ping);
    }

    const failed: QueuedPing[] = [];
    for (const ping of oldestByDevice.values()) {
      const ok = await sendPing(slug, ping);
      if (!ok) failed.push(ping);
    }
    writeOutbox(slug, failed);
  } catch {
    /* silencieux — le flush ne doit jamais casser l'app */
  }
}

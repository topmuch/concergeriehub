// =============================================================
// FIX-14 — POST /api/errors : réception des erreurs client (PUBLIC)
//
// Premier usage RÉEL de zod dans le projet (la dépendance était installée
// mais inutilisée) : validation stricte des payloads {source, message,
// stack, url, context} — types et tailles bornés (message ≤ 2000,
// stack ≤ 4000, source ≤ 120, url ≤ 2048).
//
// Comportement volontairement muet (endpoint public, aucune info sensible
// en retour) :
//  - payload valide    → écriture AuditLog via captureError
//    (action='runtime.error', entityType='client', ip=clientIp) → 204 ;
//  - payload invalide  → 400 SANS détail (ignoré silencieusement) ;
//  - > 10 requêtes/min/IP → 429 (rate-limit AVANT validation : anti-DoS) ;
//  - body non JSON     → 400 sans détail.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { captureError } from '@/lib/error-monitor';
import { clientIp } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

const CONTEXT_MAX_CHARS = 4000; // borne le contexte stocké en detailsJson

const errorsPayloadSchema = z.object({
  source: z.string().max(120).optional(),
  message: z.string().min(1).max(2000),
  stack: z.string().max(4000).optional(),
  url: z.string().max(2048).optional(),
  // zod v4 : z.record exige explicitement clé + valeur.
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  // Anti-abus AVANT tout traitement : 10/min/IP (fail-open si Redis down).
  const ip = clientIp(req.headers);
  if (!(await rateLimit(`errors:${ip ?? 'unknown'}`, 10))) {
    return new NextResponse(null, { status: 429 });
  }

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null; // body absent/non-JSON → 400 sans détail
  }

  const parsed = errorsPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    // Ignoré silencieusement : 400 sans aucun détail de validation.
    return new NextResponse(null, { status: 400 });
  }

  const { source, message, stack, url, context } = parsed.data;

  // Hygiène : borne la taille du contexte client (le payload vient d'un
  // visiteur anonyme — rien ne limite a priori la taille d'un objet JSON).
  let safeContext = context;
  if (safeContext) {
    const json = JSON.stringify(safeContext);
    if (json.length > CONTEXT_MAX_CHARS) {
      safeContext = {
        note: `context tronqué (> ${CONTEXT_MAX_CHARS} chars)`,
        preview: json.slice(0, CONTEXT_MAX_CHARS),
      };
    }
  }

  // Pipeline unique : synthétise une Error à partir du payload client
  // (message + stack) et trace via captureError — même écriture AuditLog
  // que les erreurs serveur, entityType='client' (mandaté pour le filtre
  // « Erreurs runtime » de /admin/logs).
  const synthetic = new Error(message);
  if (stack) synthetic.stack = stack;

  await captureError(
    'client',
    synthetic,
    {
      reportedSource: source ?? 'window',
      ...(url ? { pageUrl: url } : {}),
      ...(safeContext ?? {}),
    },
    req,
  );

  return new NextResponse(null, { status: 204 });
}

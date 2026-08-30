import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const VALID_ACTIONS = ['toggle', 'turn_on', 'turn_off', 'get_state'] as const;

type Action = (typeof VALID_ACTIONS)[number];

// POST: Trigger an action on Home Assistant / Jeedom
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const { id } = await params;
    const body = await request.json();
    const { entityId, action } = body as {
      entityId: string;
      action: Action;
    };

    if (!entityId || !action) {
      return NextResponse.json(
        { error: 'Les champs entityId et action sont requis' },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: 'Action invalide. Valeurs: toggle, turn_on, turn_off, get_state' },
        { status: 400 }
      );
    }

    const automation = await db.homeAutomation.findUnique({
      where: { id },
      include: { home: true },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automatisation introuvable' }, { status: 404 });
    }

    // Verify ownership
    const home = await db.home.findFirst({
      where: {
        id: automation.homeId,
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
    });

    if (!home) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    if (!automation.apiToken) {
      return NextResponse.json({
        success: false,
        message: 'Token API non configuré',
      });
    }

    const baseUrl = automation.baseUrl.replace(/\/+$/, '');

    if (automation.provider === 'home_assistant') {
      return await handleHomeAssistant(baseUrl, automation.apiToken, entityId, action);
    } else if (automation.provider === 'jeedom') {
      return await handleJeedom(baseUrl, automation.apiToken, entityId, action);
    }

    return NextResponse.json({ success: false, message: 'Provider non supporté' });
  } catch (error) {
    console.error('[automations trigger POST] Error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

async function handleHomeAssistant(
  baseUrl: string,
  apiToken: string,
  entityId: string,
  action: Action
): Promise<NextResponse> {
  try {
    if (action === 'get_state') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${baseUrl}/api/states/${entityId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({
          success: true,
          state: data.state,
          message: `État de ${entityId}: ${data.state}`,
        });
      }
      return NextResponse.json({
        success: false,
        message: `Erreur ${res.status} lors de la récupération de l'état`,
      });
    }

    // For toggle, turn_on, turn_off
    let domain: string;
    let service: string;

    if (action === 'toggle') {
      // Toggle: we need to get current state first
      const stateRes = await fetch(`${baseUrl}/api/states/${entityId}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!stateRes.ok) {
        return NextResponse.json({
          success: false,
          message: 'Impossible de récupérer l\'état actuel pour le toggle',
        });
      }
      const stateData = await stateRes.json();
      const isOn = ['on', 'open', 'unlocked', 'playing'].includes(stateData.state);
      const entityParts = entityId.split('.');
      domain = entityParts[0];
      service = isOn ? 'turn_off' : 'turn_on';
    } else {
      const entityParts = entityId.split('.');
      domain = entityParts[0];
      service = action; // turn_on or turn_off
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${baseUrl}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entity_id: entityId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      return NextResponse.json({
        success: true,
        message: `Action '${service}' exécutée sur ${entityId}`,
      });
    }
    return NextResponse.json({
      success: false,
      message: `Erreur ${res.status} lors de l'exécution de l'action`,
    });
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'Délai de connexion dépassé (10s)'
      : 'Erreur de connexion à Home Assistant';
    return NextResponse.json({ success: false, message: msg });
  }
}

async function handleJeedom(
  baseUrl: string,
  apiToken: string,
  entityId: string,
  action: Action
): Promise<NextResponse> {
  try {
    // For Jeedom, entityId is the cmd id
    if (action === 'get_state') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${baseUrl}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: apiToken,
          jsonrpc: '2.0',
          method: 'cmd::execCmd',
          params: { id: parseInt(entityId, 10) },
          id: 1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (data.result !== undefined) {
        return NextResponse.json({
          success: true,
          state: String(data.result),
          message: `Commande ${entityId} exécutée: ${data.result}`,
        });
      }
      return NextResponse.json({
        success: false,
        message: data.error?.message || 'Erreur lors de l\'exécution de la commande',
      });
    }

    // For toggle/turn_on/turn_off - execute the cmd
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: apiToken,
        jsonrpc: '2.0',
        method: 'cmd::execCmd',
        params: { id: parseInt(entityId, 10) },
        id: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (data.result !== undefined || !data.error) {
      return NextResponse.json({
        success: true,
        message: `Action '${action}' exécutée sur la commande ${entityId}`,
      });
    }
    return NextResponse.json({
      success: false,
      message: data.error?.message || 'Erreur lors de l\'exécution',
    });
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'Délai de connexion dépassé (10s)'
      : 'Erreur de connexion à Jeedom';
    return NextResponse.json({ success: false, message: msg });
  }
}

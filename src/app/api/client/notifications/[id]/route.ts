import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PUT: Mark a single notification as read
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isRead } = body as { isRead?: boolean };

    const notification = await db.notification.findUnique({ where: { id } });
    if (!notification) {
      return NextResponse.json(
        { error: 'Notification introuvable' },
        { status: 404 }
      );
    }

    const updated = await db.notification.update({
      where: { id },
      data: { ...(isRead !== undefined ? { isRead } : {}) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[notification PUT] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a notification
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const notification = await db.notification.findUnique({ where: { id } });
    if (!notification) {
      return NextResponse.json(
        { error: 'Notification introuvable' },
        { status: 404 }
      );
    }

    await db.notification.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[notification DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

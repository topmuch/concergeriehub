import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendPushToHome } from '@/lib/push-sender';

// POST: Check DLC and stock alerts for a home
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { homeId } = body as { homeId: string };

    if (!homeId) {
      return NextResponse.json(
        { error: 'Le paramètre homeId est requis' },
        { status: 400 }
      );
    }

    // Verify the home exists and get ownerId
    const home = await db.home.findUnique({
      where: { id: homeId },
      select: { id: true, ownerId: true },
    });
    if (!home) {
      return NextResponse.json(
        { error: 'Maison introuvable' },
        { status: 404 }
      );
    }

    const ownerId = home.ownerId;
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);

    // 24h ago for dedup
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(now.getHours() - 24);

    let dlcAlerts = 0;
    let stockAlerts = 0;
    let totalNotifications = 0;

    // --- DLC ALERTS ---
    // Query all fresh instances with expiryDate set, within the next 3 days
    const freshInstances = await db.productInstance.findMany({
      where: {
        homeId,
        status: 'fresh',
        expiryDate: { not: null },
      },
      include: {
        product: {
          select: { id: true, name: true },
        },
      },
    });

    for (const inst of freshInstances) {
      if (!inst.expiryDate) continue;

      const expiry = new Date(inst.expiryDate);
      const diffMs = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Only consider instances expiring within 3 days or already expired today
      if (diffDays > 3) continue;
      if (diffDays < 0) continue; // already past, ignore (should have been caught before)

      let title: string;
      let notificationBody: string;
      let pushBody: string;

      if (diffDays === 0) {
        // J-0: today - mark as expired
        await db.productInstance.update({
          where: { id: inst.id },
          data: { status: 'expired' },
        });
        title = `\u26a0\ufe0f ${inst.product.name} a expiré !`;
        notificationBody = `Le produit ${inst.product.name} a expiré aujourd'hui.`;
        pushBody = `Le produit ${inst.product.name} a expiré aujourd'hui. Pensez à le retirer.`;
      } else {
        // J-1, J-2, J-3
        const jourStr = diffDays === 1 ? 'jour' : 'jours';
        title = `\ud83d\udd50 ${inst.product.name} expire dans ${diffDays} ${jourStr}`;
        notificationBody = `Le produit ${inst.product.name} expire dans ${diffDays} ${jourStr}.`;
        pushBody = `Le produit ${inst.product.name} expire dans ${diffDays} ${jourStr}. Consommez-le rapidement !`;
      }

      // Dedup: check if same title exists in last 24h
      const existingNotif = await db.notification.findFirst({
        where: {
          userId: ownerId,
          title,
          createdAt: { gte: twentyFourHoursAgo },
        },
      });

      if (!existingNotif) {
        await db.notification.create({
          data: {
            userId: ownerId,
            type: 'dlc_alert',
            title,
            body: notificationBody,
            dataJson: JSON.stringify({
              homeId,
              productId: inst.product.id,
              instanceId: inst.id,
              type: 'dlc_alert',
              daysUntilExpiry: diffDays,
            }),
          },
        });

        await sendPushToHome(homeId, {
          title,
          body: pushBody,
          tag: `dlc-${inst.product.id}`,
          data: {
            type: 'dlc_alert',
            productId: inst.product.id,
          },
        });

        totalNotifications++;
      }

      dlcAlerts++;
    }

    // --- STOCK ALERTS ---
    // Query all Products where currentStock <= minStockThreshold
    // SQLite doesn't support field comparisons, so we filter in JS
    const allProducts = await db.product.findMany({
      where: { homeId },
    });

    const stockProducts = allProducts.filter(
      (p) => p.currentStock <= p.minStockThreshold
    );

    for (const product of stockProducts) {
      // Set isOnShoppingList = true
      if (!product.isOnShoppingList) {
        await db.product.update({
          where: { id: product.id },
          data: { isOnShoppingList: true },
        });
      }

      const title = `\ud83d\udce6 ${product.name} stock bas (${product.currentStock}/${product.minStockThreshold})`;
      const notificationBody = `Le stock de ${product.name} est bas (${product.currentStock}/${product.minStockThreshold}). Ajoutez-le à votre liste de courses.`;
      const pushBody = `Le stock de ${product.name} est bas. Ajoutez-le à votre liste de courses !`;

      // Dedup: check if same title exists in last 24h
      const existingNotif = await db.notification.findFirst({
        where: {
          userId: ownerId,
          title,
          createdAt: { gte: twentyFourHoursAgo },
        },
      });

      if (!existingNotif) {
        await db.notification.create({
          data: {
            userId: ownerId,
            type: 'stock_alert',
            title,
            body: notificationBody,
            dataJson: JSON.stringify({
              homeId,
              productId: product.id,
              type: 'stock_alert',
              currentStock: product.currentStock,
              minStockThreshold: product.minStockThreshold,
            }),
          },
        });

        await sendPushToHome(homeId, {
          title,
          body: pushBody,
          tag: `stock-${product.id}`,
          data: {
            type: 'stock_alert',
            productId: product.id,
          },
        });

        totalNotifications++;
      }

      stockAlerts++;
    }

    return NextResponse.json({
      dlcAlerts,
      stockAlerts,
      notifications: totalNotifications,
    });
  } catch (error) {
    console.error('[check-alerts POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

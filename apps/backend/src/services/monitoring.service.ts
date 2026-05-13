import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import * as Email from '../utils/email';

// ─── Thresholds ────────────────────────────────────────
// Notify at 90, 60, 30, and 7 days before expiry

const THRESHOLDS = [
  { days: 90, type: 'CERT_EXPIRY_90' as const },
  { days: 60, type: 'CERT_EXPIRY_60' as const },
  { days: 30, type: 'CERT_EXPIRY_30' as const },
  { days:  7, type: 'CERT_EXPIRY_7'  as const },
];

// ─── Threshold window ─────────────────────────────────
// How many days either side of a threshold we still fire the notification.
// A window of 2 means: if the server was down for up to 2 days and missed
// the exact threshold night, the next boot will still catch and send it.
const THRESHOLD_WINDOW_DAYS = 2;

// ─── Run expiry check ─────────────────────────────────

export const runExpiryCheck = async (): Promise<{ checked: number; notified: number }> => {
  logger.info('[Monitor] Running certificate expiry check…');

  // Find all active (non-revoked) certificates expiring within 90 days
  // Add window so catch-up runs on boot can pick up anything missed
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 90 + THRESHOLD_WINDOW_DAYS);

  const certs = await prisma.certificate.findMany({
    where: {
      revokedAt: null,
      expiresAt: { lte: cutoff },
    },
    include: {
      order: {
        include: {
          user:    { select: { id: true, email: true, firstName: true } },
          product: { select: { name: true } },
        },
      },
    },
  });

  let notified = 0;

  for (const cert of certs) {
    const now       = new Date();
    const expiresAt = new Date(cert.expiresAt);
    const daysLeft  = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const userId    = cert.order.user.id;

    for (const { days, type } of THRESHOLDS) {
      // ── Widened window check ───────────────────────────
      // Fire if daysLeft is within the threshold window.
      // e.g. for 30-day threshold with window=2: fires if daysLeft is 28–30.
      // This ensures missed runs (server downtime) are caught on next boot.
      const withinWindow = daysLeft <= days && daysLeft >= days - THRESHOLD_WINDOW_DAYS;
      if (!withinWindow) continue;

      // ── Dedup check ────────────────────────────────────
      // Unique dedup key embedded in title — prevents duplicate alerts
      // for the same cert+threshold even across retries and catch-up runs.
      const dedupKey = `[${cert.id.slice(0, 8)}]`;

      const alreadySent = await prisma.notification.findFirst({
        where: { userId, type, title: { contains: dedupKey } },
      });
      if (alreadySent) continue;

      // ── Build notification ─────────────────────────────
      const title =
        (daysLeft <= 7
          ? `🚨 Certificate Expiring in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}!`
          : `⚠️ Certificate Expires in ${daysLeft} Days`) + ` ${dedupKey}`;

      const message = `Your ${cert.order.product.name} certificate for "${cert.commonName}" expires on ${
        expiresAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
      }. Renew now to avoid service interruption.`;

      // ── Save in-app notification ───────────────────────
      await prisma.notification.create({
        data: {
          userId,
          type,
          channel: 'IN_APP',
          title,
          message,
          metadata: {
            certId:     cert.id,
            orderId:    cert.orderId,
            commonName: cert.commonName,
            daysLeft,
            expiresAt:  cert.expiresAt.toISOString(),
          },
        },
      });

      // ── Send expiry warning email ──────────────────────
      const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { email: true, firstName: true },
      });
      if (user) {
        Email.sendExpiryWarningEmail(
          user.email,
          user.firstName,
          cert.commonName,
          daysLeft,
          expiresAt,
          cert.orderId
        );
      }

      notified++;
      logger.info(
        `[Monitor] Expiry alert sent: ${cert.commonName} — ${daysLeft} days left (user ${userId})`
      );
    }
  }

  logger.info(`[Monitor] Expiry check complete. Checked: ${certs.length}, Notified: ${notified}`);
  return { checked: certs.length, notified };
};

// ─── Get monitoring summary for a user ────────────────

export const getUserMonitoringSummary = async (userId: string) => {
  const now = new Date();
  const in30  = new Date(now); in30.setDate(now.getDate() + 30);
  const in90  = new Date(now); in90.setDate(now.getDate() + 90);
  const in7   = new Date(now); in7.setDate(now.getDate() + 7);

  const [activeCertsList, expiring7, expiring30, expiring90, pendingOrders, recentExpired, allExpired] =
    await Promise.all([
      // Active certs — full list
      prisma.certificate.findMany({
        where: { order: { userId }, revokedAt: null, expiresAt: { gt: now } },
        include: { order: { select: { id: true, product: { select: { name: true } } } } },
        orderBy: { expiresAt: 'asc' },
      }),
      // Expiring within 7 days
      prisma.certificate.findMany({
        where: { order: { userId }, revokedAt: null, expiresAt: { gt: now, lte: in7 } },
        include: { order: { select: { id: true, product: { select: { name: true } } } } },
        orderBy: { expiresAt: 'asc' },
      }),
      // Expiring within 30 days
      prisma.certificate.findMany({
        where: { order: { userId }, revokedAt: null, expiresAt: { gt: now, lte: in30 } },
        include: { order: { select: { id: true, product: { select: { name: true } } } } },
        orderBy: { expiresAt: 'asc' },
      }),
      // Expiring within 90 days
      prisma.certificate.findMany({
        where: { order: { userId }, revokedAt: null, expiresAt: { gt: now, lte: in90 } },
        include: { order: { select: { id: true, product: { select: { name: true } } } } },
        orderBy: { expiresAt: 'asc' },
      }),
      // Pending orders — full details with status history
      prisma.certificateOrder.findMany({
        where: { userId, status: { in: ['PAID', 'PENDING_VALIDATION', 'VALIDATING', 'PENDING_ISSUANCE'] } },
        include: {
          product: { select: { name: true } },
          statusHistory: { orderBy: { createdAt: 'asc' } },
          domainValidations: { select: { method: true, status: true, domain: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Recently expired (last 30 days)
      prisma.certificate.findMany({
        where: {
          order: { userId },
          expiresAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), lt: now },
        },
        include: { order: { select: { id: true, product: { select: { name: true } } } } },
        orderBy: { expiresAt: 'desc' },
        take: 5,
      }),
      // All expired certs (no time limit)
      prisma.certificate.findMany({
        where: { order: { userId }, expiresAt: { lt: now } },
        include: { order: { select: { id: true, product: { select: { name: true } } } } },
        orderBy: { expiresAt: 'desc' },
        take: 50,
      }),
    ]);

  const enrich = (cert: any) => {
    const daysLeft = Math.ceil((new Date(cert.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { ...cert, daysLeft };
  };

  const enrichExpired = (cert: any) => {
    const daysAgo = Math.ceil((now.getTime() - new Date(cert.expiresAt).getTime()) / (1000 * 60 * 60 * 24));
    return { ...cert, daysAgo };
  };

  return {
    activeCerts:      activeCertsList.length,
    activeCertsList:  activeCertsList.map(enrich),
    pendingOrders:    pendingOrders.length,
    pendingOrdersList: pendingOrders,
    expiring7Count:   expiring7.length,
    expiring30Count:  expiring30.length,
    expiring90Count:  expiring90.length,
    expiring7:        expiring7.map(enrich),
    expiring30:       expiring30.map(enrich),
    expiring90:       expiring90.map(enrich),
    recentExpired:    recentExpired.map(enrich),
    allExpired:       allExpired.map(enrichExpired),
  };
};

// ─── Admin: platform-wide monitoring overview ─────────

export const getAdminMonitoringOverview = async () => {
  const now  = new Date();
  const in30 = new Date(now); in30.setDate(now.getDate() + 30);
  const in7  = new Date(now); in7.setDate(now.getDate() + 7);

  const [totalActive, expiring30, expiring7, expired] = await Promise.all([
    prisma.certificate.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    prisma.certificate.count({ where: { revokedAt: null, expiresAt: { gt: now, lte: in30 } } }),
    prisma.certificate.count({ where: { revokedAt: null, expiresAt: { gt: now, lte: in7  } } }),
    prisma.certificate.count({ where: { expiresAt: { lt: now } } }),
  ]);

  return { totalActive, expiring30, expiring7, expired };
};

import { runExpiryCheck } from '../services/monitoring.service';
import { pollCAStatus, submitToCA } from '../services/issuance.service';
import { prisma } from './prisma';
import { logger } from '../utils/logger';

let timer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Calculate ms until next midnight ────────────────
const msUntilMidnight = (): number => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
};

const runJob = async () => {
  try {
    logger.info('[Scheduler] Running certificate expiry check...');
    const result = await runExpiryCheck();
    logger.info(`[Scheduler] Done — checked: ${result.checked}, notified: ${result.notified}`);
  } catch (err) {
    logger.error('[Scheduler] Expiry check failed:', err);
  }
};

// ─── CA Status Poller ─────────────────────────────────
// Two jobs in one:
// 1. Poll PENDING_ISSUANCE orders that have a caOrderId — check if cert is issued
// 2. Retry PENDING_ISSUANCE orders with no caOrderId that are past their backoff window

const runCAPoller = async () => {
  try {
    const now = new Date();

    // ── Job 1: Poll orders already submitted to CA ──
    const pendingOrders = await prisma.certificateOrder.findMany({
      where: {
        status: 'PENDING_ISSUANCE',
        caOrderId: { not: null },
      },
      select: { id: true, orderNumber: true, caProvider: true, caOrderId: true },
      take: 50,
    });

    if (pendingOrders.length > 0) {
      logger.info(`[CA Poller] Polling ${pendingOrders.length} pending order(s)...`);
      let issued = 0;
      for (const order of pendingOrders) {
        try {
          const status = await pollCAStatus(order.id);
          if (status.status === 'issued') issued++;
        } catch (err: any) {
          logger.debug(`[CA Poller] Order ${order.orderNumber}: ${err.message}`);
        }
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 300));
      }
      if (issued > 0) logger.info(`[CA Poller] ${issued} certificate(s) issued this round.`);
    }

    // ── Job 2: Retry failed submissions past their backoff ──
    const retryOrders = await prisma.certificateOrder.findMany({
      where: {
        status: 'PENDING_ISSUANCE',
        caOrderId: null,          // Not yet submitted
        caAttempts: { gt: 0 },   // Has been tried before
        caLastError: { not: null },
        OR: [
          { caRetryAfter: null },                    // No backoff set
          { caRetryAfter: { lte: now } },            // Backoff expired
        ],
      },
      select: { id: true, orderNumber: true, caAttempts: true },
      take: 10,
    });

    if (retryOrders.length > 0) {
      logger.info(`[CA Poller] Retrying ${retryOrders.length} failed submission(s)...`);
      for (const order of retryOrders) {
        try {
          logger.info(`[CA Poller] Retrying order ${order.orderNumber} (prev attempts: ${order.caAttempts})`);
          await submitToCA(order.id);
        } catch (err: any) {
          logger.warn(`[CA Poller] Retry failed for ${order.orderNumber}: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }

  } catch (err) {
    logger.error('[CA Poller] Failed:', err);
  }
};

export const startScheduler = () => {
  if (timer) return;

  const msToMidnight = msUntilMidnight();
  const hoursUntil   = Math.round(msToMidnight / 1000 / 60 / 60 * 10) / 10;

  logger.info(`[Scheduler] Starting — first run at midnight (in ~${hoursUntil}h), then every 24h`);

  // Run expiry check once 30s after boot
  setTimeout(runJob, 30_000);

  // Schedule daily at midnight
  setTimeout(() => {
    runJob();
    timer = setInterval(runJob, 24 * 60 * 60 * 1000);
  }, msToMidnight);

  // Start CA status poller — every 5 minutes
  logger.info('[CA Poller] Starting — polling every 5 minutes');
  pollTimer = setInterval(runCAPoller, 5 * 60 * 1000);
  // First poll 60s after boot (give CA time to process)
  setTimeout(runCAPoller, 60_000);
};

export const stopScheduler = () => {
  if (timer)      { clearInterval(timer);      timer      = null; }
  if (pollTimer)  { clearInterval(pollTimer);   pollTimer  = null; }
};

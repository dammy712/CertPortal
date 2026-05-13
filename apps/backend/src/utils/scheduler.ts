import { runExpiryCheck } from '../services/monitoring.service';
import { pollCAStatus } from '../services/issuance.service';
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

// ─── Retry wrapper ────────────────────────────────────
// Retries a job up to `maxAttempts` times with `delayMs` between attempts.
const withRetry = async (
  jobName: string,
  fn: () => Promise<any>,
  maxAttempts = 3,
  delayMs = 5 * 60 * 1000  // 5 minutes between retries
): Promise<void> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return; // success — stop retrying
    } catch (err) {
      if (attempt < maxAttempts) {
        logger.warn(
          `[${jobName}] Attempt ${attempt}/${maxAttempts} failed — retrying in ${delayMs / 60000} min...`,
          err
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        logger.error(
          `[${jobName}] All ${maxAttempts} attempts failed. Will retry at next scheduled run.`,
          err
        );
      }
    }
  }
};

// ─── Expiry Check Job ─────────────────────────────────
const runJob = async () => {
  logger.info('[Scheduler] Running certificate expiry check...');
  await withRetry('Scheduler', async () => {
    const result = await runExpiryCheck();
    logger.info(`[Scheduler] Done — checked: ${result.checked}, notified: ${result.notified}`);
  });
};

// ─── CA Status Poller ─────────────────────────────────
// Checks orders stuck in PENDING_ISSUANCE and polls the CA for updates.
// Runs every 5 minutes. When a cert is issued the issuance service
// downloads it and notifies the user automatically.

const runCAPoller = async () => {
  try {
    const pendingOrders = await prisma.certificateOrder.findMany({
      where: {
        status: 'PENDING_ISSUANCE',
        caOrderId: { not: null },        // Only orders already submitted to CA
      },
      select: { id: true, orderNumber: true, caProvider: true, caOrderId: true },
      take: 50,                          // Process at most 50 at a time
    });

    if (pendingOrders.length === 0) return;

    logger.info(`[CA Poller] Checking ${pendingOrders.length} pending order(s)...`);

    let issued = 0;
    for (const order of pendingOrders) {
      try {
        const status = await pollCAStatus(order.id);
        if (status.status === 'issued') issued++;
      } catch (err: any) {
        // Log per-order errors quietly — don't crash the whole job
        logger.debug(`[CA Poller] Order ${order.orderNumber}: ${err.message}`);
      }
    }

    if (issued > 0) {
      logger.info(`[CA Poller] ${issued} certificate(s) issued this round.`);
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

  // ── Boot-time catch-up run (30s after start) ──────────
  // Runs immediately on every boot so missed notifications
  // from server downtime are caught and sent right away.
  setTimeout(runJob, 30_000);

  // ── Daily midnight run ─────────────────────────────────
  setTimeout(() => {
    runJob();
    timer = setInterval(runJob, 24 * 60 * 60 * 1000);
  }, msToMidnight);

  // ── CA status poller — every 5 minutes ────────────────
  logger.info('[CA Poller] Starting — polling every 5 minutes');
  pollTimer = setInterval(runCAPoller, 5 * 60 * 1000);
  // First poll 60s after boot (give CA time to process)
  setTimeout(runCAPoller, 60_000);
};

export const stopScheduler = () => {
  if (timer)      { clearInterval(timer);      timer      = null; }
  if (pollTimer)  { clearInterval(pollTimer);   pollTimer  = null; }
};

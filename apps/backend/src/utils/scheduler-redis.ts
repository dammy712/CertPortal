/**
 * scheduler.ts — Reliable job scheduler with Redis-based distributed locking.
 *
 * Redis locking ensures only ONE instance runs the expiry job at a time,
 * even when multiple backend instances are running (horizontal scaling).
 *
 * If Redis is unavailable, the scheduler falls back to running without
 * locking — safe for single-instance deployments.
 */

import { runExpiryCheck } from '../services/monitoring.service';
import { pollCAStatus } from '../services/issuance.service';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { createClient } from 'redis';

let timer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Redis client (optional) ──────────────────────────
let redisClient: ReturnType<typeof createClient> | null = null;

const getRedisClient = async () => {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const client = createClient({ url });
    client.on('error', (err) => logger.warn('[Scheduler] Redis error:', err.message));
    await client.connect();
    redisClient = client;
    logger.info('[Scheduler] Redis connected — distributed job locking enabled');
    return client;
  } catch (err: any) {
    logger.warn('[Scheduler] Redis unavailable — running without job locking:', err.message);
    return null;
  }
};

// ─── Distributed lock ─────────────────────────────────
// Uses Redis SET NX EX to acquire a lock.
// Only one instance can hold the lock at a time.
const LOCK_KEY = 'certportal:scheduler:expiry-check:lock';
const LOCK_TTL = 10 * 60; // 10 minutes max — prevents stale locks

const acquireLock = async (): Promise<boolean> => {
  const client = await getRedisClient();
  if (!client) return true; // No Redis — allow run (single instance)
  try {
    const result = await client.set(LOCK_KEY, '1', { NX: true, EX: LOCK_TTL });
    return result === 'OK';
  } catch {
    return true; // Redis error — allow run
  }
};

const releaseLock = async (): Promise<void> => {
  const client = await getRedisClient();
  if (!client) return;
  try { await client.del(LOCK_KEY); } catch {}
};

// ─── Retry wrapper ────────────────────────────────────
const withRetry = async (
  jobName: string,
  fn: () => Promise<any>,
  maxAttempts = 3,
  delayMs = 5 * 60 * 1000
): Promise<void> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (attempt < maxAttempts) {
        logger.warn(`[${jobName}] Attempt ${attempt}/${maxAttempts} failed — retrying in ${delayMs / 60000}min...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        logger.error(`[${jobName}] All ${maxAttempts} attempts failed.`, err);
      }
    }
  }
};

// ─── Expiry check job ─────────────────────────────────
const runJob = async () => {
  const locked = await acquireLock();
  if (!locked) {
    logger.info('[Scheduler] Another instance is running the expiry check — skipping.');
    return;
  }

  try {
    logger.info('[Scheduler] Running certificate expiry check...');
    await withRetry('Scheduler', async () => {
      const result = await runExpiryCheck();
      logger.info(`[Scheduler] Done — checked: ${result.checked}, notified: ${result.notified}`);
    });
  } finally {
    await releaseLock();
  }
};

// ─── CA Status Poller ─────────────────────────────────
const runCAPoller = async () => {
  try {
    const pendingOrders = await prisma.certificateOrder.findMany({
      where: { status: 'PENDING_ISSUANCE', caOrderId: { not: null } },
      select: { id: true, orderNumber: true },
      take: 50,
    });

    if (pendingOrders.length === 0) return;

    logger.info(`[CA Poller] Checking ${pendingOrders.length} pending order(s)...`);
    let issued = 0;
    for (const order of pendingOrders) {
      try {
        const status = await pollCAStatus(order.id);
        if (status.status === 'issued') issued++;
      } catch (err: any) {
        logger.debug(`[CA Poller] Order ${order.orderNumber}: ${err.message}`);
      }
    }
    if (issued > 0) logger.info(`[CA Poller] ${issued} certificate(s) issued this round.`);
  } catch (err) {
    logger.error('[CA Poller] Failed:', err);
  }
};

// ─── Calculate ms until midnight ─────────────────────
const msUntilMidnight = (): number => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
};

// ─── Start scheduler ──────────────────────────────────
export const startScheduler = () => {
  if (timer) return;

  const msToMidnight = msUntilMidnight();
  const hoursUntil = Math.round(msToMidnight / 1000 / 60 / 60 * 10) / 10;

  logger.info(`[Scheduler] Starting — first run at midnight (in ~${hoursUntil}h), then every 24h`);

  // Boot-time catch-up run (30s after start)
  setTimeout(runJob, 30_000);

  // Daily midnight run
  setTimeout(() => {
    runJob();
    timer = setInterval(runJob, 24 * 60 * 60 * 1000);
  }, msToMidnight);

  // CA poller — every 5 minutes
  logger.info('[CA Poller] Starting — polling every 5 minutes');
  pollTimer = setInterval(runCAPoller, 5 * 60 * 1000);
  setTimeout(runCAPoller, 60_000);
};

export const stopScheduler = () => {
  if (timer)     { clearInterval(timer);     timer     = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (redisClient) { redisClient.quit().catch(() => {}); redisClient = null; }
};

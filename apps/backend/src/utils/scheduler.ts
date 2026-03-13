import { runExpiryCheck } from '../services/monitoring.service';
import { logger } from '../utils/logger';

let timer: ReturnType<typeof setInterval> | null = null;

// ─── Calculate ms until next midnight ────────────────
const msUntilMidnight = (): number => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // next midnight
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

export const startScheduler = () => {
  if (timer) return;

  const msToMidnight = msUntilMidnight();
  const hoursUntil   = Math.round(msToMidnight / 1000 / 60 / 60 * 10) / 10;

  logger.info(`[Scheduler] Starting — first run at midnight (in ~${hoursUntil}h), then every 24h`);

  // Run once 30s after boot (to catch anything missed while server was down)
  setTimeout(runJob, 30_000);

  // Schedule daily at midnight
  setTimeout(() => {
    runJob(); // run at first midnight
    timer = setInterval(runJob, 24 * 60 * 60 * 1000); // then every 24h
  }, msToMidnight);
};

export const stopScheduler = () => {
  if (timer) { clearInterval(timer); timer = null; }
};

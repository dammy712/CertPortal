import { Request, Response, NextFunction } from 'express';
import * as MonitoringService from '../services/monitoring.service';
import { sendSuccess } from '../utils/response';

// GET /api/v1/monitoring/summary — user's cert monitoring dashboard
export const getUserSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await MonitoringService.getUserMonitoringSummary(req.user!.userId);
    return sendSuccess(res, result, 'Monitoring summary retrieved.');
  } catch (e) { next(e); }
};

// GET /api/v1/monitoring/admin — platform-wide overview (admin only)
export const getAdminOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await MonitoringService.getAdminMonitoringOverview();
    return sendSuccess(res, result, 'Admin monitoring overview retrieved.');
  } catch (e) { next(e); }
};

// POST /api/v1/monitoring/run-check — manually trigger expiry check (admin only)
export const runCheck = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await MonitoringService.runExpiryCheck();
    return sendSuccess(res, result, 'Expiry check completed.');
  } catch (e) { next(e); }
};

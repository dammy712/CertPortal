import { Router, Request, Response, NextFunction } from 'express';
import * as MonitoringController from '../controllers/monitoring.controller';
import { authenticate } from '../middleware/auth.middleware';
import { ForbiddenError } from '../utils/errors';

const router = Router();
router.use(authenticate);

// Customer
router.get('/summary', MonitoringController.getUserSummary);

// Admin only
const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
    return next(new ForbiddenError('Admin access required.'));
  }
  next();
};

router.get('/admin',       requireAdmin, MonitoringController.getAdminOverview);
router.post('/run-check',  requireAdmin, MonitoringController.runCheck);

export default router;

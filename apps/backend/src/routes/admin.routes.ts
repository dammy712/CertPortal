import { Router, Request, Response, NextFunction } from 'express';
import * as AdminController from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { ForbiddenError } from '../utils/errors';

const router = Router();
router.use(authenticate);

// Admin role guard
const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
    return next(new ForbiddenError('Admin access required.'));
  }
  next();
};

// Super admin only guard
const requireSuperAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user!.role !== 'SUPER_ADMIN') {
    return next(new ForbiddenError('Super admin access required.'));
  }
  next();
};

router.use(requireAdmin);

// Dashboard
router.get('/stats',                          AdminController.getDashboardStats);

// Users
router.get('/users',                          AdminController.getUsers);
router.get('/users/:id',                      AdminController.getUserDetail);
router.patch('/users/:id/status',             AdminController.updateUserStatus);
router.patch('/users/:id/role',               requireSuperAdmin, AdminController.updateUserRole);
router.post('/users/:id/wallet/adjust',       AdminController.adjustWallet);

// KYC
router.get('/kyc',                            AdminController.getPendingKyc);
router.get('/kyc/:id',                        AdminController.getKycFile);
router.get('/kyc/:id/serve',                  AdminController.serveKycFile);
router.post('/kyc/:id/review',                AdminController.reviewKycDocument);

// Orders
router.get('/orders',                         AdminController.getOrders);
router.get('/orders/:id',                     AdminController.getOrderDetail);
router.patch('/orders/:id/status',            AdminController.updateOrderStatus);
router.post('/orders/:id/issue',              AdminController.adminIssueOrder);

// Certificates
router.get('/certificates',                   AdminController.getAdminCertificates);
router.post('/certificates/:id/revoke',       AdminController.revokeCertificate);

// Products (admin sees inactive too)
router.get('/products', async (req, res, next) => {
  try {
    const { listProducts } = await import('../services/products.service');
    const products = await listProducts(true);
    const { sendSuccess } = await import('../utils/response');
    return sendSuccess(res, products, 'Products retrieved.');
  } catch (e) { next(e); }
});

// Analytics (Module 17)
router.get('/analytics/revenue',              AdminController.getRevenueChart);
router.get('/analytics/products',             AdminController.getProductBreakdown);
router.get('/analytics/order-status',         AdminController.getOrderStatusBreakdown);
router.get('/analytics/growth',               AdminController.getGrowthStats);

// Audit
router.get('/audit-logs',                     AdminController.getAuditLogs);

export default router;

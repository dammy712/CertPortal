import { Router } from 'express';
import * as IssuanceController from '../controllers/issuance.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

// Customer
router.get('/', IssuanceController.listCertificates);
router.get('/order/:orderId', IssuanceController.getCertificate);
router.get('/:id/download', IssuanceController.downloadCertificate);

// Admin
router.post('/admin/issue/:orderId', requireAdmin, IssuanceController.adminIssueCertificate);

export default router;

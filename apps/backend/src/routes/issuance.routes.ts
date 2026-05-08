import { Router } from 'express';
import * as IssuanceController from '../controllers/issuance.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { requireKyc } from '../middleware/requireKyc.middleware';

const router = Router();
router.use(authenticate);
router.use(requireKyc);

// Customer
router.get('/', IssuanceController.listCertificates);
router.get('/order/:orderId', IssuanceController.getCertificate);
router.get('/:id/download', IssuanceController.downloadCertificate);

// Customer-triggered CA status check — polls Certum immediately for an order
router.post('/check-status/:orderId', IssuanceController.checkCAStatus);

// Admin
router.post('/admin/issue/:orderId', requireAdmin, IssuanceController.adminIssueCertificate);

export default router;

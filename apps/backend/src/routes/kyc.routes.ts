import { Router } from 'express';
import * as KycController from '../controllers/kyc.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// ─── Customer Routes ──────────────────────────────────
router.get('/status', KycController.getKycStatus);
router.post('/upload', KycController.uploadDocument);
router.get('/documents/:id/url', KycController.getDocumentUrl);
router.delete('/documents/:id', KycController.deleteDocument);

// ─── Admin Routes ─────────────────────────────────────
router.get('/admin/queue', requireAdmin, KycController.getAdminKycQueue);
router.post('/admin/documents/:id/review', requireAdmin, KycController.reviewDocument);

export default router;

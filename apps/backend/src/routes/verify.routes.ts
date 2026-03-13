import { Router } from 'express';
import * as VerifyController from '../controllers/verify.controller';

const router = Router();

// Public — no authentication required
router.get('/',          VerifyController.lookupCertificate);  // GET /api/v1/verify?q=<serial|thumbprint|domain>
router.get('/:serial',   VerifyController.lookupCertificate);  // GET /api/v1/verify/<serial>

export default router;

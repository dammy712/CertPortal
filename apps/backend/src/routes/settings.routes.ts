import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import * as SettingsController from '../controllers/settings.controller';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/invoice',  SettingsController.getInvoiceSettings);
router.put('/invoice',  SettingsController.saveInvoiceSettings);

export default router;

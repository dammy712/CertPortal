import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import * as SettingsController from '../controllers/settings.controller';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/invoice',  SettingsController.getInvoiceSettings);
router.put('/invoice',  SettingsController.saveInvoiceSettings);

// Pricing / exchange rate settings
router.get('/pricing',  SettingsController.getPricingSettings);
router.put('/pricing',  SettingsController.savePricingSettings);

// Product price management (update individual product prices)
router.put('/products/:productId/prices', SettingsController.updateProductPrices);

export default router;

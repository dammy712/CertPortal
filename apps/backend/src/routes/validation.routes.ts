import { Router } from 'express';
import * as ValidationController from '../controllers/validation.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

// Customer routes
router.post('/initialize', ValidationController.initializeValidation);
router.get('/order/:orderId', ValidationController.getValidations);
router.post('/:id/check', ValidationController.checkValidation);

// Admin routes
router.post('/:id/admin-validate', requireAdmin, ValidationController.adminValidateDomain);

export default router;

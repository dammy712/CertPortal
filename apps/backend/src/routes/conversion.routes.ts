import { Router } from 'express';
import * as ConversionController from '../controllers/conversion.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Auth required — conversion is for logged-in users only
router.use(authenticate);

router.post('/',        ConversionController.convert);
router.post('/inspect', ConversionController.inspect);

export default router;

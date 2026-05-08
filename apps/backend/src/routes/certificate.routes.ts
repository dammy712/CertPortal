import { Router } from 'express';
import * as CertController from '../controllers/certificate.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireKyc } from '../middleware/requireKyc.middleware';

const router = Router();

// Public — product catalog
router.get('/products', CertController.getProducts);
router.get('/products/:id', CertController.getProductById);

// Protected routes
router.use(authenticate);
router.use(requireKyc);

// CSR decoder
router.post('/decode-csr', CertController.decodeCSR);

// Orders
router.post('/orders', CertController.createOrder);
router.get('/orders', CertController.getOrders);
router.get('/orders/:id', CertController.getOrderById);
router.post('/orders/:id/cancel', CertController.cancelOrder);

export default router;

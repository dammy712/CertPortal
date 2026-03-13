import express, { Router } from 'express';
import * as WalletController from '../controllers/wallet.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Paystack webhook — public, needs raw body for HMAC verification
router.post('/webhook', express.raw({ type: 'application/json' }), WalletController.handleWebhook);

// All wallet routes require authentication
router.use(authenticate);

// Customer routes
router.get('/', WalletController.getWallet);
router.get('/transactions', WalletController.getTransactions);
router.post('/fund', WalletController.initializePayment);
router.get('/verify/:reference', WalletController.verifyPayment);

// Invoice & statement (Module 21)
router.get('/invoice/:transactionId', WalletController.getInvoice);
router.get('/statement', WalletController.getStatement);

// Admin routes
router.post('/admin/adjust', requireAdmin, WalletController.adminAdjustWallet);

export default router;

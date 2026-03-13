import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as AuthController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
  totpValidator,
} from '../validators/auth.validators';

const router = Router();

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10'),
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Public Routes ────────────────────────────────────

router.get('/status', (_req, res) => {
  res.json({ success: true, message: 'Auth service ready', timestamp: new Date().toISOString() });
});

router.post('/register', authLimiter, registerValidator, validate, AuthController.register);
router.get('/verify-email/:token', AuthController.verifyEmail);
router.post('/login', authLimiter, loginValidator, validate, AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.post('/forgot-password', authLimiter, forgotPasswordValidator, validate, AuthController.forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidator, validate, AuthController.resetPassword);

// ─── Protected Routes ─────────────────────────────────

router.post('/logout', authenticate, AuthController.logout);
router.get('/me', authenticate, AuthController.getMe);
router.post('/change-password', authenticate, changePasswordValidator, validate, AuthController.changePassword);
router.post('/2fa/setup', authenticate, AuthController.setup2FA);
router.post('/2fa/verify', authenticate, totpValidator, validate, AuthController.verify2FA);
router.post('/2fa/disable', authenticate, totpValidator, validate, AuthController.disable2FA);

export default router;

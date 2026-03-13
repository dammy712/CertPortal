import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

// Route imports
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import profileRoutes from './routes/profile.routes';
import adminRoutes from './routes/admin.routes';
import productsRoutes from './routes/products.routes';
import conversionRoutes from './routes/conversion.routes';
import verifyRoutes      from './routes/verify.routes';
import settingsRoutes    from './routes/settings.routes';
import monitoringRoutes from './routes/monitoring.routes';
import walletRoutes from './routes/wallet.routes';
import certificateRoutes from './routes/certificate.routes';
import kycRoutes from './routes/kyc.routes';
import validationRoutes from './routes/validation.routes';
import issuanceRoutes from './routes/issuance.routes';
import notificationRoutes from './routes/notification.routes';

const app: Application = express();

// ── Security Headers ──────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// ── CORS ─────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate Limiting ─────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 500 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production', // disable entirely in dev
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', globalLimiter);

// ── Body Parsing ──────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// ── Logging ───────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.http(message.trim()) },
  }));
}

// ── Health Check ──────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: process.env.APP_NAME,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/convert',    conversionRoutes);
app.use('/api/v1/verify',     verifyRoutes);       // Public — no auth
app.use('/api/v1/settings',   settingsRoutes);     // Admin only
app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/certificates', certificateRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/validations', validationRoutes);
app.use('/api/v1/issued-certificates', issuanceRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// ── Error Handling ────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;

import 'dotenv/config';
import app from './app';
import { logger } from './utils/logger';
import { prisma } from './utils/prisma';
import { startScheduler, stopScheduler } from './utils/scheduler';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    // Test DB connection
    await prisma.$connect();
    logger.info('✅ Database connected');

    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📖 Environment: ${process.env.NODE_ENV}`);
    });

    // Start certificate expiry scheduler
    startScheduler();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      stopScheduler();
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();

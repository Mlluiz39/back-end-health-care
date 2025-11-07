import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';

// Routes
import authRoutes from './routes/auth.routes';
import parentRoutes from './routes/parent.routes';
import medicationRoutes from './routes/medication.routes';
import appointmentRoutes from './routes/appointment.routes';
import documentRoutes from './routes/document.routes';
import familyRoutes from './routes/family.routes';
import notificationRoutes from './routes/notification.routes';

// Middlewares
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { globalRateLimiter, loginRateLimiter } from './middlewares/rate-limit.middleware';

// Utils
import { validateEnv, getEnv } from './utils/env';
import { logger } from './utils/logger';

// Jobs
import { startCronJobs, stopCronJobs } from './jobs/scheduler';

// Load environment variables
dotenv.config();

// Validate environment variables
try {
  validateEnv();
} catch (error) {
  logger.error('Failed to validate environment variables', error as Error);
  process.exit(1);
}

const env = getEnv();
const app: Application = express();
const PORT = env.PORT;

// Supabase client
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(globalRateLimiter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Health Care API',
    environment: env.NODE_ENV,
    version: '1.0.0',
  });
});

// API Routes
app.use('/api/auth', loginRateLimiter, authRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

// Graceful shutdown
let server: ReturnType<typeof app.listen> | null = null;

const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');

      // Stop cron jobs
      stopCronJobs();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Start server
server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`, {
    environment: env.NODE_ENV,
    port: PORT,
  });

  // Start cron jobs
  if (env.ENABLE_CRON_JOBS) {
    startCronJobs();
  }
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection', reason as Error);
  gracefulShutdown('unhandledRejection');
});

export default app;

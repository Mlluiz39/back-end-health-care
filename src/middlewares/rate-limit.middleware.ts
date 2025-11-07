import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../utils/env';

// Lazy initialization para evitar carregar env antes do dotenv.config()
let globalRateLimiterInstance: ReturnType<typeof rateLimit> | null = null;
let loginRateLimiterInstance: ReturnType<typeof rateLimit> | null = null;
let uploadRateLimiterInstance: ReturnType<typeof rateLimit> | null = null;

function getGlobalRateLimiter() {
  if (!globalRateLimiterInstance) {
    const env = getEnv();
    globalRateLimiterInstance = rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX_REQUESTS,
      message: {
        error: 'Too many requests',
        message: 'Muitas requisições. Tente novamente mais tarde.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }
  return globalRateLimiterInstance;
}

function getLoginRateLimiter() {
  if (!loginRateLimiterInstance) {
    const env = getEnv();
    loginRateLimiterInstance = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: env.RATE_LIMIT_LOGIN_MAX,
      message: {
        error: 'Too many login attempts',
        message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
    });
  }
  return loginRateLimiterInstance;
}

function getUploadRateLimiter() {
  if (!uploadRateLimiterInstance) {
    const env = getEnv();
    uploadRateLimiterInstance = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hora
      max: env.RATE_LIMIT_UPLOAD_MAX,
      message: {
        error: 'Too many uploads',
        message: 'Limite de uploads excedido. Tente novamente em 1 hora.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }
  return uploadRateLimiterInstance;
}

/**
 * Rate limiter global
 * Usa lazy getter para garantir que env está carregado
 */
export const globalRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  getGlobalRateLimiter()(req, res, next);
};

/**
 * Rate limiter para login
 * Usa lazy getter para garantir que env está carregado
 */
export const loginRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  getLoginRateLimiter()(req, res, next);
};

/**
 * Rate limiter para uploads
 * Usa lazy getter para garantir que env está carregado
 */
export const uploadRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  getUploadRateLimiter()(req, res, next);
};

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError | ZodError | Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    logger.warn('Validation error', {
      path: req.path,
      method: req.method,
      errors: err.errors,
    });

    res.status(400).json({
      error: 'Validation error',
      message: err.errors[0]?.message || 'Invalid input',
      details: process.env.NODE_ENV === 'development' ? err.errors : undefined,
    });
    return;
  }

  // Custom application errors
  const appError = err as AppError;
  const statusCode = appError.statusCode || 500;
  const message = appError.message || 'Internal server error';

  // Log error
  const authReq = req as { user?: { id?: string } };
  logger.error('Request error', appError, {
    path: req.path,
    method: req.method,
    statusCode,
    userId: authReq.user?.id,
  });

  // Send error response
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : message,
    message: process.env.NODE_ENV === 'development' ? message : undefined,
    ...(process.env.NODE_ENV === 'development' && {
      stack: appError.stack,
    }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
  });

  res.status(404).json({
    error: 'Route not found',
    path: req.path,
  });
}

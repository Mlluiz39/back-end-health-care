import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),

  // VAPID (opcional - apenas se push notifications estiverem habilitadas)
  VAPID_SUBJECT: z.string().email().or(z.string().startsWith('mailto:')).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),

  // File Upload
  MAX_FILE_SIZE: z.string().transform(Number).default('10485760'),

  // Cron Jobs
  ENABLE_CRON_JOBS: z
    .string()
    .transform(val => val === 'true')
    .default('true'),
  MEDICATION_REMINDER_CRON: z.string().default('*/5 * * * *'),
  APPOINTMENT_REMINDER_CRON: z.string().default('0 8 * * *'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  RATE_LIMIT_LOGIN_MAX: z.string().transform(Number).default('5'),
  RATE_LIMIT_UPLOAD_MAX: z.string().transform(Number).default('10'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function validateEnv(): Env {
  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(
        `❌ Variáveis de ambiente inválidas:\n${missingVars.join('\n')}\n\n` +
          'Por favor, verifique seu arquivo .env'
      );
    }
    throw error;
  }
}

export function getEnv(): Env {
  if (!env) {
    env = validateEnv();
  }
  return env;
}

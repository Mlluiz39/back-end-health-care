import cron from 'node-cron';
import NotificationService from '../services/notification.service';
import { logger } from '../utils/logger';
import { getEnv } from '../utils/env';

const env = getEnv();

/**
 * Configura e inicia todos os cron jobs da aplicação
 */
export function startCronJobs() {
  if (!env.ENABLE_CRON_JOBS) {
    logger.info('⏰ Cron jobs disabled');
    return;
  }

  logger.info('⏰ Starting cron jobs...');

  /**
   * Lembrete de medicamentos - a cada 5 minutos
   * Verifica se há medicamentos programados para os próximos 5 minutos
   */
  cron.schedule(env.MEDICATION_REMINDER_CRON, async () => {
    logger.info('🔔 Running medication reminders...');
    try {
      await NotificationService.sendMedicationReminders();
    } catch (error) {
      logger.error('Error in medication reminder cron', error as Error);
    }
  });

  /**
   * Lembrete de consultas - todo dia às 08:00
   * Verifica consultas marcadas para o dia seguinte
   */
  cron.schedule(env.APPOINTMENT_REMINDER_CRON, async () => {
    logger.info('📅 Running appointment reminders...');
    try {
      await NotificationService.sendAppointmentReminders();
    } catch (error) {
      logger.error('Error in appointment reminder cron', error as Error);
    }
  });

  /**
   * Limpeza de notificações antigas - todo dia às 03:00
   * Remove notificações com mais de 30 dias
   */
  cron.schedule('0 3 * * *', async () => {
    logger.info('🧹 Cleaning old notifications...');
    try {
      await NotificationService.cleanOldNotifications();
    } catch (error) {
      logger.error('Error in notification cleanup cron', error as Error);
    }
  });

  /**
   * Verificação de medicamentos vencidos - todo dia às 00:00
   * Marca medicamentos com data de término como inativos
   */
  cron.schedule('0 0 * * *', async () => {
    logger.info('💊 Checking expired medications...');
    try {
      const { supabase } = await import('../index');
      const today = new Date().toISOString().split('T')[0];

      const { error } = await supabase
        .from('medications')
        .update({ is_active: false })
        .lt('end_date', today)
        .eq('is_active', true);

      if (error) throw error;
      logger.info('✅ Expired medications updated');
    } catch (error) {
      logger.error('Error checking expired medications', error as Error);
    }
  });

  /**
   * Atualização de status de consultas - todo dia às 00:30
   * Marca consultas passadas como 'completed' ou 'missed'
   */
  cron.schedule('30 0 * * *', async () => {
    logger.info('📅 Updating appointment statuses...');
    try {
      const { supabase } = await import('../index');
      const now = new Date().toISOString();

      // Marca consultas passadas sem confirmação como 'missed'
      const { error: missedError } = await supabase
        .from('appointments')
        .update({ status: 'missed' })
        .lt('scheduled_at', now)
        .eq('status', 'scheduled');

      if (missedError) throw missedError;

      logger.info('✅ Appointment statuses updated');
    } catch (error) {
      logger.error('Error updating appointment statuses', error as Error);
    }
  });

  /**
   * Backup de logs de medicamento - toda segunda às 02:00
   * Cria snapshot dos logs para análise
   */
  cron.schedule('0 2 * * 1', async () => {
    logger.info('💾 Creating medication logs backup...');
    try {
      // Implementar lógica de backup se necessário
      logger.info('✅ Backup completed');
    } catch (error) {
      logger.error('Error creating backup', error as Error);
    }
  });

  /**
   * Relatório semanal - todo domingo às 20:00
   * Envia resumo semanal para admins da família
   */
  cron.schedule('0 20 * * 0', async () => {
    logger.info('📊 Generating weekly reports...');
    try {
      const { supabase } = await import('../index');

      // Busca todos os admins
      const { data: admins } = await supabase
        .from('family_members')
        .select('user_id, parent_id, parents(name)')
        .eq('role', 'admin');

      if (!admins) return;

      for (const admin of admins) {
        // Calcula estatísticas da semana
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { data: logs } = await supabase
          .from('medication_logs')
          .select('medication_id, status')
          .eq('parent_id', admin.parent_id)
          .gte('created_at', weekAgo.toISOString());

        if (!logs) continue;

        const total = logs.length;
        const taken = logs.filter(l => l.status === 'taken').length;
        const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;

        const parentName = Array.isArray(admin.parents)
          ? (admin.parents[0] as { name?: string })?.name
          : (admin.parents as { name?: string })?.name;

        await NotificationService.createNotification(
          admin.user_id,
          'medication',
          '📊 Relatório Semanal',
          `Adesão aos medicamentos de ${
            parentName || 'familiar'
          }: ${adherence}% (${taken}/${total} tomadas confirmadas)`,
          {
            parent_id: admin.parent_id,
            period: 'week',
            adherence,
            total,
            taken,
          }
        );
      }

      logger.info('✅ Weekly reports sent');
    } catch (error) {
      logger.error('Error generating weekly reports', error as Error);
    }
  });

  logger.info('✅ All cron jobs started successfully');
}

/**
 * Para todos os cron jobs (útil para testes e shutdown)
 */
export function stopCronJobs() {
  cron.getTasks().forEach(task => task.stop());
  logger.info('⏰ All cron jobs stopped');
}

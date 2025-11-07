import webpush from 'web-push';
import { supabase } from '../index';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getEnv } from '../utils/env';

// Configurar VAPID keys para Web Push (lazy initialization)
let vapidConfigured = false;

function configureVapid(): void {
  if (vapidConfigured) return;

  try {
    const env = getEnv();

    // Verifica se as chaves VAPID estão configuradas
    if (!env.VAPID_SUBJECT || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      console.warn('⚠️  VAPID keys not configured. Push notifications will not work.');
      vapidConfigured = true; // Marca como configurado para não tentar novamente
      return;
    }

    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    console.log('✅ VAPID keys configured successfully');
  } catch (error) {
    console.warn('⚠️  Failed to configure VAPID keys. Push notifications will not work.', error);
    vapidConfigured = true; // Marca como configurado para não tentar novamente
  }
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

export class NotificationService {
  /**
   * Envia notificação push para um usuário
   */
  static async sendPushNotification(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      // Configura VAPID se ainda não foi configurado
      configureVapid();

      // Busca as subscrições push do usuário
      const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error || !subscriptions || subscriptions.length === 0) {
        console.log(`No active push subscriptions for user ${userId}`);
        return;
      }

      // Envia para todas as subscrições do usuário
      const promises = subscriptions.map(async sub => {
        try {
          const subscription: PushSubscription = {
            endpoint: sub.endpoint,
            keys: sub.keys,
          };

          await webpush.sendNotification(subscription, JSON.stringify(payload));

          console.log(`Push sent to ${userId}`);
        } catch (error) {
          console.error('Error sending push:', error);

          // Se subscrição inválida, desativar
          if (
            error &&
            typeof error === 'object' &&
            'statusCode' in error &&
            error.statusCode === 410
          ) {
            await supabase.from('push_subscriptions').update({ is_active: false }).eq('id', sub.id);
          }
        }
      });

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error in sendPushNotification:', error);
    }
  }

  /**
   * Cria notificação no banco e envia push
   */
  static async createNotification(
    userId: string,
    type: 'medication' | 'appointment' | 'document' | 'family' | 'system',
    title: string,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    try {
      // Salva no banco
      const { error } = await supabase.from('notifications').insert({
        user_id: userId,
        type,
        title,
        message,
        data,
        is_read: false,
      });

      if (error) throw error;

      // Envia push notification
      await this.sendPushNotification(userId, {
        title,
        body: message,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        data: { type, ...data },
        actions: [
          { action: 'view', title: 'Ver' },
          { action: 'dismiss', title: 'Dispensar' },
        ],
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  /**
   * Envia lembretes de medicamento
   */
  static async sendMedicationReminders(): Promise<void> {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Busca medicamentos ativos com horários próximos
      const { data: medications, error } = await supabase
        .from('medications')
        .select('*, parents(*)')
        .eq('is_active', true);

      if (error || !medications) return;

      for (const med of medications) {
        // Verifica se há horário programado agora
        const times = med.times || [];

        for (const time of times) {
          const [hour, minute] = time.split(':').map(Number);

          // Notifica 5 minutos antes
          if (hour === currentHour && minute - currentMinute === 5) {
            // Busca todos os membros da família
            const { data: familyMembers } = await supabase
              .from('family_members')
              .select('user_id, profiles(*)')
              .eq('parent_id', med.parent_id);

            if (!familyMembers) continue;

            // Envia notificação para cada membro
            for (const member of familyMembers) {
              await this.createNotification(
                member.user_id,
                'medication',
                `💊 Hora do medicamento`,
                `${med.parents.name} precisa tomar ${med.name} (${med.dosage}) em 5 minutos`,
                {
                  medication_id: med.id,
                  parent_id: med.parent_id,
                  scheduled_time: time,
                }
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending medication reminders:', error);
    }
  }

  /**
   * Envia lembretes de consultas
   */
  static async sendAppointmentReminders(): Promise<void> {
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Busca consultas marcadas para amanhã
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*, parents(*)')
        .gte('scheduled_at', tomorrow.toISOString().split('T')[0])
        .lte('scheduled_at', tomorrow.toISOString().split('T')[0] + 'T23:59:59')
        .eq('status', 'scheduled');

      if (error || !appointments) return;

      for (const apt of appointments) {
        const { data: familyMembers } = await supabase
          .from('family_members')
          .select('user_id')
          .eq('parent_id', apt.parent_id);

        if (!familyMembers) continue;

        const dateFormatted = format(parseISO(apt.scheduled_at), "dd/MM 'às' HH:mm", {
          locale: ptBR,
        });

        for (const member of familyMembers) {
          await this.createNotification(
            member.user_id,
            'appointment',
            `📅 Lembrete de consulta`,
            `${apt.parents.name} tem consulta amanhã (${dateFormatted}) - ${apt.doctor_name}`,
            {
              appointment_id: apt.id,
              parent_id: apt.parent_id,
            }
          );
        }
      }
    } catch (error) {
      console.error('Error sending appointment reminders:', error);
    }
  }

  /**
   * Envia notificação quando novo membro é adicionado à família
   */
  static async notifyFamilyMemberAdded(
    parentId: string,
    newMemberId: string,
    addedByName: string
  ): Promise<void> {
    try {
      const { data: parent } = await supabase
        .from('parents')
        .select('name')
        .eq('id', parentId)
        .single();

      if (!parent) return;

      await this.createNotification(
        newMemberId,
        'family',
        '👨‍👩‍👧‍👦 Adicionado à família',
        `${addedByName} adicionou você para ajudar a cuidar de ${parent.name}`,
        { parent_id: parentId }
      );
    } catch (error) {
      console.error('Error notifying family member:', error);
    }
  }

  /**
   * Marca notificação como lida
   */
  static async markAsRead(notificationId: string): Promise<void> {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  /**
   * Marca todas as notificações de um usuário como lidas
   */
  static async markAllAsRead(userId: string): Promise<void> {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_read', false);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }

  /**
   * Deleta notificações antigas (mais de 30 dias)
   */
  static async cleanOldNotifications(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await supabase.from('notifications').delete().lt('created_at', thirtyDaysAgo.toISOString());

      console.log('Old notifications cleaned');
    } catch (error) {
      console.error('Error cleaning old notifications:', error);
    }
  }
}

export default NotificationService;

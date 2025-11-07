import { Router } from 'express'
import { authenticate, AuthRequest } from '../middlewares/auth.middleware'
import { supabase } from '../index'
import { z } from 'zod'
import NotificationService from '../services/notification.service'

const router = Router()

router.use(authenticate)

// Validation schemas
const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
})

/**
 * GET /api/notifications
 * Lista notificações do usuário
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const { unread, type, limit = 50, offset = 0 } = req.query

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1)

    // Filtros
    if (unread === 'true') {
      query = query.eq('is_read', false)
    }

    if (type) {
      query = query.eq('type', type)
    }

    const { data, error, count } = await query

    if (error) throw error

    res.json({
      data: data || [],
      pagination: {
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
        has_more: (count || 0) > Number(offset) + Number(limit),
      },
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({ error: 'Erro ao buscar notificações' })
  }
})

/**
 * GET /api/notifications/unread/count
 * Conta notificações não lidas
 */
router.get('/unread/count', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) throw error

    res.json({ count: count || 0 })
  } catch (error) {
    console.error('Error counting notifications:', error)
    res.status(500).json({ error: 'Erro ao contar notificações' })
  }
})

/**
 * GET /api/notifications/:id
 * Busca uma notificação específica
 */
router.get('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params
    const userId = req.user!.id

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

      if (error) throw error
      if (!data) {
        res.status(404).json({ error: 'Notificação não encontrada' })
        return
      }

      res.json({ data })
  } catch (error) {
    console.error('Error fetching notification:', error)
    res.status(500).json({ error: 'Erro ao buscar notificação' })
  }
})

/**
 * PATCH /api/notifications/:id/read
 * Marca uma notificação como lida
 */
router.patch('/:id/read', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.id

    const { data, error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    res.json({
      message: 'Notificação marcada como lida',
      data,
    })
  } catch (error) {
    console.error('Error marking notification as read:', error)
    res.status(500).json({ error: 'Erro ao marcar como lida' })
  }
})

/**
 * POST /api/notifications/read-all
 * Marca todas as notificações como lidas
 */
router.post('/read-all', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id

    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) throw error

    res.json({ message: 'Todas as notificações foram marcadas como lidas' })
  } catch (error) {
    console.error('Error marking all as read:', error)
    res.status(500).json({ error: 'Erro ao marcar todas como lidas' })
  }
})

/**
 * DELETE /api/notifications/:id
 * Deleta uma notificação
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.id

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw error

    res.json({ message: 'Notificação deletada' })
  } catch (error) {
    console.error('Error deleting notification:', error)
    res.status(500).json({ error: 'Erro ao deletar notificação' })
  }
})

/**
 * DELETE /api/notifications
 * Deleta todas as notificações lidas
 */
router.delete('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('is_read', true)

    if (error) throw error

    res.json({ message: 'Notificações lidas foram deletadas' })
  } catch (error) {
    console.error('Error deleting notifications:', error)
    res.status(500).json({ error: 'Erro ao deletar notificações' })
  }
})

/**
 * POST /api/notifications/subscribe
 * Registra subscrição para push notifications
 */
router.post('/subscribe', async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.user!.id
    const body = subscriptionSchema.parse(req.body)

    // Verifica se subscrição já existe
    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('endpoint', body.subscription.endpoint)
      .single()

    if (existing) {
      // Atualiza se já existe
      const { data, error } = await supabase
        .from('push_subscriptions')
        .update({
          keys: body.subscription.keys,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error

      res.json({
        message: 'Subscrição atualizada',
        data,
      })
      return
    }

    // Cria nova subscrição
    const { data, error } = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: userId,
        endpoint: body.subscription.endpoint,
        keys: body.subscription.keys,
        user_agent: req.headers['user-agent'] || null,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    res.status(201).json({
      message: 'Subscrição criada com sucesso',
      data,
    })
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors[0].message })
        return
      }
      console.error('Error subscribing:', error)
      res.status(500).json({ error: 'Erro ao criar subscrição' })
    }
})

/**
 * DELETE /api/notifications/subscribe
 * Remove subscrição de push notifications
 */
router.delete('/subscribe', async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.user!.id
    const { endpoint } = req.body

      if (!endpoint) {
        res.status(400).json({ error: 'Endpoint obrigatório' })
        return
      }

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)

    if (error) throw error

    res.json({ message: 'Subscrição removida' })
  } catch (error) {
    console.error('Error unsubscribing:', error)
    res.status(500).json({ error: 'Erro ao remover subscrição' })
  }
})

/**
 * GET /api/notifications/subscriptions
 * Lista todas as subscrições ativas do usuário
 */
router.get('/subscriptions/list', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, user_agent, is_active, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({
      data: data || [],
      count: data?.length || 0,
    })
  } catch (error) {
    console.error('Error fetching subscriptions:', error)
    res.status(500).json({ error: 'Erro ao buscar subscrições' })
  }
})

/**
 * POST /api/notifications/test
 * Envia uma notificação de teste
 */
router.post('/test', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id

    await NotificationService.createNotification(
      userId,
      'system',
      '🔔 Notificação de Teste',
      'Se você recebeu isso, as notificações estão funcionando!',
      { test: true, timestamp: new Date().toISOString() }
    )

    res.json({ message: 'Notificação de teste enviada' })
  } catch (error) {
    console.error('Error sending test notification:', error)
    res.status(500).json({ error: 'Erro ao enviar notificação de teste' })
  }
})

/**
 * GET /api/notifications/settings
 * Busca configurações de notificação do usuário
 */
router.get('/settings', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id

    // Busca ou cria configurações
    const response = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    let settings = response.data
    const error = response.error

    if (error && error.code === 'PGRST116') {
      // Configurações não existem, criar padrões
      const { data: newSettings, error: createError } = await supabase
        .from('notification_settings')
        .insert({
          user_id: userId,
          medication_reminders: true,
          appointment_reminders: true,
          document_uploads: true,
          family_updates: true,
        })
        .select()
        .single()

      if (createError) throw createError
      settings = newSettings
    } else if (error) {
      throw error
    }

    res.json({ data: settings })
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    res.status(500).json({ error: 'Erro ao buscar configurações' })
  }
})

/**
 * PATCH /api/notifications/settings
 * Atualiza configurações de notificação
 */
router.patch('/settings', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id
    const {
      medication_reminders,
      appointment_reminders,
      document_uploads,
      family_updates,
    } = req.body

    const { data, error } = await supabase
      .from('notification_settings')
      .upsert({
        user_id: userId,
        medication_reminders,
        appointment_reminders,
        document_uploads,
        family_updates,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({
      message: 'Configurações atualizadas',
      data,
    })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    res.status(500).json({ error: 'Erro ao atualizar configurações' })
  }
})

export default router

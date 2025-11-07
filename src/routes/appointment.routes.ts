import { Router } from 'express';
import { authenticate, checkFamilyPermission, AuthRequest } from '../middlewares/auth.middleware';
import { supabase } from '../index';
import { z } from 'zod';
import NotificationService from '../services/notification.service';

const router = Router();

router.use(authenticate);

// Validation schema
const appointmentSchema = z.object({
  parent_id: z.string().uuid(),
  doctor_name: z.string().min(2, 'Nome do médico obrigatório'),
  specialty: z.string().optional(),
  clinic_name: z.string().optional(),
  location: z.string().optional(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().positive().default(60),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'missed']).default('scheduled'),
});

/**
 * GET /api/appointments/parent/:parentId
 * Lista consultas de um idoso
 */
router.get('/parent/:parentId', checkFamilyPermission('view'), async (req: AuthRequest, res) => {
  try {
    const { parentId } = req.params;
    const { status, from, to, upcoming } = req.query;

    let query = supabase
      .from('appointments')
      .select(
        `
        *,
        created_by_profile:profiles!created_by(full_name, avatar_url)
      `
      )
      .eq('parent_id', parentId)
      .order('scheduled_at', { ascending: true });

    // Filtros
    if (status) {
      query = query.eq('status', status);
    }

    if (upcoming === 'true') {
      query = query.gte('scheduled_at', new Date().toISOString()).eq('status', 'scheduled');
    }

    if (from) {
      query = query.gte('scheduled_at', from);
    }

    if (to) {
      query = query.lte('scheduled_at', to);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      data: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Erro ao buscar consultas' });
  }
});

/**
 * GET /api/appointments/:id
 * Busca uma consulta específica
 */
router.get('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('appointments')
      .select(
        `
        *,
        parents(*),
        created_by_profile:profiles!created_by(full_name, email, avatar_url)
      `
      )
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Consulta não encontrada' });
    }

    // Verifica acesso
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', data.parent_id)
      .single();

    if (!familyMember?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    res.json({ data });
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: 'Erro ao buscar consulta' });
  }
});

/**
 * POST /api/appointments
 * Cria uma nova consulta
 */
router.post('/', async (req: AuthRequest, res): Promise<void> => {
  try {
    const body = appointmentSchema.parse(req.body);

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions, parents(*)')
      .eq('user_id', req.user!.id)
      .eq('parent_id', body.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_edit && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para agendar consultas' });
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        ...body,
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Notifica outros membros da família
    const { data: otherMembers } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('parent_id', body.parent_id)
      .neq('user_id', req.user!.id)
      .eq('status', 'active');

    if (otherMembers) {
      const scheduledDate = new Date(body.scheduled_at).toLocaleDateString('pt-BR');
      for (const member of otherMembers) {
        await NotificationService.createNotification(
          member.user_id,
          'appointment',
          '📅 Nova consulta agendada',
          `Consulta com ${body.doctor_name} agendada para ${scheduledDate}`,
          { appointment_id: data.id, parent_id: body.parent_id }
        );
      }
    }

    res.status(201).json({
      message: 'Consulta agendada com sucesso',
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Erro ao agendar consulta' });
  }
});

/**
 * PUT /api/appointments/:id
 * Atualiza uma consulta
 */
router.put('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Busca consulta
    const { data: appointment } = await supabase
      .from('appointments')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (!appointment) {
      res.status(404).json({ error: 'Consulta não encontrada' });
      return;
    }

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', appointment.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_edit && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para editar' });
    }

    const updates = appointmentSchema.partial().parse(req.body);

    const { data, error } = await supabase
      .from('appointments')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Consulta atualizada com sucesso',
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Erro ao atualizar consulta' });
  }
});

/**
 * PATCH /api/appointments/:id/status
 * Atualiza apenas o status da consulta
 */
router.patch('/:id/status', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, outcome } = req.body;

    if (!status || !['scheduled', 'completed', 'cancelled', 'missed'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
    }

    // Busca consulta
    const { data: appointment } = await supabase
      .from('appointments')
      .select('parent_id, parents(name)')
      .eq('id', id)
      .single();

    if (!appointment) {
      res.status(404).json({ error: 'Consulta não encontrada' });
      return;
    }

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', appointment.parent_id)
      .single();

    if (!familyMember?.permissions?.can_edit) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const { data, error } = await supabase
      .from('appointments')
      .update({
        status,
        outcome,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Notifica membros sobre mudança de status
    if (status === 'completed' || status === 'cancelled') {
      const { data: members } = await supabase
        .from('family_members')
        .select('user_id')
        .eq('parent_id', appointment.parent_id)
        .neq('user_id', req.user!.id)
        .eq('status', 'active');

      if (members) {
        const statusText = status === 'completed' ? 'realizada' : 'cancelada';
        const parentName = Array.isArray(appointment.parents)
          ? (appointment.parents[0] as { name?: string })?.name || 'o familiar'
          : (appointment.parents as { name?: string })?.name || 'o familiar';

        for (const member of members) {
          await NotificationService.createNotification(
            member.user_id,
            'appointment',
            `📅 Consulta ${statusText}`,
            `A consulta de ${parentName} foi ${statusText}`,
            { appointment_id: id, parent_id: appointment.parent_id }
          );
        }
      }
    }

    res.json({
      message: 'Status atualizado com sucesso',
      data,
    });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

/**
 * DELETE /api/appointments/:id
 * Cancela/deleta uma consulta
 */
router.delete('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Busca consulta
    const { data: appointment } = await supabase
      .from('appointments')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (!appointment) {
      res.status(404).json({ error: 'Consulta não encontrada' });
      return;
    }

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', appointment.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_delete && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para deletar' });
    }

    const { error } = await supabase.from('appointments').delete().eq('id', id);

    if (error) throw error;

    res.json({ message: 'Consulta removida com sucesso' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Erro ao deletar consulta' });
  }
});

/**
 * GET /api/appointments/calendar/:parentId/:month
 * Retorna consultas do mês para calendário
 */
router.get(
  '/calendar/:parentId/:month',
  checkFamilyPermission('view'),
  async (req: AuthRequest, res) => {
    try {
      const { parentId, month } = req.params; // month no formato YYYY-MM

      const startDate = `${month}-01`;
      const endDate = new Date(month + '-01');
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      const endDateStr = endDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('parent_id', parentId)
        .gte('scheduled_at', startDate)
        .lte('scheduled_at', endDateStr + 'T23:59:59')
        .order('scheduled_at');

      if (error) throw error;

      res.json({ data: data || [] });
    } catch (error) {
      console.error('Error fetching calendar:', error);
      res.status(500).json({ error: 'Erro ao buscar calendário' });
    }
  }
);

export default router;

import { Router } from 'express';
import { authenticate, checkFamilyPermission, AuthRequest } from '../middlewares/auth.middleware';
import { supabase } from '../index';
import { z } from 'zod';
import NotificationService from '../services/notification.service';

const router = Router();

router.use(authenticate);

// Validation schemas
const medicationSchema = z.object({
  parent_id: z.string().uuid(),
  name: z.string().min(2, 'Nome do medicamento obrigatório'),
  dosage: z.string().min(1, 'Dosagem obrigatória'),
  frequency: z.enum(['daily', 'twice_daily', 'thrice_daily', 'weekly', 'as_needed']),
  times: z.array(z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)).optional(),
  instructions: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  is_active: z.boolean().default(true),
});

const confirmMedicationSchema = z.object({
  taken_at: z.string().datetime().optional(),
  notes: z.string().optional(),
  status: z.enum(['taken', 'missed', 'skipped']).default('taken'),
});

/**
 * GET /api/medications/parent/:parentId
 * Lista medicamentos de um idoso
 */
router.get('/parent/:parentId', checkFamilyPermission('view'), async (req: AuthRequest, res) => {
  try {
    const { parentId } = req.params;
    const { active, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('medications')
      .select('*', { count: 'exact' })
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (active !== undefined) {
      query = query.eq('is_active', active === 'true');
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      data: data || [],
      pagination: {
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
        has_more: (count || 0) > Number(offset) + Number(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching medications:', error);
    res.status(500).json({ error: 'Erro ao buscar medicamentos' });
  }
});

/**
 * GET /api/medications/:id
 * Busca um medicamento específico
 */
router.get('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: medication, error } = await supabase
      .from('medications')
      .select('*, parents(*)')
      .eq('id', id)
      .single();

    if (error || !medication) {
      res.status(404).json({ error: 'Medicamento não encontrado' });
    }

    // Verifica acesso
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', medication.parent_id)
      .single();

    if (!familyMember?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    res.json({ data: medication });
  } catch (error) {
    console.error('Error fetching medication:', error);
    res.status(500).json({ error: 'Erro ao buscar medicamento' });
  }
});

/**
 * POST /api/medications
 * Adiciona um medicamento
 */
router.post('/', async (req: AuthRequest, res): Promise<void> => {
  try {
    const body = medicationSchema.parse(req.body);

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions, parents(name)')
      .eq('user_id', req.user!.id)
      .eq('parent_id', body.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_edit && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para adicionar medicamentos' });
      return;
    }

    const { data, error } = await supabase
      .from('medications')
      .insert({
        ...body,
        created_by: req.user!.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Notifica outros membros
    const { data: otherMembers } = await supabase
      .from('family_members')
      .select('user_id')
      .eq('parent_id', body.parent_id)
      .neq('user_id', req.user!.id)
      .eq('status', 'active');

    if (otherMembers && otherMembers.length > 0) {
      const parentName = Array.isArray(familyMember.parents)
        ? (familyMember.parents[0] as { name?: string })?.name || 'o familiar'
        : (familyMember.parents as { name?: string })?.name || 'o familiar';

      for (const member of otherMembers) {
        await NotificationService.createNotification(
          member.user_id,
          'medication',
          '💊 Novo medicamento adicionado',
          `${body.name} foi adicionado para ${parentName}`,
          { medication_id: data.id, parent_id: body.parent_id }
        );
      }
    }

    res.status(201).json({
      message: 'Medicamento adicionado com sucesso',
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error creating medication:', error);
    res.status(500).json({ error: 'Erro ao adicionar medicamento' });
  }
});

/**
 * PUT /api/medications/:id
 * Atualiza um medicamento
 */
router.put('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Busca medicamento
    const { data: medication } = await supabase
      .from('medications')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (!medication) {
      res.status(404).json({ error: 'Medicamento não encontrado' });
      return;
    }

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', medication.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_edit && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para editar' });
      return;
    }

    const updates = medicationSchema.partial().omit({ parent_id: true }).parse(req.body);

    const { data, error } = await supabase
      .from('medications')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Medicamento atualizado com sucesso',
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error updating medication:', error);
    res.status(500).json({ error: 'Erro ao atualizar medicamento' });
  }
});

/**
 * DELETE /api/medications/:id
 * Deleta um medicamento
 */
router.delete('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Busca medicamento
    const { data: medication } = await supabase
      .from('medications')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (!medication) {
      res.status(404).json({ error: 'Medicamento não encontrado' });
      return;
    }

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', medication.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_delete && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para deletar' });
    }

    const { error } = await supabase.from('medications').delete().eq('id', id);

    if (error) throw error;

    res.json({ message: 'Medicamento removido com sucesso' });
  } catch (error) {
    console.error('Error deleting medication:', error);
    res.status(500).json({ error: 'Erro ao deletar medicamento' });
  }
});

/**
 * POST /api/medications/:id/confirm
 * Confirma a tomada de um medicamento
 */
router.post('/:id/confirm', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const body = confirmMedicationSchema.parse(req.body);

    // Busca medicamento
    const { data: medication } = await supabase
      .from('medications')
      .select('parent_id, name')
      .eq('id', id)
      .single();

    if (!medication) {
      res.status(404).json({ error: 'Medicamento não encontrado' });
      return;
    }

    // Verifica acesso
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', medication.parent_id)
      .single();

    if (!familyMember?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    const takenAt = body.taken_at || new Date().toISOString();

    // Cria log de tomada
    const { data, error } = await supabase
      .from('medication_logs')
      .insert({
        medication_id: id,
        parent_id: medication.parent_id,
        taken_at: takenAt,
        status: body.status,
        notes: body.notes,
        confirmed_by: req.user!.id,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Tomada confirmada com sucesso',
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error confirming medication:', error);
    res.status(500).json({ error: 'Erro ao confirmar tomada' });
  }
});

/**
 * GET /api/medications/:id/logs
 * Histórico de tomadas de um medicamento
 */
router.get('/:id/logs', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { start_date, end_date, limit = 50, offset = 0 } = req.query;

    // Busca medicamento
    const { data: medication } = await supabase
      .from('medications')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (!medication) {
      res.status(404).json({ error: 'Medicamento não encontrado' });
      return;
    }

    // Verifica acesso
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', medication.parent_id)
      .single();

    if (!familyMember?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    let query = supabase
      .from('medication_logs')
      .select('*, confirmed_by_profile:profiles!confirmed_by(full_name, avatar_url)', {
        count: 'exact',
      })
      .eq('medication_id', id)
      .order('taken_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (start_date) {
      query = query.gte('taken_at', start_date);
    }

    if (end_date) {
      query = query.lte('taken_at', end_date);
    }

    const { data, error: queryError, count } = await query;

    if (queryError) throw queryError;

    res.json({
      data: data || [],
      pagination: {
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
        has_more: (count || 0) > Number(offset) + Number(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching medication logs:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

export default router;


import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';
import { supabase } from '../index';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

// Validation schema
const parentSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  birth_date: z.string(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  blood_type: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  avatar_url: z.string().url().optional().or(z.literal('')),
  allergies: z.array(z.string()).optional(),
  chronic_conditions: z.array(z.string()).optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  doctor_name: z.string().optional(),
  doctor_phone: z.string().optional(),
  health_insurance: z.string().optional(),
  insurance_number: z.string().optional(),
});

/**
 * GET /api/parents
 * Lista todos os idosos que o usuário tem acesso
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Busca todos os idosos através das relações de família
    const { data, error } = await supabase
      .from('family_members')
      .select(
        `
        role,
        permissions,
        status,
        parents (
          id,
          name,
          birth_date,
          gender,
          avatar_url,
          created_at
        )
      `
      )
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw error;

    const parents =
      data?.map(item => ({
        ...item.parents,
        role: item.role,
        permissions: item.permissions,
      })) || [];

    res.json({
      data: parents,
      count: parents.length,
    });
  } catch (error) {
    console.error('Error fetching parents:', error);
    res.status(500).json({ error: 'Erro ao buscar idosos' });
  }
});

/**
 * GET /api/parents/:id
 * Busca um idoso específico
 */
router.get('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verifica se usuário tem acesso
    const { data: familyMember, error: familyError } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('parent_id', id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (familyError || !familyMember) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    // Busca dados do idoso
    const { data: parent, error } = await supabase
      .from('parents')
      .select(
        `
        *,
        created_by_profile:profiles!created_by(full_name, email)
      `
      )
      .eq('id', id)
      .single();

    if (error || !parent) {
      res.status(404).json({ error: 'Idoso não encontrado' });
      return;
    }

    if (!familyMember) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    // Busca estatísticas
    const { data: medicationsCount } = await supabase
      .from('medications')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', id)
      .eq('is_active', true);

    const { data: appointmentsCount } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString());

    const { data: documentsCount } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', id);

    res.json({
      data: {
        ...parent,
        role: familyMember.role,
        permissions: familyMember.permissions,
        statistics: {
          active_medications: medicationsCount?.length || 0,
          upcoming_appointments: appointmentsCount?.length || 0,
          total_documents: documentsCount?.length || 0,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching parent:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do idoso' });
  }
});

/**
 * POST /api/parents
 * Cria um novo idoso e adiciona o criador como admin
 */
router.post('/', async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.user!.id;
    const body = parentSchema.parse(req.body);

    // Cria o idoso
    const { data: parent, error: parentError } = await supabase
      .from('parents')
      .insert({
        ...body,
        created_by: userId,
      })
      .select()
      .single();

    if (parentError) throw parentError;

    // Adiciona o criador como admin da família
    const { error: familyError } = await supabase.from('family_members').insert({
      parent_id: parent.id,
      user_id: userId,
      role: 'admin',
      permissions: {
        can_view: true,
        can_edit: true,
        can_delete: true,
      },
      status: 'active',
      invited_by: userId,
      accepted_at: new Date().toISOString(),
    });

    if (familyError) {
      // Rollback: deleta o idoso se falhar ao adicionar na família
      await supabase.from('parents').delete().eq('id', parent.id);
      throw familyError;
    }

    res.status(201).json({
      message: 'Idoso cadastrado com sucesso',
      data: parent,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error creating parent:', error);
    res.status(500).json({ error: 'Erro ao criar idoso' });
  }
});

/**
 * PUT /api/parents/:id
 * Atualiza dados de um idoso
 */
router.put('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verifica permissão de edição
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('parent_id', id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!familyMember || (!familyMember.permissions?.can_edit && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para editar' });
    }

    const body = parentSchema.partial().parse(req.body);

    const { data, error } = await supabase
      .from('parents')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Dados atualizados com sucesso',
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error updating parent:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados' });
  }
});

/**
 * DELETE /api/parents/:id
 * Deleta um idoso (apenas admin)
 */
router.delete('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verifica se é admin
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role')
      .eq('parent_id', id)
      .eq('user_id', userId)
      .single();

    if (!familyMember || familyMember.role !== 'admin') {
      res.status(403).json({ error: 'Apenas administradores podem deletar' });
    }

    // Deleta o idoso (cascade deleta relacionamentos)
    const { error } = await supabase.from('parents').delete().eq('id', id);

    if (error) throw error;

    res.json({ message: 'Idoso removido com sucesso' });
  } catch (error) {
    console.error('Error deleting parent:', error);
    res.status(500).json({ error: 'Erro ao deletar idoso' });
  }
});

/**
 * GET /api/parents/:id/dashboard
 * Dashboard com resumo completo do idoso
 */
router.get('/:id/dashboard', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verifica acesso
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('parent_id', id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!familyMember?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    // Busca medicamentos pendentes hoje
    const today = new Date().toISOString().split('T')[0];
    const { data: todayMedications } = await supabase
      .from('medications')
      .select('*')
      .eq('parent_id', id)
      .eq('is_active', true)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`);

    // Busca próximas consultas
    const { data: upcomingAppointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('parent_id', id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5);

    // Adesão aos medicamentos (últimos 7 dias)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: recentLogs } = await supabase
      .from('medication_logs')
      .select('status')
      .gte('taken_at', weekAgo.toISOString())
      .in('medication_id', todayMedications?.map(m => m.id) || []);

    const totalLogs = recentLogs?.length || 0;
    const takenLogs = recentLogs?.filter(l => l.status === 'taken').length || 0;
    const adherence = totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : 0;

    // Documentos recentes
    const { data: recentDocuments } = await supabase
      .from('documents')
      .select('*')
      .eq('parent_id', id)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({
      data: {
        medications: {
          active_count: todayMedications?.length || 0,
          today: todayMedications || [],
        },
        appointments: {
          upcoming_count: upcomingAppointments?.length || 0,
          next: upcomingAppointments || [],
        },
        adherence: {
          percentage: adherence,
          total_logs: totalLogs,
          taken_count: takenLogs,
        },
        documents: {
          recent: recentDocuments || [],
        },
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

/**
 * GET /api/parents/:id/timeline
 * Timeline de atividades do idoso
 */
router.get('/:id/timeline', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // Verifica acesso
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('parent_id', id)
      .eq('user_id', req.user!.id)
      .single();

    if (!familyMember?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    // Busca atividades recentes
    const { data: activities } = await supabase
      .from('activity_logs')
      .select('*, profiles:user_id(full_name, avatar_url)')
      .eq('parent_id', id)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    res.json({
      data: activities || [],
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Erro ao buscar timeline' });
  }
});

export default router;

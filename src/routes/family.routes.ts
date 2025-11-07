import { Router, Response } from 'express'
import {
  authenticate,
  AuthRequest,
} from '../middlewares/auth.middleware'
import { supabase } from '../index'
import { z } from 'zod'
import NotificationService from '../services/notification.service'

const router = Router()

router.use(authenticate)

// Validation schemas
const inviteSchema = z.object({
  parent_id: z.string().uuid(),
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
  permissions: z
    .object({
      can_view: z.boolean().default(true),
      can_edit: z.boolean().default(false),
      can_delete: z.boolean().default(false),
    })
    .optional(),
})

const updatePermissionsSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  permissions: z
    .object({
      can_view: z.boolean(),
      can_edit: z.boolean(),
      can_delete: z.boolean(),
    })
    .optional(),
})

/**
 * GET /api/family/parent/:parentId/members
 * Lista membros da família de um idoso
 */
router.get('/parent/:parentId/members', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { parentId } = req.params
    const userId = req.user!.id

    // Verifica se usuário tem acesso
    const { data: userMembership } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('parent_id', parentId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (!userMembership?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' })
    }

    // Busca todos os membros
    const { data, error } = await supabase
      .from('family_members')
      .select(
        `
        *,
        profile:profiles!user_id(
          id,
          full_name,
          email,
          avatar_url,
          phone
        ),
        invited_by_profile:profiles!invited_by(
          full_name,
          email
        )
      `
      )
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true })

    if (error) throw error

    res.json({
      data: data || [],
      count: data?.length || 0,
    })
  } catch (error) {
    console.error('Error fetching family members:', error)
    res.status(500).json({ error: 'Erro ao buscar membros' })
  }
})

/**
 * POST /api/family/invite
 * Convida um membro para a família
 */
router.post('/invite', async (req: AuthRequest, res): Promise<void> => {
  try {
    const userId = req.user!.id
    const body = inviteSchema.parse(req.body)

    // Verifica se é admin
    const { data: inviter } = await supabase
      .from('family_members')
      .select('role, parents(*)')
      .eq('parent_id', body.parent_id)
      .eq('user_id', userId)
      .single()

    if (!inviter || inviter.role !== 'admin') {
      res
        .status(403)
        .json({ error: 'Apenas administradores podem convidar' })
      return
    }

    // Busca usuário pelo email
    const { data: invitedUser, error: userError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('email', body.email)
      .single()

    if (userError || !invitedUser) {
      res.status(404).json({
        error: 'Usuário não encontrado. Ele precisa criar uma conta primeiro.',
      })
      return
    }

    // Verifica se já não é membro
    const { data: existingMember } = await supabase
      .from('family_members')
      .select('id, status')
      .eq('parent_id', body.parent_id)
      .eq('user_id', invitedUser.id)
      .single()

    if (existingMember) {
      if (existingMember.status === 'active') {
        res.status(400).json({ error: 'Usuário já é membro da família' })
        return
      }
      if (existingMember.status === 'pending') {
        res.status(400).json({ error: 'Convite já enviado e pendente' })
        return
      }
    }

    // Define permissões baseadas no role
    let permissions = body.permissions
    if (!permissions) {
      permissions = {
        can_view: true,
        can_edit: body.role === 'editor' || body.role === 'admin',
        can_delete: body.role === 'admin',
      }
    }

    // Cria o convite
    const { data, error } = await supabase
      .from('family_members')
      .insert({
        parent_id: body.parent_id,
        user_id: invitedUser.id,
        role: body.role,
        permissions,
        status: 'pending',
        invited_by: userId,
      })
      .select()
      .single()

    if (error) throw error

    // Busca nome do criador
    const { data: inviterProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()

    // Notifica o usuário convidado
    await NotificationService.notifyFamilyMemberAdded(
      body.parent_id,
      invitedUser.id,
      inviterProfile?.full_name || 'Um membro'
    )

    res.status(201).json({
      message: 'Convite enviado com sucesso',
      data,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Error inviting member:', error)
    res.status(500).json({ error: 'Erro ao enviar convite' })
  }
})

/**
 * POST /api/family/invites/:inviteId/accept
 * Aceita um convite para família
 */


router.post('/invites/:inviteId/accept', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { inviteId } = req.params as { inviteId: string }
    const userId = req.user!.id as string

    // Busca o convite
    const { data: invite, error: inviteError } = await supabase
      .from('family_members')
      .select('*, parents(name)')
      .eq('id', inviteId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single()

    if (inviteError || !invite) {
      res
        .status(404)
        .json({ error: 'Convite não encontrado ou já processado' })
      return
    }

    // Aceita o convite
    const { data, error } = await supabase
      .from('family_members')
      .update({
        status: 'active',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', inviteId)
      .select()
      .single()

    if (error) throw error

    // Notifica quem convidou
    const parentName = Array.isArray(invite.parents)
      ? (invite.parents[0] as { name?: string })?.name || 'o familiar'
      : (invite.parents as { name?: string })?.name || 'o familiar';

    await NotificationService.createNotification(
      invite.invited_by || '',
      'family',
      '✅ Convite aceito',
      `${req.user!.email} aceitou o convite para cuidar de ${parentName}`,
      { parent_id: invite.parent_id, member_id: inviteId }
    )

    res.json({
      message: 'Convite aceito com sucesso',
      data,
    })
  } catch (error) {
    console.error('Error accepting invite:', error)
    res.status(500).json({ error: 'Erro ao aceitar convite' })
  }
})

/**
 * POST /api/family/invites/:inviteId/decline
 * Recusa um convite para família
 */
router.post('/invites/:inviteId/decline', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { inviteId } = req.params
    const userId = req.user!.id

    // Busca o convite
    const { data: invite } = await supabase
      .from('family_members')
      .select('invited_by, parent_id, parents(name)')
      .eq('id', inviteId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single()

    if (!invite) {
      res.status(404).json({ error: 'Convite não encontrado' })
      return
    }

    // Deleta o convite
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', inviteId)

    if (error) throw error

    // Notifica quem convidou
    const parentName = Array.isArray(invite.parents)
      ? (invite.parents[0] as { name?: string })?.name || 'o familiar'
      : (invite.parents as { name?: string })?.name || 'o familiar';

    await NotificationService.createNotification(
      invite.invited_by || '',
      'family',
      '❌ Convite recusado',
      `${req.user!.email} recusou o convite para cuidar de ${parentName}`,
      { parent_id: invite.parent_id }
    )

    res.json({ message: 'Convite recusado' })
  } catch (error) {
    console.error('Error declining invite:', error)
    res.status(500).json({ error: 'Erro ao recusar convite' })
  }
})

/**
 * GET /api/family/invites
 * Lista convites pendentes do usuário
 */
router.get('/invites', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id

    const { data, error } = await supabase
      .from('family_members')
      .select(
        `
        *,
        parents(*),
        invited_by_profile:profiles!invited_by(full_name, email, avatar_url)
      `
      )
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false })

    if (error) throw error

    res.json({
      data: data || [],
      count: data?.length || 0,
    })
  } catch (error) {
    console.error('Error fetching invites:', error)
    res.status(500).json({ error: 'Erro ao buscar convites' })
  }
})

/**
 * PATCH /api/family/members/:memberId/permissions
 * Atualiza permissões de um membro
 */
router.patch(
  '/members/:memberId/permissions',
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const { memberId } = req.params
      const userId = req.user!.id
      const body = updatePermissionsSchema.parse(req.body)

      // Busca o membro
      const { data: member } = await supabase
        .from('family_members')
        .select('parent_id, user_id')
        .eq('id', memberId)
        .single()

      if (!member) {
        res.status(404).json({ error: 'Membro não encontrado' })
        return
      }

      // Verifica se é admin
      const { data: adminCheck } = await supabase
        .from('family_members')
        .select('role')
        .eq('parent_id', member.parent_id)
        .eq('user_id', userId)
        .single()

      if (!adminCheck || adminCheck.role !== 'admin') {
        res
          .status(403)
          .json({ error: 'Apenas administradores podem alterar permissões' })
        return
      }

      // Não pode alterar próprias permissões
      if (member.user_id === userId) {
        res
          .status(400)
          .json({ error: 'Você não pode alterar suas próprias permissões' })
        return
      }

      // Atualiza permissões
      const updates: {
        role?: string
        permissions?: { can_view: boolean; can_edit: boolean; can_delete: boolean }
        updated_at: string
      } = {
        updated_at: new Date().toISOString(),
      }
      if (body.role) updates.role = body.role
      if (body.permissions) updates.permissions = body.permissions

      const { data, error } = await supabase
        .from('family_members')
        .update(updates)
        .eq('id', memberId)
        .select()
        .single()

      if (error) throw error

      // Notifica o membro
      await NotificationService.createNotification(
        member.user_id,
        'family',
        '🔐 Permissões atualizadas',
        'Suas permissões de acesso foram atualizadas',
        { parent_id: member.parent_id, member_id: memberId }
      )

      res.json({
        message: 'Permissões atualizadas com sucesso',
        data,
      })
    } catch (error) {
      // handle Zod validation errors
      if (error instanceof z.ZodError) {
        const zodErr = error
        res
          .status(400)
          .json({ error: zodErr.errors[0]?.message || 'Dados inválidos' })
        return
      }
      console.error('Error updating permissions:', error)
      res.status(500).json({ error: 'Erro ao atualizar permissões' })
    }
  }
)

/**
 * DELETE /api/family/members/:memberId
 * Remove um membro da família
 */

router.delete('/members/:memberId', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { memberId } = req.params
    const userId = req.user!.id

    // Busca o membro
    const { data: member } = await supabase
      .from('family_members')
      .select('parent_id, user_id, role')
      .eq('id', memberId)
      .single()

    if (!member) {
      res.status(404).json({ error: 'Membro não encontrado' })
      return
    }

    // Verifica se é admin ou está removendo a si mesmo
    const { data: adminCheck } = await supabase
      .from('family_members')
      .select('role')
      .eq('parent_id', member.parent_id)
      .eq('user_id', userId)
      .single()

    const isSelfRemoval: boolean = member.user_id === userId
    const isAdmin: boolean = adminCheck?.role === 'admin'

    if (!isSelfRemoval && !isAdmin) {
      res
        .status(403)
        .json({ error: 'Sem permissão para remover este membro' })
      return
    }

    // Não pode remover o último admin
    if (member.role === 'admin') {
      const { data: admins } = await supabase
        .from('family_members')
        .select('id')
        .eq('parent_id', member.parent_id)
        .eq('role', 'admin')
        .eq('status', 'active')

      if (admins && admins.length === 1) {
        res.status(400).json({
          error:
            'Não é possível remover o último administrador. Adicione outro admin primeiro.',
        })
        return
      }
    }

    // Remove o membro
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', memberId)

    if (error) throw error

    // Notifica o membro removido (se não for auto-remoção)
    if (!isSelfRemoval) {
      await NotificationService.createNotification(
        member.user_id,
        'family',
        '👋 Removido da família',
        'Você foi removido do acesso a este familiar',
        { parent_id: member.parent_id }
      )
    }

    res.json({
      message: isSelfRemoval
        ? 'Você saiu da família'
        : 'Membro removido com sucesso',
    })
  } catch (error) {
    console.error('Error removing member:', error)
    res.status(500).json({ error: 'Erro ao remover membro' })
  }
})

/**
 * POST /api/family/members/:memberId/transfer-admin
 * Transfere role de admin para outro membro
 */
router.post(
  '/members/:memberId/transfer-admin',
  async (req: AuthRequest, res): Promise<void> => {
    try {
      const { memberId } = req.params
      const userId = req.user!.id

      // Busca o membro de destino
      const { data: targetMember } = await supabase
        .from('family_members')
        .select('parent_id, user_id, status')
        .eq('id', memberId)
        .single()

      if (!targetMember || targetMember.status !== 'active') {
        res
          .status(404)
          .json({ error: 'Membro não encontrado ou inativo' })
        return
      }

      // Verifica se quem está transferindo é admin
      const { data: currentAdmin } = await supabase
        .from('family_members')
        .select('id, role')
        .eq('parent_id', targetMember.parent_id)
        .eq('user_id', userId)
        .single()

      if (!currentAdmin || currentAdmin.role !== 'admin') {
        res
          .status(403)
          .json({ error: 'Apenas administradores podem transferir admin' })
        return
      }

      // Atualiza novo admin
      const { error: upgradeError } = await supabase
        .from('family_members')
        .update({
          role: 'admin',
          permissions: {
            can_view: true,
            can_edit: true,
            can_delete: true,
          },
        })
        .eq('id', memberId)

      if (upgradeError) throw upgradeError

      // Rebaixa admin atual para editor
      const { error: downgradeError } = await supabase
        .from('family_members')
        .update({
          role: 'editor',
          permissions: {
            can_view: true,
            can_edit: true,
            can_delete: false,
          },
        })
        .eq('id', currentAdmin.id)

      if (downgradeError) throw downgradeError

      // Notifica novo admin
      await NotificationService.createNotification(
        targetMember.user_id,
        'family',
        '👑 Você é admin agora',
        'Você foi promovido a administrador da família',
        { parent_id: targetMember.parent_id }
      )

      res.json({ message: 'Admin transferido com sucesso' })
    } catch (error) {
      console.error('Error transferring admin:', error)
      res.status(500).json({ error: 'Erro ao transferir admin' })
    }
  }
)

export default router

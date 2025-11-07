import { Router, Request, Response } from 'express'
import { supabase } from '../index'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../middlewares/auth.middleware'

const router = Router()

// Validation schemas
const signUpSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  full_name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  phone: z.string().optional(),
  birth_date: z.string().optional(),
})

const signInSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

const resetPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
})

const updatePasswordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

/**
 * POST /api/auth/signup
 * Registro de novo usuário
 */
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = signUpSchema.parse(req.body)

    // Cria usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: {
          full_name: body.full_name,
        },
      },
    })

    if (authError) {
      res.status(400).json({ error: authError.message })
    }

    if (!authData.user) {
      res.status(400).json({ error: 'Erro ao criar usuário' })
      return
    }

    // Cria perfil no banco
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      email: body.email,
      full_name: body.full_name,
      phone: body.phone,
      birth_date: body.birth_date,
    })

    if (profileError) {
      console.error('Error creating profile:', profileError)
    }

    res.status(201).json({
      message: 'Usuário criado com sucesso! Verifique seu email.',
      user: {
        id: authData.user.id,
        email: authData.user.email || body.email,
        full_name: body.full_name,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Signup error:', error)
    res.status(500).json({ error: 'Erro ao criar conta' })
  }
})

/**
 * POST /api/auth/signin
 * Login de usuário
 */
router.post('/signin', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = signInSchema.parse(req.body)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    })

    if (error) {
      res.status(401).json({ error: 'Email ou senha inválidos' })
    }

    if (!data.user) {
      res.status(401).json({ error: 'Erro ao fazer login' })
      return
    }

    // Busca perfil completo
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()

    res.json({
      message: 'Login realizado com sucesso',
      session: data.session,
      user: {
        ...data.user,
        profile,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Signin error:', error)
    res.status(500).json({ error: 'Erro ao fazer login' })
  }
})

/**
 * POST /api/auth/signout
 * Logout de usuário
 */
router.post('/signout', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const authHeader = req.headers.authorization
      const token = authHeader?.substring(7)

      if (token) {
        await supabase.auth.signOut()
      }

      res.json({ message: 'Logout realizado com sucesso' })
    } catch (error) {
      console.error('Signout error:', error)
      res.status(500).json({ error: 'Erro ao fazer logout' })
    }
  }
)

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      res.status(404).json({ error: 'Perfil não encontrado' })
    }

    // Busca famílias que o usuário tem acesso
    const { data: families } = await supabase
      .from('family_members')
      .select('*, parents(*)')
      .eq('user_id', userId)
      .eq('status', 'active')

    res.json({
      user: {
        id: userId,
        email: req.user!.email ?? '',
        ...profile,
        families: families || [],
      },
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Erro ao buscar dados do usuário' })
  }
})

/**
 * PUT /api/auth/profile
 * Atualiza perfil do usuário
 */
router.put(
  '/profile',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id
      const { full_name, phone, birth_date, avatar_url } = req.body

      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name,
          phone,
          birth_date,
          avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single()

      if (error) throw error

      res.json({
        message: 'Perfil atualizado com sucesso',
        profile: data,
      })
    } catch (error) {
      console.error('Update profile error:', error)
      res.status(500).json({ error: 'Erro ao atualizar perfil' })
    }
  }
)

/**
 * POST /api/auth/reset-password
 * Solicita reset de senha
 */
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = resetPasswordSchema.parse(req.body)

    const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
    })

    if (error) throw error

    res.json({
      message: 'Email de recuperação enviado com sucesso',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message })
    }
    console.error('Reset password error:', error)
    res.status(500).json({ error: 'Erro ao enviar email de recuperação' })
  }
})

/**
 * POST /api/auth/update-password
 * Atualiza senha do usuário autenticado
 */
router.post(
  '/update-password',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const body = updatePasswordSchema.parse(req.body)

      const { error } = await supabase.auth.updateUser({
        password: body.password,
      })

      if (error) throw error

      res.json({
        message: 'Senha atualizada com sucesso',
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors[0].message })
      }
      console.error('Update password error:', error)
      res.status(500).json({ error: 'Erro ao atualizar senha' })
    }
  }
)

/**
 * POST /api/auth/refresh
 * Atualiza token de acesso
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body

    if (!refresh_token) {
      res.status(400).json({ error: 'Refresh token obrigatório' })
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    })

    if (error) throw error

    res.json({
      message: 'Token atualizado com sucesso',
      session: data.session,
    })
  } catch (error) {
    console.error('Refresh token error:', error)
    res.status(401).json({ error: 'Refresh token inválido' })
  }
})

/**
 * DELETE /api/auth/account
 * Deleta conta do usuário
 */
router.delete(
  '/account',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id
      const { password } = req.body

      if (!password) {
        res
          .status(400)
          .json({ error: 'Senha obrigatória para confirmar exclusão' })
        return
      }

      if (!req.user!.email) {
        res.status(400).json({ error: 'Email não encontrado' })
        return
      }

      // Verifica senha antes de deletar
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: req.user!.email,
        password,
      })

      if (signInError) {
        res.status(401).json({ error: 'Senha incorreta' })
      }

      // Deleta usuário (cascade deleta perfil e relacionamentos)
      const { error } = await supabase.auth.admin.deleteUser(userId)

      if (error) throw error

      res.json({
        message: 'Conta deletada com sucesso',
      })
    } catch (error) {
      console.error('Delete account error:', error)
      res.status(500).json({ error: 'Erro ao deletar conta' })
    }
  }
)

export default router

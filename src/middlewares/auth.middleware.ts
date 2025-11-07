import { Request, Response, NextFunction } from 'express';
import { supabase } from '../index';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: { id: string; email?: string } | null;
}

/**
 * Middleware de autenticação - valida JWT token com Supabase
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

    if (!token) {
      res.status(401).json({ error: 'Unauthorized', message: 'Token não fornecido' });
      return;
    }

    // Valida token com Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Invalid token', { error: error?.message });
      res.status(401).json({ error: 'Unauthorized', message: 'Token inválido ou expirado' });
      return;
    }

    // Adiciona usuário ao request
    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    logger.error('Authentication error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware de autorização - verifica se usuário está autenticado
 */
export const authorize = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(403).json({ error: 'Forbidden', message: 'Acesso negado' });
    return;
  }
  next();
};

/**
 * Middleware para verificar se usuário é admin
 */
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verifica se é admin através do parent_id nos params
    const { parentId } = req.params;

    if (parentId) {
      const { data: familyMember } = await supabase
        .from('family_members')
        .select('role')
        .eq('parent_id', parentId)
        .eq('user_id', req.user.id)
        .eq('status', 'active')
        .single();

      if (!familyMember || familyMember.role !== 'admin') {
        res
          .status(403)
          .json({ error: 'Forbidden', message: 'Apenas administradores podem realizar esta ação' });
        return;
      }
    }

    next();
  } catch (error) {
    logger.error('Admin check error', error as Error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware para verificar permissões de família
 */
export const checkFamilyPermission = (permission: 'view' | 'edit' | 'delete') => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { parentId } = req.params;

      if (!parentId) {
        res.status(400).json({ error: 'Bad Request', message: 'parentId é obrigatório' });
        return;
      }

      // Verifica permissão
      const { data: familyMember, error } = await supabase
        .from('family_members')
        .select('role, permissions')
        .eq('parent_id', parentId)
        .eq('user_id', req.user.id)
        .eq('status', 'active')
        .single();

      if (error || !familyMember) {
        res.status(403).json({ error: 'Forbidden', message: 'Acesso negado' });
        return;
      }

      // Admin tem todas as permissões
      if (familyMember.role === 'admin') {
        next();
        return;
      }

      // Verifica permissão específica
      const hasPermission =
        permission === 'view'
          ? familyMember.permissions?.can_view
          : permission === 'edit'
          ? familyMember.permissions?.can_edit
          : familyMember.permissions?.can_delete;

      if (!hasPermission) {
        res.status(403).json({
          error: 'Forbidden',
          message: `Sem permissão para ${
            permission === 'view' ? 'visualizar' : permission === 'edit' ? 'editar' : 'deletar'
          }`,
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Permission check error', error as Error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

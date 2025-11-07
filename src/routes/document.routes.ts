import { Router } from 'express';
import { authenticate, checkFamilyPermission, AuthRequest } from '../middlewares/auth.middleware';
import { supabase } from '../index';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import NotificationService from '../services/notification.service';

const router = Router();

router.use(authenticate);

// Configuração do Multer para upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou PDF.'));
    }
  },
});

// Validation schema
const documentSchema = z.object({
  parent_id: z.string().uuid(),
  title: z.string().min(2, 'Título obrigatório'),
  type: z.enum(['exam', 'prescription', 'report', 'vaccine', 'other']),
  description: z.string().optional(),
  document_date: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/documents/parent/:parentId
 * Lista documentos de um idoso
 */
router.get('/parent/:parentId', checkFamilyPermission('view'), async (req: AuthRequest, res) => {
  try {
    const { parentId } = req.params;
    const { type, from, to, search, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('documents')
      .select(
        `
        *,
        uploaded_by_profile:profiles!uploaded_by(full_name, avatar_url)
      `,
        { count: 'exact' }
      )
      .eq('parent_id', parentId)
      .order('document_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    // Filtros
    if (type) {
      query = query.eq('type', type);
    }

    if (from) {
      query = query.gte('document_date', from);
    }

    if (to) {
      query = query.lte('document_date', to);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
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
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
});

/**
 * GET /api/documents/:id
 * Busca um documento específico
 */
router.get('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('documents')
      .select(
        `
        *,
        parents(*),
        uploaded_by_profile:profiles!uploaded_by(full_name, email, avatar_url)
      `
      )
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Documento não encontrado' });
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
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Erro ao buscar documento' });
  }
});

/**
 * POST /api/documents
 * Faz upload de um documento
 */
router.post('/', upload.single('file'), async (req: AuthRequest, res): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Arquivo obrigatório' });
      return;
    }

    const body = documentSchema.parse({
      ...req.body,
      tags: req.body.tags ? JSON.parse(req.body.tags) : undefined,
    });

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', body.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_edit && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para adicionar documentos' });
      return;
    }

    // Prepara arquivo
    let fileBuffer = req.file.buffer;
    const fileExt = path.extname(req.file.originalname);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`;
    const filePath = `${body.parent_id}/${fileName}`;

    // Se for imagem, otimiza
    if (req.file.mimetype.startsWith('image/')) {
      fileBuffer = await sharp(req.file.buffer)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    // Upload para Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('medical-documents')
      .upload(filePath, fileBuffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Salva metadados no banco
    const { data, error } = await supabase
      .from('documents')
      .insert({
        ...body,
        file_path: filePath,
        file_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploaded_by: req.user!.id,
      })
      .select()
      .single();

    if (error) {
      // Rollback: deleta arquivo se falhar ao salvar no banco
      await supabase.storage.from('medical-documents').remove([filePath]);
      throw error;
    }

    // Notifica outros membros
    const { data: otherMembers } = await supabase
      .from('family_members')
      .select('user_id, parents(name)')
      .eq('parent_id', body.parent_id)
      .neq('user_id', req.user!.id)
      .eq('status', 'active');

    if (otherMembers && otherMembers.length > 0) {
      for (const member of otherMembers) {
        const parentName = Array.isArray(member.parents)
          ? (member.parents[0] as { name?: string })?.name || 'o familiar'
          : (member.parents as { name?: string })?.name || 'o familiar';

        await NotificationService.createNotification(
          member.user_id,
          'document',
          '📄 Novo documento adicionado',
          `${body.title} foi adicionado para ${parentName}`,
          { document_id: data.id, parent_id: body.parent_id }
        );
      }
    }

    res.status(201).json({
      message: 'Documento enviado com sucesso',
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Erro ao fazer upload do documento' });
  }
});

/**
 * GET /api/documents/:id/download
 * Faz download de um documento
 */
router.get('/:id/download', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Busca documento
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (docError || !document) {
      res.status(404).json({ error: 'Documento não encontrado' });
    }

    // Verifica acesso
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', document.parent_id)
      .single();

    if (!familyMember?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    // Download do arquivo
    const { data, error } = await supabase.storage
      .from('medical-documents')
      .download(document.file_path);

    if (error) throw error;

    // Envia arquivo
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
    res.send(Buffer.from(await data.arrayBuffer()));
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Erro ao fazer download' });
  }
});

/**
 * GET /api/documents/:id/url
 * Retorna URL assinada temporária para visualização
 */
router.get('/:id/url', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { expires_in = 3600 } = req.query; // 1 hora default

    // Busca documento
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (docError || !document) {
      res.status(404).json({ error: 'Documento não encontrado' });
    }

    // Verifica acesso
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', document.parent_id)
      .single();

    if (!familyMember?.permissions?.can_view) {
      res.status(403).json({ error: 'Acesso negado' });
    }

    // Gera URL assinada
    const { data, error } = await supabase.storage
      .from('medical-documents')
      .createSignedUrl(document.file_path, Number(expires_in));

    if (error) throw error;

    res.json({
      url: data.signedUrl,
      expires_at: new Date(Date.now() + Number(expires_in) * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ error: 'Erro ao gerar URL' });
  }
});

/**
 * PUT /api/documents/:id
 * Atualiza metadados de um documento
 */
router.put('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Busca documento
    const { data: document } = await supabase
      .from('documents')
      .select('parent_id')
      .eq('id', id)
      .single();

    if (!document) {
      res.status(404).json({ error: 'Documento não encontrado' });
      return;
    }

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', document.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_edit && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para editar' });
      return;
    }

    const updates = documentSchema.partial().omit({ parent_id: true }).parse(req.body);

    const { data, error } = await supabase
      .from('documents')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Documento atualizado com sucesso',
      data,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Erro ao atualizar documento' });
  }
});

/**
 * DELETE /api/documents/:id
 * Deleta um documento
 */
router.delete('/:id', async (req: AuthRequest, res): Promise<void> => {
  try {
    const { id } = req.params;

    // Busca documento
    const { data: document } = await supabase
      .from('documents')
      .select('parent_id, file_path')
      .eq('id', id)
      .single();

    if (!document) {
      res.status(404).json({ error: 'Documento não encontrado' });
      return;
    }

    // Verifica permissão
    const { data: familyMember } = await supabase
      .from('family_members')
      .select('role, permissions')
      .eq('user_id', req.user!.id)
      .eq('parent_id', document.parent_id)
      .single();

    if (!familyMember || (!familyMember.permissions?.can_delete && familyMember.role !== 'admin')) {
      res.status(403).json({ error: 'Sem permissão para deletar' });
      return;
    }

    // Deleta do storage
    await supabase.storage.from('medical-documents').remove([document.file_path]);

    // Deleta do banco
    const { error } = await supabase.from('documents').delete().eq('id', id);

    if (error) throw error;

    res.json({ message: 'Documento removido com sucesso' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Erro ao deletar documento' });
  }
});

/**
 * GET /api/documents/stats/:parentId
 * Estatísticas de documentos
 */
router.get('/stats/:parentId', checkFamilyPermission('view'), async (req: AuthRequest, res) => {
  try {
    const { parentId } = req.params;

    // Total por tipo
    const { data: byType } = await supabase
      .from('documents')
      .select('type')
      .eq('parent_id', parentId);

    const typeStats = (byType || []).reduce((acc, doc) => {
      acc[doc.type] = (acc[doc.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Total de tamanho
    const { data: sizeData } = await supabase
      .from('documents')
      .select('file_size')
      .eq('parent_id', parentId);

    const totalSize = (sizeData || []).reduce((sum, doc) => sum + (doc.file_size || 0), 0);

    // Documentos recentes
    const { data: recent } = await supabase
      .from('documents')
      .select('created_at')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    res.json({
      data: {
        total: byType?.length || 0,
        by_type: typeStats,
        total_size_bytes: totalSize,
        total_size_mb: (totalSize / (1024 * 1024)).toFixed(2),
        last_upload: recent?.created_at || null,
      },
    });
  } catch (error) {
    console.error('Error fetching document stats:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export default router;

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Garante que usuários só acessem dados permitidos
-- =============================================

-- Habilita RLS em todas as tabelas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PROFILES POLICIES
-- =============================================

-- Usuários podem ver seu próprio perfil
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Usuários podem atualizar seu próprio perfil
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Membros da família podem ver perfis de outros membros
CREATE POLICY "Family members can view each other"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm1
      WHERE fm1.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM family_members fm2
        WHERE fm2.parent_id = fm1.parent_id
        AND fm2.user_id = profiles.id
      )
    )
  );

-- =============================================
-- PARENTS POLICIES
-- =============================================

-- Usuários podem criar idosos
CREATE POLICY "Users can create parents"
  ON parents FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Membros da família podem ver idosos
CREATE POLICY "Family members can view parents"
  ON parents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = parents.id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
    )
  );

-- Membros com permissão podem atualizar
CREATE POLICY "Members with permission can update parents"
  ON parents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = parents.id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
      AND (
        family_members.role = 'admin'
        OR (family_members.permissions->>'can_edit')::boolean = true
      )
    )
  );

-- Apenas admins podem deletar
CREATE POLICY "Only admins can delete parents"
  ON parents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = parents.id
      AND family_members.user_id = auth.uid()
      AND family_members.role = 'admin'
    )
  );

-- =============================================
-- FAMILY_MEMBERS POLICIES
-- =============================================

-- Membros podem ver outros membros da mesma família
CREATE POLICY "Members can view family members"
  ON family_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.parent_id = family_members.parent_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'active'
    )
  );

-- Admins podem adicionar membros
CREATE POLICY "Admins can add family members"
  ON family_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = family_members.parent_id
      AND family_members.user_id = auth.uid()
      AND family_members.role = 'admin'
    )
    OR invited_by = auth.uid() -- Permite primeiro membro (criador)
  );

-- Admins podem atualizar membros
CREATE POLICY "Admins can update family members"
  ON family_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.parent_id = family_members.parent_id
      AND fm.user_id = auth.uid()
      AND fm.role = 'admin'
    )
  );

-- Admins ou o próprio usuário podem deletar
CREATE POLICY "Admins or self can delete family members"
  ON family_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM family_members fm
      WHERE fm.parent_id = family_members.parent_id
      AND fm.user_id = auth.uid()
      AND fm.role = 'admin'
    )
  );

-- =============================================
-- MEDICATIONS POLICIES
-- =============================================

-- Membros podem ver medicamentos
CREATE POLICY "Members can view medications"
  ON medications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = medications.parent_id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
    )
  );

-- Membros com permissão podem criar
CREATE POLICY "Members with permission can create medications"
  ON medications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = medications.parent_id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
      AND (
        family_members.role = 'admin'
        OR (family_members.permissions->>'can_edit')::boolean = true
      )
    )
  );

-- Membros com permissão podem atualizar
CREATE POLICY "Members with permission can update medications"
  ON medications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = medications.parent_id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
      AND (
        family_members.role = 'admin'
        OR (family_members.permissions->>'can_edit')::boolean = true
      )
    )
  );

-- Membros com permissão podem deletar
CREATE POLICY "Members with permission can delete medications"
  ON medications FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = medications.parent_id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
      AND (
        family_members.role = 'admin'
        OR (family_members.permissions->>'can_delete')::boolean = true
      )
    )
  );

-- =============================================
-- MEDICATION_LOGS POLICIES
-- =============================================

-- Membros podem ver logs
CREATE POLICY "Members can view medication logs"
  ON medication_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM medications m
      JOIN family_members fm ON fm.parent_id = m.parent_id
      WHERE m.id = medication_logs.medication_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'active'
    )
  );

-- Membros podem criar logs (confirmar tomadas)
CREATE POLICY "Members can create medication logs"
  ON medication_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM medications m
      JOIN family_members fm ON fm.parent_id = m.parent_id
      WHERE m.id = medication_logs.medication_id
      AND fm.user_id = auth.uid()
      AND fm.status = 'active'
    )
  );

-- =============================================
-- APPOINTMENTS POLICIES
-- =============================================

-- Aplicar mesmas regras de medications para appointments
CREATE POLICY "Members can view appointments"
  ON appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = appointments.parent_id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
    )
  );

CREATE POLICY "Members with permission can create appointments"
  ON appointments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = appointments.parent_id
      AND family_members.user_id = auth.uid()
      AND (family_members.role = 'admin' OR (family_members.permissions->>'can_edit')::boolean = true)
    )
  );

CREATE POLICY "Members with permission can update appointments"
  ON appointments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = appointments.parent_id
      AND family_members.user_id = auth.uid()
      AND (family_members.role = 'admin' OR (family_members.permissions->>'can_edit')::boolean = true)
    )
  );

CREATE POLICY "Members with permission can delete appointments"
  ON appointments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = appointments.parent_id
      AND family_members.user_id = auth.uid()
      AND (family_members.role = 'admin' OR (family_members.permissions->>'can_delete')::boolean = true)
    )
  );

-- =============================================
-- DOCUMENTS POLICIES
-- =============================================

CREATE POLICY "Members can view documents"
  ON documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = documents.parent_id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
    )
  );

CREATE POLICY "Members with permission can upload documents"
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = documents.parent_id
      AND family_members.user_id = auth.uid()
      AND (family_members.role = 'admin' OR (family_members.permissions->>'can_edit')::boolean = true)
    )
  );

CREATE POLICY "Members with permission can update documents"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = documents.parent_id
      AND family_members.user_id = auth.uid()
      AND (family_members.role = 'admin' OR (family_members.permissions->>'can_edit')::boolean = true)
    )
  );

CREATE POLICY "Members with permission can delete documents"
  ON documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = documents.parent_id
      AND family_members.user_id = auth.uid()
      AND (family_members.role = 'admin' OR (family_members.permissions->>'can_delete')::boolean = true)
    )
  );

-- =============================================
-- NOTIFICATIONS POLICIES
-- =============================================

-- Usuários só veem suas próprias notificações
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Sistema pode criar notificações (via service key)
CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Usuários podem atualizar suas notificações
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Usuários podem deletar suas notificações
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- =============================================
-- PUSH_SUBSCRIPTIONS POLICIES
-- =============================================

CREATE POLICY "Users can manage own subscriptions"
  ON push_subscriptions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- ACTIVITY_LOGS POLICIES
-- =============================================

-- Logs são apenas de leitura para membros
CREATE POLICY "Members can view activity logs"
  ON activity_logs FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM family_members
      WHERE family_members.parent_id = activity_logs.parent_id
      AND family_members.user_id = auth.uid()
      AND family_members.status = 'active'
    )
  );

-- Sistema pode criar logs
CREATE POLICY "System can create activity logs"
  ON activity_logs FOR INSERT
  WITH CHECK (true);

-- =============================================
-- STORAGE POLICIES (Supabase Storage)
-- =============================================

-- Bucket: medical-documents
-- Executar no Supabase Dashboard > Storage > Policies

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'medical-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT parent_id::text FROM family_members
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Allow members to view documents
CREATE POLICY "Members can view documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'medical-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT parent_id::text FROM family_members
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Allow members with permission to delete
CREATE POLICY "Members with permission can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'medical-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT parent_id::text FROM family_members fm
    WHERE fm.user_id = auth.uid()
    AND fm.status = 'active'
    AND (fm.role = 'admin' OR (fm.permissions->>'can_delete')::boolean = true)
  )
);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Função para verificar se usuário tem permissão
CREATE OR REPLACE FUNCTION has_permission(
  p_user_id UUID,
  p_parent_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM family_members
    WHERE user_id = p_user_id
    AND parent_id = p_parent_id
    AND status = 'active'
    AND (
      role = 'admin'
      OR (
        CASE p_permission
          WHEN 'view' THEN (permissions->>'can_view')::boolean
          WHEN 'edit' THEN (permissions->>'can_edit')::boolean
          WHEN 'delete' THEN (permissions->>'can_delete')::boolean
          ELSE false
        END
      ) = true
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- GRANTS
-- =============================================

-- Garante que usuários autenticados possam acessar as tabelas
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================
-- COMENTÁRIOS
-- =============================================

COMMENT ON POLICY "Users can view own profile" ON profiles IS 'Permite que usuários vejam seu próprio perfil';
COMMENT ON POLICY "Family members can view parents" ON parents IS 'Membros da família podem ver dados dos idosos';
COMMENT ON FUNCTION has_permission IS 'Verifica se usuário tem permissão específica para um idoso';
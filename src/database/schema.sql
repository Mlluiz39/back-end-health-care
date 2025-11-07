-- =============================================
-- HEALTH CARE APP - DATABASE SCHEMA
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES TABLE
-- Perfis de usuários (sincronizado com Supabase Auth)
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  birth_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PARENTS TABLE
-- Pessoas sendo cuidadas (idosos)
-- =============================================
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  blood_type TEXT CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  avatar_url TEXT,
  
  -- Informações médicas
  allergies TEXT[],
  chronic_conditions TEXT[],
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  doctor_name TEXT,
  doctor_phone TEXT,
  health_insurance TEXT,
  insurance_number TEXT,
  
  -- Metadados
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FAMILY_MEMBERS TABLE
-- Membros da família com acesso aos dados de cada idoso
-- =============================================
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Permissões
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')) DEFAULT 'viewer',
  permissions JSONB DEFAULT '{"can_view": true, "can_edit": false, "can_delete": false}'::jsonb,
  
  -- Status
  status TEXT CHECK (status IN ('active', 'pending', 'inactive')) DEFAULT 'pending',
  invited_by UUID REFERENCES profiles(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(parent_id, user_id)
);

-- =============================================
-- MEDICATIONS TABLE
-- Medicamentos e tratamentos
-- =============================================
CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  
  -- Informações do medicamento
  name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  unit TEXT, -- mg, ml, comprimido, gotas, etc
  
  -- Frequência e horários
  frequency TEXT NOT NULL, -- daily, twice_daily, thrice_daily, weekly, as_needed
  times TEXT[], -- ['08:00', '20:00']
  instructions TEXT,
  
  -- Período de uso
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  
  -- Metadados
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_medications_parent ON medications(parent_id);
CREATE INDEX idx_medications_active ON medications(parent_id, is_active);

-- =============================================
-- MEDICATION_LOGS TABLE
-- Histórico de tomadas de medicamentos
-- =============================================
CREATE TABLE IF NOT EXISTS medication_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,
  
  -- Confirmação
  confirmed_by UUID REFERENCES profiles(id),
  taken_at TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('taken', 'skipped', 'missed')) DEFAULT 'taken',
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_medication_logs_medication ON medication_logs(medication_id);
CREATE INDEX idx_medication_logs_date ON medication_logs(taken_at DESC);

-- =============================================
-- APPOINTMENTS TABLE
-- Consultas médicas
-- =============================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  
  -- Informações da consulta
  doctor_name TEXT NOT NULL,
  specialty TEXT,
  clinic_name TEXT,
  location TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  
  -- Status e notas
  status TEXT CHECK (status IN ('scheduled', 'completed', 'cancelled', 'missed')) DEFAULT 'scheduled',
  notes TEXT,
  outcome TEXT, -- Resultado da consulta após realizada
  
  -- Lembretes
  reminder_sent BOOLEAN DEFAULT false,
  
  -- Metadados
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_appointments_parent ON appointments(parent_id);
CREATE INDEX idx_appointments_date ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(parent_id, status);

-- =============================================
-- DOCUMENTS TABLE
-- Exames, receitas e documentos médicos
-- =============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  
  -- Informações do documento
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('exam', 'prescription', 'report', 'vaccine', 'other')),
  description TEXT,
  document_date DATE,
  
  -- Storage
  file_path TEXT NOT NULL, -- Caminho no Supabase Storage
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  
  -- Categorização
  tags TEXT[],
  
  -- Metadados
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_documents_parent ON documents(parent_id);
CREATE INDEX idx_documents_type ON documents(parent_id, type);
CREATE INDEX idx_documents_date ON documents(document_date DESC);

-- =============================================
-- NOTIFICATIONS TABLE
-- Sistema de notificações
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Conteúdo
  type TEXT NOT NULL CHECK (type IN ('medication', 'appointment', 'document', 'family', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB, -- Dados adicionais contextuais
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- =============================================
-- PUSH_SUBSCRIPTIONS TABLE
-- Subscrições para notificações push
-- =============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Web Push data
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL, -- {p256dh, auth}
  
  -- Metadados
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, endpoint)
);

-- =============================================
-- ACTIVITY_LOGS TABLE (opcional)
-- Log de atividades para auditoria
-- =============================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  parent_id UUID REFERENCES parents(id),
  
  action TEXT NOT NULL, -- create, update, delete, view
  entity_type TEXT NOT NULL, -- medication, appointment, document, etc
  entity_id UUID,
  details JSONB,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca de logs
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id, created_at DESC);
CREATE INDEX idx_activity_logs_parent ON activity_logs(parent_id, created_at DESC);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parents_updated_at BEFORE UPDATE ON parents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_members_updated_at BEFORE UPDATE ON family_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medications_updated_at BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- VIEWS (opcional - para relatórios)
-- =============================================

-- View de adesão aos medicamentos
CREATE OR REPLACE VIEW medication_adherence AS
SELECT 
  m.parent_id,
  p.name as parent_name,
  m.id as medication_id,
  m.name as medication_name,
  COUNT(ml.id) as total_logs,
  COUNT(ml.id) FILTER (WHERE ml.status = 'taken') as taken_count,
  COUNT(ml.id) FILTER (WHERE ml.status = 'skipped') as skipped_count,
  COUNT(ml.id) FILTER (WHERE ml.status = 'missed') as missed_count,
  ROUND(
    COUNT(ml.id) FILTER (WHERE ml.status = 'taken')::numeric / 
    NULLIF(COUNT(ml.id), 0) * 100, 
    2
  ) as adherence_percentage
FROM medications m
LEFT JOIN medication_logs ml ON ml.medication_id = m.id
LEFT JOIN parents p ON p.id = m.parent_id
WHERE m.is_active = true
GROUP BY m.parent_id, p.name, m.id, m.name;

-- View de próximas consultas
CREATE OR REPLACE VIEW upcoming_appointments AS
SELECT 
  a.*,
  p.name as parent_name,
  p.avatar_url as parent_avatar
FROM appointments a
JOIN parents p ON p.id = a.parent_id
WHERE a.status = 'scheduled'
  AND a.scheduled_at > NOW()
ORDER BY a.scheduled_at ASC;

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE profiles IS 'Perfis de usuários da aplicação';
COMMENT ON TABLE parents IS 'Idosos sendo cuidados';
COMMENT ON TABLE family_members IS 'Membros da família com acesso';
COMMENT ON TABLE medications IS 'Medicamentos e tratamentos';
COMMENT ON TABLE medication_logs IS 'Histórico de tomadas';
COMMENT ON TABLE appointments IS 'Consultas médicas agendadas';
COMMENT ON TABLE documents IS 'Documentos e exames médicos';
COMMENT ON TABLE notifications IS 'Sistema de notificações';
COMMENT ON TABLE push_subscriptions IS 'Subscrições para notificações push';
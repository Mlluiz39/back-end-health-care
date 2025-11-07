# 🏥 Health Care Backend API

Backend API para o sistema de gerenciamento de saúde familiar.

## 📋 Stack Tecnológica

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Linguagem**: TypeScript
- **Banco de Dados**: PostgreSQL (via Supabase)
- **ORM/Client**: Supabase Client
- **Autenticação**: Supabase Auth + JWT
- **Notificações**: Web Push API
- **Agendamentos**: node-cron
- **Upload**: Multer + Sharp
- **Validação**: Zod

---

## 🚀 Quick Start

### Setup Automatizado (Recomendado)

```bash
# Clone o repositório
git clone <repo-url>
cd back-end-health-care

# Execute o script de setup
bash scripts/setup.sh
```

### Setup Manual

#### 1. Instalação

```bash
# Clone o repositório
git clone <repo-url>
cd back-end-health-care

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp env.example .env
# Edite o .env com suas credenciais
```

#### 2. Configuração do Banco de Dados

```bash
# Execute o schema SQL no Supabase Dashboard
# Copie e cole o conteúdo de src/database/schema.sql
# Depois execute src/database/rls.sql para Row Level Security
# Crie o bucket 'medical-documents' no Supabase Storage
```

#### 3. Executar Localmente

```bash
# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm run build
npm start
```

A API estará rodando em `http://localhost:3000`

---

## 📚 Documentação Adicional

- **[NEXT_STEPS.md](./NEXT_STEPS.md)** - Guia completo de próximos passos para produção
- **[DEPLOY.md](./DEPLOY.md)** - Guia detalhado de deploy em diferentes plataformas
- **[env.example](./env.example)** - Exemplo de variáveis de ambiente

---

## 📁 Estrutura do Projeto

```
src/
├── index.ts                 # Entry point
├── middlewares/
│   ├── auth.middleware.ts   # Autenticação JWT
│   ├── error.middleware.ts  # Error handling
│   └── validation.middleware.ts
├── routes/
│   ├── auth.routes.ts       # /api/auth
│   ├── parent.routes.ts     # /api/parents
│   ├── medication.routes.ts # /api/medications
│   ├── appointment.routes.ts# /api/appointments
│   ├── document.routes.ts   # /api/documents
│   ├── family.routes.ts     # /api/family
│   └── notification.routes.ts
├── services/
│   ├── notification.service.ts
│   ├── storage.service.ts
│   └── email.service.ts
├── jobs/
│   └── scheduler.ts         # Cron jobs
├── utils/
│   ├── logger.ts
│   └── validators.ts
└── types/
    └── index.d.ts

database/
├── schema.sql              # Schema completo
├── rls.sql                 # Row Level Security
└── migrations/             # Migrações futuras
```

---

## 🔐 Autenticação

Todas as rotas (exceto `/health` e `/api/auth/*`) requerem autenticação via JWT.

### Header de Autenticação

```
Authorization: Bearer <seu-token-jwt>
```

### Obter Token

O token é obtido através do login no Supabase Auth:

```typescript
// No frontend
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@email.com',
  password: 'senha'
});

const token = data.session.access_token;
```

---

## 📡 Endpoints

### 🏥 Parents (Idosos)

#### `GET /api/parents`
Lista todos os idosos que o usuário tem acesso.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Maria Silva",
      "birth_date": "1950-05-15",
      "avatar_url": "url",
      "role": "admin"
    }
  ]
}
```

#### `POST /api/parents`
Cria um novo idoso.

**Body:**
```json
{
  "name": "Maria Silva",
  "birth_date": "1950-05-15",
  "gender": "female",
  "blood_type": "A+",
  "allergies": ["penicilina"],
  "chronic_conditions": ["diabetes", "hipertensão"]
}
```

#### `PUT /api/parents/:id`
Atualiza dados de um idoso.

#### `DELETE /api/parents/:id`
Remove um idoso (apenas admin).

---

### 💊 Medications (Medicamentos)

#### `GET /api/medications/parent/:parentId`
Lista medicamentos de um idoso.

**Query params:**
- `active=true|false` - Filtrar por ativos/inativos

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Losartana",
      "dosage": "50mg",
      "frequency": "daily",
      "times": ["08:00", "20:00"],
      "is_active": true
    }
  ]
}
```

#### `POST /api/medications`
Adiciona um medicamento.

**Body:**
```json
{
  "parent_id": "uuid",
  "name": "Losartana",
  "dosage": "50mg",
  "frequency": "twice_daily",
  "times": ["08:00", "20:00"],
  "instructions": "Tomar com água",
  "start_date": "2024-01-01"
}
```

#### `POST /api/medications/:id/confirm`
Confirma a tomada de um medicamento.

**Body:**
```json
{
  "taken_at": "2024-01-15T08:00:00Z",
  "notes": "Tomado corretamente"
}
```

#### `GET /api/medications/:id/logs`
Histórico de tomadas.

**Query params:**
- `start_date` - Data inicial
- `end_date` - Data final
- `limit` - Limite de resultados (default: 50)

---

### 📅 Appointments (Consultas)

#### `GET /api/appointments/parent/:parentId`
Lista consultas de um idoso.

**Query params:**
- `status=scheduled|completed|cancelled|missed`
- `from` - Data inicial
- `to` - Data final

#### `POST /api/appointments`
Agenda uma consulta.

**Body:**
```json
{
  "parent_id": "uuid",
  "doctor_name": "Dr. João",
  "specialty": "Cardiologia",
  "clinic_name": "Clínica Santa Maria",
  "location": "Rua das Flores, 123",
  "scheduled_at": "2024-01-20T10:00:00Z",
  "duration_minutes": 60,
  "notes": "Levar exames anteriores"
}
```

#### `PUT /api/appointments/:id`
Atualiza uma consulta.

#### `PATCH /api/appointments/:id/status`
Atualiza apenas o status da consulta.

**Body:**
```json
{
  "status": "completed",
  "outcome": "Tudo ok, retornar em 3 meses"
}
```

---

### 📄 Documents (Documentos)

#### `GET /api/documents/parent/:parentId`
Lista documentos de um idoso.

**Query params:**
- `type=exam|prescription|report|vaccine|other`
- `from` - Data inicial
- `to` - Data final

#### `POST /api/documents`
Faz upload de um documento.

**Content-Type:** `multipart/form-data`

**Form data:**
```
parent_id: uuid
title: string
type: exam|prescription|report|vaccine|other
description: string (opcional)
document_date: date
file: File (PDF ou imagem)
```

#### `GET /api/documents/:id/download`
Faz download de um documento.

**Response:** Arquivo binário

---

### 👨‍👩‍👧‍👦 Family (Família)

#### `GET /api/family/parent/:parentId/members`
Lista membros da família.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "role": "admin",
      "permissions": {
        "can_view": true,
        "can_edit": true,
        "can_delete": true
      },
      "status": "active",
      "profile": {
        "full_name": "João Silva",
        "email": "joao@email.com"
      }
    }
  ]
}
```

#### `POST /api/family/invite`
Convida um membro para a família.

**Body:**
```json
{
  "parent_id": "uuid",
  "email": "membro@email.com",
  "role": "editor",
  "permissions": {
    "can_view": true,
    "can_edit": true,
    "can_delete": false
  }
}
```

#### `PATCH /api/family/members/:memberId/permissions`
Atualiza permissões de um membro.

**Body:**
```json
{
  "role": "admin",
  "permissions": {
    "can_view": true,
    "can_edit": true,
    "can_delete": true
  }
}
```

#### `DELETE /api/family/members/:memberId`
Remove um membro da família.

---

### 🔔 Notifications

#### `GET /api/notifications`
Lista notificações do usuário.

**Query params:**
- `unread=true` - Apenas não lidas
- `type=medication|appointment|document|family|system`
- `limit=20`

#### `PATCH /api/notifications/:id/read`
Marca notificação como lida.

#### `POST /api/notifications/read-all`
Marca todas como lidas.

#### `POST /api/notifications/subscribe`
Registra subscrição para push notifications.

**Body:**
```json
{
  "subscription": {
    "endpoint": "https://...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

---

## ⏰ Cron Jobs

O backend executa tarefas agendadas automaticamente:

### Lembretes de Medicamentos
- **Frequência**: A cada 5 minutos
- **Ação**: Verifica medicamentos programados e envia notificações

### Lembretes de Consultas
- **Frequência**: Todo dia às 08:00
- **Ação**: Notifica consultas do dia seguinte

### Limpeza de Notificações
- **Frequência**: Todo dia às 03:00
- **Ação**: Remove notificações com mais de 30 dias

### Atualização de Status
- **Frequência**: Todo dia às 00:00 e 00:30
- **Ação**: Atualiza medicamentos vencidos e consultas passadas

### Relatório Semanal
- **Frequência**: Todo domingo às 20:00
- **Ação**: Envia resumo de adesão aos medicamentos

---

## 🔒 Segurança

### Row Level Security (RLS)

O banco de dados usa RLS para garantir que:
- Usuários só acessem dados de idosos aos quais têm permissão
- Permissões sejam respeitadas (view, edit, delete)
- Admins tenham controle total

### Rate Limiting

Limites de requisições:
- **Global**: 100 requisições por 15 minutos
- **Login**: 5 tentativas por 15 minutos
- **Upload**: 10 arquivos por hora

### Validação de Dados

Todas as entradas são validadas com Zod:
```typescript
const medicationSchema = z.object({
  name: z.string().min(2).max(100),
  dosage: z.string(),
  frequency: z.enum(['daily', 'twice_daily', 'thrice_daily']),
  // ...
});
```

---

## 📊 Monitoramento

### Logs

Logs estruturados com Winston:
```typescript
logger.info('Medication created', { 
  medication_id, 
  parent_id, 
  created_by 
});
```

### Health Check

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00Z",
  "service": "Health Care API"
}
```

---

## 🧪 Testes

```bash
# Testes unitários
npm test

# Testes com coverage
npm run test:coverage

# Testes E2E
npm run test:e2e
```

---

## 🚀 Deploy

Para instruções detalhadas de deploy, consulte o **[DEPLOY.md](./DEPLOY.md)**.

### Opções de Deploy

- **Railway / Render** - Deploy simples com Git
- **Docker** - Containerização completa
- **VPS (AWS, DigitalOcean)** - Controle total

### Quick Deploy (Docker)

```bash
# Build
npm run docker:build

# Run
npm run docker:run
```

---

## 📝 Variáveis de Ambiente

Veja **[env.example](./env.example)** para lista completa.

**Essenciais:**
- `SUPABASE_URL` - URL do projeto Supabase
- `SUPABASE_SERVICE_KEY` - Service role key (nunca exponha no frontend!)
- `VAPID_PUBLIC_KEY` - Para push notifications
- `VAPID_PRIVATE_KEY` - Para push notifications

**Gerar chaves VAPID:**
```bash
npm run generate:vapid
```

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

---

## 📄 Licença

MIT License - veja LICENSE para detalhes

---

## 📞 Suporte

- 📧 Email: mlluizpereira39@gmail.com
- 📖 Docs: https://docs.healthcareapp.com
- 🐛 Issues: https://github.com/mlluiz39/back-end-health-care/issues
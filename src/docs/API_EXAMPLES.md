# 📡 API Examples - Exemplos de Uso

Exemplos práticos de como usar a API Health Care.

## 🔐 Autenticação

### 1. Registrar Novo Usuário

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@email.com",
    "password": "senha123",
    "full_name": "João Silva",
    "phone": "+55 11 99999-9999"
  }'
```

**Response:**
```json
{
  "message": "Usuário criado com sucesso! Verifique seu email.",
  "user": {
    "id": "uuid",
    "email": "joao@email.com",
    "full_name": "João Silva"
  }
}
```

### 2. Fazer Login

```bash
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@email.com",
    "password": "senha123"
  }'
```

**Response:**
```json
{
  "message": "Login realizado com sucesso",
  "session": {
    "access_token": "eyJhbGc...",
    "refresh_token": "...",
    "expires_in": 3600
  },
  "user": { ... }
}
```

**💡 Dica:** Salve o `access_token` para usar nas próximas requisições!

### 3. Buscar Dados do Usuário

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

---

## 👴 Gerenciar Idosos

### 1. Criar um Novo Idoso

```bash
curl -X POST http://localhost:3000/api/parents \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maria Silva",
    "birth_date": "1950-05-15",
    "gender": "female",
    "blood_type": "A+",
    "allergies": ["penicilina", "dipirona"],
    "chronic_conditions": ["diabetes tipo 2", "hipertensão"],
    "emergency_contact_name": "João Silva",
    "emergency_contact_phone": "+55 11 98888-8888",
    "doctor_name": "Dr. Carlos Souza",
    "doctor_phone": "+55 11 3333-4444"
  }'
```

### 2. Listar Idosos

```bash
curl -X GET http://localhost:3000/api/parents \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 3. Dashboard do Idoso

```bash
curl -X GET http://localhost:3000/api/parents/{parentId}/dashboard \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 💊 Gerenciar Medicamentos

### 1. Adicionar Medicamento

```bash
curl -X POST http://localhost:3000/api/medications \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parent_id": "uuid-do-idoso",
    "name": "Losartana",
    "dosage": "50mg",
    "frequency": "twice_daily",
    "times": ["08:00", "20:00"],
    "instructions": "Tomar com água, após café e jantar",
    "start_date": "2024-01-01"
  }'
```

### 2. Listar Medicamentos Ativos

```bash
curl -X GET "http://localhost:3000/api/medications/parent/{parentId}?active=true" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 3. Confirmar Tomada

```bash
curl -X POST http://localhost:3000/api/medications/{medicationId}/confirm \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taken_at": "2024-01-15T08:00:00Z",
    "notes": "Tomado corretamente"
  }'
```

### 4. Histórico de Tomadas

```bash
curl -X GET "http://localhost:3000/api/medications/{medicationId}/logs?limit=30" \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 📅 Gerenciar Consultas

### 1. Agendar Consulta

```bash
curl -X POST http://localhost:3000/api/appointments \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parent_id": "uuid-do-idoso",
    "doctor_name": "Dr. João Cardiologista",
    "specialty": "Cardiologia",
    "clinic_name": "Clínica Coração",
    "location": "Rua das Flores, 123 - São Paulo",
    "scheduled_at": "2024-02-15T10:00:00Z",
    "duration_minutes": 60,
    "notes": "Levar exames de sangue anteriores"
  }'
```

### 2. Listar Próximas Consultas

```bash
curl -X GET "http://localhost:3000/api/appointments/parent/{parentId}?upcoming=true" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 3. Atualizar Status da Consulta

```bash
curl -X PATCH http://localhost:3000/api/appointments/{appointmentId}/status \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed",
    "outcome": "Pressão controlada, retornar em 3 meses. Medicação mantida."
  }'
```

### 4. Calendário Mensal

```bash
curl -X GET "http://localhost:3000/api/appointments/calendar/{parentId}/2024-02" \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 📄 Gerenciar Documentos

### 1. Upload de Documento

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Authorization: Bearer SEU_TOKEN" \
  -F "parent_id=uuid-do-idoso" \
  -F "title=Exame de Sangue - Janeiro 2024" \
  -F "type=exam" \
  -F "description=Hemograma completo + glicemia" \
  -F "document_date=2024-01-10" \
  -F "file=@/caminho/para/exame.pdf"
```

### 2. Listar Documentos

```bash
curl -X GET "http://localhost:3000/api/documents/parent/{parentId}?type=exam&limit=20" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 3. Gerar URL Temporária

```bash
curl -X GET "http://localhost:3000/api/documents/{documentId}/url?expires_in=3600" \
  -H "Authorization: Bearer SEU_TOKEN"
```

**Response:**
```json
{
  "url": "https://supabase.co/storage/signed/...",
  "expires_at": "2024-01-15T10:00:00Z"
}
```

### 4. Download de Documento

```bash
curl -X GET http://localhost:3000/api/documents/{documentId}/download \
  -H "Authorization: Bearer SEU_TOKEN" \
  --output documento.pdf
```

### 5. Estatísticas de Documentos

```bash
curl -X GET http://localhost:3000/api/documents/stats/{parentId} \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 👨‍👩‍👧‍👦 Gerenciar Família

### 1. Convidar Membro

```bash
curl -X POST http://localhost:3000/api/family/invite \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parent_id": "uuid-do-idoso",
    "email": "maria@email.com",
    "role": "editor",
    "permissions": {
      "can_view": true,
      "can_edit": true,
      "can_delete": false
    }
  }'
```

### 2. Listar Membros da Família

```bash
curl -X GET http://localhost:3000/api/family/parent/{parentId}/members \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 3. Ver Convites Pendentes

```bash
curl -X GET http://localhost:3000/api/family/invites \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 4. Aceitar Convite

```bash
curl -X POST http://localhost:3000/api/family/invites/{inviteId}/accept \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 5. Recusar Convite

```bash
curl -X POST http://localhost:3000/api/family/invites/{inviteId}/decline \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 6. Atualizar Permissões de Membro

```bash
curl -X PATCH http://localhost:3000/api/family/members/{memberId}/permissions \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "admin",
    "permissions": {
      "can_view": true,
      "can_edit": true,
      "can_delete": true
    }
  }'
```

### 7. Remover Membro

```bash
curl -X DELETE http://localhost:3000/api/family/members/{memberId} \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 🔔 Notificações

### 1. Listar Notificações

```bash
curl -X GET "http://localhost:3000/api/notifications?unread=true&limit=20" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 2. Contar Não Lidas

```bash
curl -X GET http://localhost:3000/api/notifications/unread/count \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 3. Marcar Como Lida

```bash
curl -X PATCH http://localhost:3000/api/notifications/{notificationId}/read \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 4. Marcar Todas Como Lidas

```bash
curl -X POST http://localhost:3000/api/notifications/read-all \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 5. Registrar Push Notification

```bash
curl -X POST http://localhost:3000/api/notifications/subscribe \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "keys": {
        "p256dh": "base64-key...",
        "auth": "base64-auth..."
      }
    }
  }'
```

### 6. Enviar Notificação de Teste

```bash
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 🧪 Testes com JavaScript/Fetch

### Exemplo Completo com Fetch API

```javascript
// 1. Login
async function login() {
  const response = await fetch('http://localhost:3000/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'joao@email.com',
      password: 'senha123'
    })
  });
  
  const data = await response.json();
  localStorage.setItem('token', data.session.access_token);
  return data.session.access_token;
}

// 2. Buscar medicamentos
async function getMedications(parentId) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(
    `http://localhost:3000/api/medications/parent/${parentId}?active=true`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  
  return await response.json();
}

// 3. Confirmar tomada
async function confirmMedication(medicationId) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(
    `http://localhost:3000/api/medications/${medicationId}/confirm`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        taken_at: new Date().toISOString(),
        notes: 'Tomado corretamente'
      })
    }
  );
  
  return await response.json();
}

// Uso
(async () => {
  await login();
  const medications = await getMedications('parent-uuid');
  console.log('Medicamentos:', medications);
})();
```

---

## 📊 Postman Collection

Para importar no Postman, crie uma collection com estas variáveis:

```json
{
  "base_url": "http://localhost:3000",
  "token": "seu-token-aqui",
  "parent_id": "uuid-do-idoso",
  "medication_id": "uuid-do-medicamento"
}
```

Use `{{base_url}}`, `{{token}}`, etc nas requisições.

---

## 🔧 Troubleshooting

### Erro 401 - Unauthorized

```bash
# Verifique se o token é válido
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer SEU_TOKEN"
```

Se expirado, faça login novamente ou use refresh token.

### Erro 403 - Forbidden

Você não tem permissão para esta ação. Verifique:
- Se você é membro da família do idoso
- Se suas permissões incluem a ação desejada
- Se você é admin (para ações administrativas)

### Erro 404 - Not Found

O recurso não existe. Verifique se:
- O ID está correto
- O recurso não foi deletado
- Você tem acesso a ele

---

## 💡 Dicas

1. **Rate Limiting**: A API tem limite de 100 requisições por 15 minutos
2. **Token Expiration**: Tokens expiram em 1 hora, use refresh token
3. **File Upload**: Máximo 10MB por arquivo
4. **Timezone**: Todas as datas são em UTC (ISO 8601)
5. **Pagination**: Use `limit` e `offset` para paginação

---

## 📚 Recursos Adicionais

- [Documentação Completa](./README.md)
- [Schema do Banco](../database/schema.sql)
- [Políticas RLS](../database/rls.sql)
- [Postman Collection](./Health_Care_API.postman_collection.json)

---

**Happy Coding! 🚀**
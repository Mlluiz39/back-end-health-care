# 🚀 Próximos Passos para Produção

Este documento guia você através dos passos necessários para colocar o projeto em produção.

---

## 📋 Checklist Pré-Deploy

### 1. Configuração de Ambiente

- [ ] **Criar arquivo `.env`**
  ```bash
  cp env.example .env
  ```
  
- [ ] **Configurar variáveis obrigatórias:**
  - [ ] `SUPABASE_URL` - URL do seu projeto Supabase
  - [ ] `SUPABASE_SERVICE_KEY` - Service role key (nunca exponha no frontend!)
  - [ ] `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` - Para push notifications
  - [ ] `FRONTEND_URL` - URL do frontend em produção

- [ ] **Gerar chaves VAPID** (se ainda não tiver):
  ```bash
  npm run generate:vapid
  ```

### 2. Banco de Dados

- [ ] **Executar schema SQL no Supabase:**
  - [ ] Copiar conteúdo de `src/database/schema.sql`
  - [ ] Executar no SQL Editor do Supabase Dashboard
  
- [ ] **Configurar Row Level Security (RLS):**
  - [ ] Copiar conteúdo de `src/database/rls.sql`
  - [ ] Executar no SQL Editor do Supabase Dashboard

- [ ] **Criar Storage Bucket:**
  - [ ] No Supabase Dashboard, vá em Storage
  - [ ] Criar bucket `medical-documents`
  - [ ] Configurar políticas de acesso conforme necessário

- [ ] **Verificar políticas RLS:**
  - [ ] Testar acesso com diferentes usuários
  - [ ] Verificar se permissões estão funcionando corretamente

### 3. Testes Locais

- [ ] **Instalar dependências:**
  ```bash
  npm install
  ```

- [ ] **Verificar build:**
  ```bash
  npm run build
  ```

- [ ] **Testar localmente:**
  ```bash
  npm run dev
  ```

- [ ] **Testar endpoints principais:**
  - [ ] Health check: `GET /health`
  - [ ] Signup: `POST /api/auth/signup`
  - [ ] Signin: `POST /api/auth/signin`
  - [ ] Criar parent: `POST /api/parents`
  - [ ] Listar parents: `GET /api/parents`

- [ ] **Verificar logs:**
  - [ ] Confirmar que logger está funcionando
  - [ ] Verificar formato JSON dos logs

### 4. Segurança

- [ ] **Revisar configurações de segurança:**
  - [ ] Verificar CORS está configurado corretamente
  - [ ] Confirmar rate limiting está ativo
  - [ ] Verificar Helmet está configurado

- [ ] **Verificar variáveis sensíveis:**
  - [ ] Confirmar que `.env` está no `.gitignore`
  - [ ] Nunca commitar chaves ou tokens
  - [ ] Usar variáveis de ambiente no servidor

- [ ] **Testar autenticação:**
  - [ ] Testar com token válido
  - [ ] Testar com token inválido
  - [ ] Testar sem token
  - [ ] Verificar expiração de tokens

### 5. Performance

- [ ] **Otimizar queries:**
  - [ ] Revisar queries do Supabase
  - [ ] Adicionar índices se necessário
  - [ ] Verificar uso de `.select()` para limitar campos

- [ ] **Configurar cache (opcional):**
  - [ ] Considerar Redis para cache de sessões
  - [ ] Cache de queries frequentes

### 6. Monitoramento

- [ ] **Configurar logging:**
  - [ ] Verificar logs estão sendo gerados corretamente
  - [ ] Configurar rotação de logs (se necessário)
  - [ ] Integrar com serviço de logs (ex: Logtail, Datadog)

- [ ] **Health checks:**
  - [ ] Configurar health check endpoint
  - [ ] Configurar monitoramento externo

- [ ] **Alertas:**
  - [ ] Configurar alertas para erros críticos
  - [ ] Alertas para alta taxa de erro
  - [ ] Alertas para downtime

---

## 🚀 Deploy

### Opção 1: Railway / Render

1. **Conectar repositório:**
   - [ ] Conectar GitHub/GitLab ao Railway/Render
   - [ ] Selecionar branch de produção

2. **Configurar variáveis de ambiente:**
   - [ ] Adicionar todas as variáveis do `.env`
   - [ ] Verificar valores estão corretos

3. **Configurar build:**
   - [ ] Build command: `npm run build`
   - [ ] Start command: `npm start`
   - [ ] Node version: `18.x` ou superior

4. **Deploy:**
   - [ ] Fazer deploy inicial
   - [ ] Verificar logs de deploy
   - [ ] Testar endpoints após deploy

### Opção 2: Docker

1. **Build da imagem:**
   ```bash
   npm run docker:build
   ```

2. **Testar localmente:**
   ```bash
   npm run docker:run
   ```

3. **Push para registry:**
   ```bash
   docker tag health-care-api your-registry/health-care-api:latest
   docker push your-registry/health-care-api:latest
   ```

4. **Deploy em servidor:**
   - [ ] Configurar docker-compose ou Kubernetes
   - [ ] Configurar variáveis de ambiente
   - [ ] Configurar volumes para logs (se necessário)

### Opção 3: VPS (DigitalOcean, AWS EC2, etc.)

1. **Preparar servidor:**
   - [ ] Instalar Node.js 18+
   - [ ] Instalar PM2 ou similar
   - [ ] Configurar Nginx (reverse proxy)
   - [ ] Configurar SSL (Let's Encrypt)

2. **Deploy:**
   ```bash
   git clone <repo>
   cd back-end-health-care
   npm install
   npm run build
   ```

3. **Configurar PM2:**
   ```bash
   pm2 start dist/index.js --name health-care-api
   pm2 save
   pm2 startup
   ```

4. **Configurar Nginx:**
   - [ ] Criar configuração de reverse proxy
   - [ ] Configurar SSL
   - [ ] Testar acesso

---

## 📊 Pós-Deploy

### 1. Verificações Iniciais

- [ ] **Testar endpoints:**
  - [ ] Health check
  - [ ] Autenticação
  - [ ] CRUD básico

- [ ] **Verificar logs:**
  - [ ] Confirmar logs estão sendo gerados
  - [ ] Verificar formato está correto
  - [ ] Confirmar sem erros críticos

- [ ] **Verificar cron jobs:**
  - [ ] Confirmar que estão rodando
  - [ ] Verificar logs dos jobs
  - [ ] Testar manualmente se possível

### 2. Monitoramento Contínuo

- [ ] **Configurar dashboards:**
  - [ ] Métricas de performance
  - [ ] Taxa de erro
  - [ ] Uso de recursos

- [ ] **Alertas:**
  - [ ] CPU/Memória alta
  - [ ] Taxa de erro alta
  - [ ] Tempo de resposta alto

### 3. Backup

- [ ] **Configurar backup do banco:**
  - [ ] Backup automático do Supabase
  - [ ] Backup manual periódico
  - [ ] Testar restauração

- [ ] **Backup de arquivos:**
  - [ ] Backup do storage (documentos)
  - [ ] Verificar retenção

---

## 🧪 Testes

### Testes Manuais

- [ ] **Fluxo completo de usuário:**
  - [ ] Registro
  - [ ] Login
  - [ ] Criar parent
  - [ ] Adicionar medicamento
  - [ ] Agendar consulta
  - [ ] Upload de documento
  - [ ] Convidar membro da família

- [ ] **Testes de segurança:**
  - [ ] Tentar acessar dados sem autenticação
  - [ ] Tentar acessar dados de outro usuário
  - [ ] Testar rate limiting
  - [ ] Testar validação de inputs

### Testes Automatizados (Futuro)

- [ ] **Configurar Jest:**
  ```bash
  npm install --save-dev jest @types/jest ts-jest
  ```

- [ ] **Criar testes unitários:**
  - [ ] Testes de validação
  - [ ] Testes de serviços
  - [ ] Testes de middlewares

- [ ] **Criar testes de integração:**
  - [ ] Testes de rotas
  - [ ] Testes de fluxos completos

---

## 📝 Documentação

### Documentação Técnica

- [ ] **Atualizar README:**
  - [ ] Adicionar instruções de deploy
  - [ ] Adicionar troubleshooting
  - [ ] Atualizar exemplos de API

- [ ] **Documentar variáveis de ambiente:**
  - [ ] Descrição de cada variável
  - [ ] Valores padrão
  - [ ] Onde obter valores

- [ ] **Documentar arquitetura:**
  - [ ] Diagrama de fluxo
  - [ ] Estrutura de banco de dados
  - [ ] Fluxo de autenticação

### Documentação de API

- [ ] **Swagger/OpenAPI (opcional):**
  - [ ] Instalar swagger-ui-express
  - [ ] Documentar todos os endpoints
  - [ ] Adicionar exemplos

---

## 🔧 Melhorias Futuras

### Curto Prazo

- [ ] **Adicionar testes automatizados**
- [ ] **Implementar CI/CD**
- [ ] **Adicionar métricas (Prometheus/Grafana)**
- [ ] **Melhorar tratamento de erros específicos**

### Médio Prazo

- [ ] **Cache com Redis**
- [ ] **Queue para processamento assíncrono (Bull)**
- [ ] **WebSockets para notificações em tempo real**
- [ ] **Testes E2E**

### Longo Prazo

- [ ] **Microserviços (se necessário)**
- [ ] **CDN para assets**
- [ ] **Multi-tenancy**
- [ ] **Analytics e relatórios**

---

## 🆘 Troubleshooting

### Problemas Comuns

1. **Erro de autenticação:**
   - Verificar `SUPABASE_SERVICE_KEY` está correto
   - Verificar token JWT está sendo enviado corretamente
   - Verificar RLS está configurado

2. **Erro de conexão com banco:**
   - Verificar `SUPABASE_URL` está correto
   - Verificar rede/firewall
   - Verificar credenciais

3. **Cron jobs não rodam:**
   - Verificar `ENABLE_CRON_JOBS=true`
   - Verificar logs do scheduler
   - Verificar timezone do servidor

4. **Rate limiting muito restritivo:**
   - Ajustar valores em `.env`
   - Verificar se está em produção vs desenvolvimento

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar logs primeiro
2. Consultar documentação
3. Verificar issues conhecidos
4. Abrir issue no repositório

---

## ✅ Checklist Final

Antes de considerar produção:

- [ ] Todos os testes passando
- [ ] Variáveis de ambiente configuradas
- [ ] Banco de dados configurado
- [ ] RLS configurado
- [ ] Storage configurado
- [ ] Logs funcionando
- [ ] Monitoramento configurado
- [ ] Backup configurado
- [ ] Documentação atualizada
- [ ] Equipe treinada

---

**Última atualização:** $(date)


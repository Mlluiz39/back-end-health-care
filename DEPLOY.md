# 🚀 Guia de Deploy

Guia rápido para fazer deploy do projeto em diferentes plataformas.

---

## 📦 Pré-requisitos

1. **Variáveis de ambiente configuradas** (ver `env.example`)
2. **Banco de dados configurado** (Supabase)
3. **Build funcionando localmente**

---

## 🚂 Railway

### 1. Criar projeto no Railway

```bash
# Instalar CLI (opcional)
npm i -g @railway/cli

# Login
railway login

# Criar projeto
railway init
```

### 2. Configurar variáveis

No dashboard do Railway:
- Settings → Variables
- Adicionar todas as variáveis do `.env`

### 3. Deploy

```bash
# Deploy automático via Git
git push origin main

# Ou deploy manual
railway up
```

### 4. Configurar domínio

- Settings → Domains
- Adicionar domínio customizado (opcional)

---

## 🎨 Render

### 1. Criar Web Service

1. Acesse [render.com](https://render.com)
2. New → Web Service
3. Conecte seu repositório

### 2. Configurações

- **Name:** `health-care-api`
- **Environment:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Plan:** Free ou Paid

### 3. Variáveis de Ambiente

- Environment → Environment Variables
- Adicionar todas as variáveis

### 4. Deploy

- Deploy automático no push
- Ou Manual Deploy no dashboard

---

## 🐳 Docker

### Build Local

```bash
# Build
docker build -t health-care-api .

# Run
docker run -p 3000:3000 --env-file .env health-care-api
```

### Docker Compose

Crie `docker-compose.yml`:

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 40s
```

```bash
docker-compose up -d
```

### Deploy em VPS

```bash
# No servidor
git clone <repo>
cd back-end-health-care

# Criar .env
nano .env

# Build e run
docker-compose up -d
```

---

## ☁️ AWS / DigitalOcean

### 1. Preparar servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2
sudo npm install -g pm2

# Instalar Nginx
sudo apt install nginx -y
```

### 2. Deploy aplicação

```bash
# Clonar repositório
git clone <repo>
cd back-end-health-care

# Instalar dependências
npm install

# Build
npm run build

# Criar .env
nano .env

# Iniciar com PM2
pm2 start dist/index.js --name health-care-api
pm2 save
pm2 startup
```

### 3. Configurar Nginx

Criar `/etc/nginx/sites-available/health-care-api`:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Ativar site
sudo ln -s /etc/nginx/sites-available/health-care-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL com Let's Encrypt

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obter certificado
sudo certbot --nginx -d seu-dominio.com

# Renovação automática
sudo certbot renew --dry-run
```

---

## 🔍 Verificação Pós-Deploy

### 1. Health Check

```bash
curl https://seu-dominio.com/health
```

Deve retornar:
```json
{
  "status": "ok",
  "timestamp": "...",
  "service": "Health Care API",
  "environment": "production"
}
```

### 2. Testar Endpoints

```bash
# Signup
curl -X POST https://seu-dominio.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456","full_name":"Test"}'

# Health
curl https://seu-dominio.com/health
```

### 3. Verificar Logs

```bash
# PM2
pm2 logs health-care-api

# Docker
docker logs <container-id>

# Railway/Render
# Ver logs no dashboard
```

---

## 🔄 Atualizações

### Deploy de Nova Versão

```bash
# Git
git pull origin main
npm install
npm run build
pm2 restart health-care-api

# Docker
docker-compose pull
docker-compose up -d --build
```

---

## 🆘 Troubleshooting

### Aplicação não inicia

1. Verificar logs
2. Verificar variáveis de ambiente
3. Verificar porta não está em uso
4. Verificar Node.js version

### Erro de conexão com banco

1. Verificar `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`
2. Verificar firewall/rede
3. Verificar credenciais no Supabase

### Rate limiting muito restritivo

Ajustar em `.env`:
```
RATE_LIMIT_MAX_REQUESTS=200
RATE_LIMIT_WINDOW_MS=900000
```

---

## 📊 Monitoramento

### PM2 Monitoring

```bash
pm2 monit
```

### Health Checks Externos

- UptimeRobot
- Pingdom
- StatusCake

Configure para verificar `/health` a cada 5 minutos.

---

## 🔐 Segurança em Produção

1. **Nunca commitar `.env`**
2. **Usar HTTPS sempre**
3. **Configurar CORS corretamente**
4. **Manter dependências atualizadas**
5. **Usar secrets management (AWS Secrets Manager, etc.)**

---

**Boa sorte com o deploy! 🚀**


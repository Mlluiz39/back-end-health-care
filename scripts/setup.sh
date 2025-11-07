#!/bin/bash

# Script de setup inicial do projeto
# Uso: bash scripts/setup.sh

set -e

echo "🚀 Iniciando setup do Health Care Backend..."
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar Node.js
echo "📦 Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado. Instale Node.js 18+ primeiro.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js versão 18+ necessário. Versão atual: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) encontrado${NC}"
echo ""

# Verificar npm
echo "📦 Verificando npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm não encontrado${NC}"
    exit 1
fi

echo -e "${GREEN}✅ npm $(npm -v) encontrado${NC}"
echo ""

# Instalar dependências
echo "📥 Instalando dependências..."
npm install
echo -e "${GREEN}✅ Dependências instaladas${NC}"
echo ""

# Verificar .env
echo "🔐 Verificando arquivo .env..."
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado${NC}"
    
    if [ -f env.example ]; then
        echo "📋 Copiando env.example para .env..."
        cp env.example .env
        echo -e "${YELLOW}⚠️  Por favor, edite o arquivo .env com suas credenciais${NC}"
    else
        echo -e "${RED}❌ env.example não encontrado${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Arquivo .env encontrado${NC}"
fi
echo ""

# Verificar variáveis obrigatórias
echo "🔍 Verificando variáveis de ambiente obrigatórias..."
MISSING_VARS=()

if ! grep -q "SUPABASE_URL=" .env || grep -q "SUPABASE_URL=your_supabase_project_url" .env; then
    MISSING_VARS+=("SUPABASE_URL")
fi

if ! grep -q "SUPABASE_SERVICE_KEY=" .env || grep -q "SUPABASE_SERVICE_KEY=your_supabase_service_role_key" .env; then
    MISSING_VARS+=("SUPABASE_SERVICE_KEY")
fi

if ! grep -q "VAPID_PUBLIC_KEY=" .env || grep -q "VAPID_PUBLIC_KEY=your_vapid_public_key" .env; then
    MISSING_VARS+=("VAPID_PUBLIC_KEY")
fi

if ! grep -q "VAPID_PRIVATE_KEY=" .env || grep -q "VAPID_PRIVATE_KEY=your_vapid_private_key" .env; then
    MISSING_VARS+=("VAPID_PRIVATE_KEY")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Variáveis não configuradas:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "   - ${var}"
    done
    echo ""
    echo -e "${YELLOW}Por favor, configure essas variáveis no arquivo .env${NC}"
else
    echo -e "${GREEN}✅ Variáveis obrigatórias configuradas${NC}"
fi
echo ""

# Build
echo "🔨 Fazendo build do projeto..."
if npm run build; then
    echo -e "${GREEN}✅ Build concluído com sucesso${NC}"
else
    echo -e "${RED}❌ Erro no build${NC}"
    exit 1
fi
echo ""

# Verificar lint
echo "🔍 Verificando código com ESLint..."
if npm run lint 2>/dev/null; then
    echo -e "${GREEN}✅ Lint passou${NC}"
else
    echo -e "${YELLOW}⚠️  Alguns problemas de lint encontrados. Execute 'npm run lint:fix' para corrigir${NC}"
fi
echo ""

# Resumo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Setup concluído!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Próximos passos:"
echo ""
echo "1. Configure as variáveis de ambiente no arquivo .env"
echo "2. Execute o schema SQL no Supabase (src/database/schema.sql)"
echo "3. Execute o RLS SQL no Supabase (src/database/rls.sql)"
echo "4. Crie o bucket 'medical-documents' no Supabase Storage"
echo "5. Execute 'npm run dev' para iniciar o servidor"
echo ""
echo "📚 Documentação:"
echo "   - NEXT_STEPS.md - Guia completo de próximos passos"
echo "   - DEPLOY.md - Guia de deploy"
echo "   - README.md - Documentação principal"
echo ""
echo "🚀 Para iniciar o servidor:"
echo "   npm run dev"
echo ""


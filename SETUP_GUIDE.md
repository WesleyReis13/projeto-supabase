# 🛠️ Configuração com Supabase CLI (Recomendado)

## 📋 Pré-requisitos
- Node.js 18+ instalado
- Git instalado
- Conta no [Supabase](https://supabase.com)

---

## 🚀 Passo a Passo com CLI

### 1. Instalar e Configurar CLI
```bash
# Instalar Supabase CLI globalmente
npm install -g supabase

# Clonar este repositório
git clone https://github.com/WesleyReis13/projeto-supabase.git
cd ecommerce-supabase-backend

# Fazer login no Supabase
supabase login
```

---

### 2. Configurar Ambiente Local
```bash
# Iniciar ambiente local do Supabase
supabase start

# Isso vai iniciar todos os serviços:
# - Banco de dados PostgreSQL
# - Studio web interface
# - Edge Functions runtime
# - Auth service
```

---

### 3. Executar Migrations do Banco
```bash
# Executar TODAS as migrations (esquema + dados)
supabase db reset

# Ou executar migrations específicas
supabase db push
```

---

### 4. Deploy das Edge Functions
```bash
# Fazer deploy das functions
supabase functions deploy send-order-confirmation
supabase functions deploy generate-order-csv
```

---

### 5. Verificar Status
```bash
# Verificar se tudo está rodando
supabase status
```

---

## 🌐 URLs do Ambiente Local

Após executar `supabase start`, você terá acesso aos seguintes serviços:

📊 **Studio Interface:** http://localhost:54323  
🔗 **API REST:** http://localhost:54321/rest/v1  
⚡ **Edge Functions:** http://localhost:54321/functions/v1  
📧 **Email Testing:** http://localhost:54324 (Mailpit)

---

## ⚙️ Variáveis de Ambiente para Desenvolvimento Local
```env
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=sua-chave-anon-local-aqui
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role-local-aqui
```

Para obter as chaves locais:
```bash
# Execute e copie as chaves que aparecem no terminal:
supabase start

# Ou verifique as chaves atuais:
supabase status
```

---

## 🧪 Testando o Setup
```bash
# Testar se as migrations aplicaram corretamente
supabase db diff

# Testar as Edge Functions localmente
curl -X POST 'http://localhost:54321/functions/v1/send-order-confirmation'   -H 'Authorization: Bearer [SUA_ANON_KEY_LOCAL]'   -d '{"order_id": "uuid-exemplo", "customer_email": "test@email.com"}'
```

---

## 🔍 Comandos Úteis
```bash
# Ver logs do banco
supabase logs db

# Ver logs das Edge Functions
supabase functions logs send-order-confirmation

# Parar serviços locais
supabase stop

# Reiniciar serviços
supabase restart
```

---

## 💡 Vantagens do CLI
✅ Desenvolvimento offline  
✅ Controle de versão do banco  
✅ Testes isolados  
✅ Deploy consistente para produção  
✅ Debugging mais fácil

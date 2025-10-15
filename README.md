# 1. Visão Geral e Arquitetura

O backend foi construído utilizando os recursos nativos do Supabase:
PostgreSQL para persistência de dados, PL/pgSQL para lógica de negócio
crítica, Row-Level Security (RLS) para controle de acesso e Edge
Functions (Deno) para automação e tarefas serverless.

## Decisões Chave de Arquitetura

- **Separação de Preços (Imutabilidade):** O preço de venda de um
  produto é capturado na tabela `order_items` (`price_at_time`),
  garantindo que alterações futuras no preço do produto original não
  afetem o valor do pedido já feito.

- **Abstração de Clientes:** A tabela `profiles` se liga diretamente
  ao `auth.users` do Supabase via Foreign Key, centralizando a gestão
  de clientes.

- **Segurança em Camadas:** O acesso aos dados é rigidamente
  controlado pelas políticas RLS (Layer 3: Banco de Dados), e as Edge
  Functions reforçam essa segurança ao inicializar o cliente Supabase
  com o token do usuário.

---

# 2. Estrutura de Dados (Tabelas e Relações)

O esquema é normalizado para garantir a integridade dos dados, com UUIDs
como chaves primárias.

### profiles

- **Objetivo:** Dados adicionais do usuário.  
- **Relação:** `id -> auth.users(id)` (One-to-One).  
- **Decisão de Integridade:** Usa `ON DELETE CASCADE` para limpar o perfil
  caso o usuário seja deletado da Auth.

### products

- **Objetivo:** Catálogo de produtos.  
- **Relação:** N/A.  
- **Decisão de Integridade:** Constraints `price >= 0` e
  `stock_quantity >= 0` garantem integridade dos valores.

### orders

- **Objetivo:** Cabeçalho do pedido.  
- **Relação:** `user_id -> profiles(id)`.  
- **Decisão de Integridade:** Constraint para `status` (pending, confirmed, etc.)
  e `total >= 0`.

### order_items

- **Objetivo:** Itens de cada pedido.  
- **Relações:** `order_id -> orders(id)`, `product_id -> products(id)`.  
- **Decisão de Integridade:** Armazena `price_at_time` (imutável).  
  Usa `ON DELETE CASCADE` de orders para limpar os itens.

---

## Índices para Desempenho

- `idx_orders_user_id`: Essencial para consultas de pedidos por usuário (base do RLS).  
- `idx_orders_status` e `idx_orders_status_created_at`: Otimizam a busca e ordenação de pedidos por status.  
- `idx_products_in_stock`: Partial index que filtra produtos com `stock_quantity > 0`,
  combinando `category` e `price` para otimizar o catálogo.

---

# 3. Segurança de Dados (Row-Level Security - RLS)

Todas as tabelas críticas (`profiles`, `products`, `orders`, `order_items`) têm RLS habilitado.
O controle de acesso é dividido entre **Clientes** e **Administradores**.

## 3.1. Políticas para Clientes (Baseado em auth.uid())

### profiles
- **Operações:** SELECT, INSERT, UPDATE  
- **Condição:** `auth.uid() = id`

### orders
- **Operações:** SELECT, INSERT, UPDATE  
- **Condição:** `auth.uid() = user_id`

### order_items
- **Operações:** SELECT, INSERT, UPDATE  
- **Condição:**  
  ```sql
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  )
  ```

> **Destaque:** A política de `order_items` usa `EXISTS` de forma segura e performática,
> garantindo que o usuário só acesse itens de seus próprios pedidos.

---

## 3.2. Políticas para Administradores (Baseado em Metadados)

- **Tabela:** `products`  
- **Operações:** INSERT, UPDATE, DELETE  
- **Condição:**  
  ```sql
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data ->> 'role' = 'admin'
  )
  ```

> **Nota:** A política `SELECT` é `TRUE` para permitir visualização pública do catálogo.

---

# 4. Lógica de Negócio (Funções e Triggers)

A lógica crítica é executada no banco para garantir performance e consistência transacional.

### Função: `calculate_order_total(order_id UUID)`

**Objetivo:** Calcular o valor total de um pedido.

```sql
SELECT SUM(oi.quantity * oi.price_at_time)
INTO order_total
FROM order_items oi
WHERE oi.order_id = calculate_order_total.order_id;
```

**Decisões:**  
- **PL/pgSQL:** Ideal para lógica complexa.  
- **SECURITY DEFINER:** Permite ignorar temporariamente o RLS com privilégios do `postgres`.  

**Aprimoramento sugerido:** Criar um **trigger**
`AFTER INSERT OR UPDATE ON order_items` que atualize `orders.total` automaticamente.

---

# 5. Otimização de Consultas (Views)

### View: `order_details`

**Objetivo:** Agrupar detalhes de um pedido (cliente, status, itens) em um único registro.

```sql
json_agg(json_build_object(...)) AS order_items
GROUP BY o.id, o.user_id, p.full_name, ...
```

**Decisões:**  
- Usa `json_agg` para reduzir latência e transformar os itens em array JSON.  
- Simplifica consultas de alto nível ocultando JOINs complexos.

---

# 6. Automação e Integração (Edge Functions - Deno/TypeScript)

As Edge Functions são usadas para automação serverless, aproveitando a runtime Deno.

## 6.1. Edge Function: Envio de E-mail de Confirmação

- **Fluxo:** Recebe `order_id` e `customer_email`, busca detalhes e simula envio.  
- **Segurança:** Usa token do usuário para aplicar RLS.  
- **Desempenho:** Consulta otimizada via `order_details`.

## 6.2. Edge Function: Exportação de Pedido em CSV

- **URL:** `/generate-order-csv`  
- **Busca:**  
  ```ts
  supabaseClient.from('orders').select('..., order_items(..., products:product_id(name))')
  ```
- **Geração CSV:** Feita manualmente via `map` e `join`.  
- **Download:** Retorna `Content-Type: text/csv` e `Content-Disposition: attachment`.  
- **Segurança:** Só permite exportação pelo dono do pedido ou admin.

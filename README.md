# 1. Visão Geral e Arquitetura

O backend foi construído utilizando os recursos nativos do Supabase:
PostgreSQL para persistência de dados, PL/pgSQL para lógica de negócio
crítica, Row-Level Security (RLS) para controle de acesso e Edge
Functions (Deno) para automação e tarefas serverless.

## Decisões Chave de Arquitetura

-   **Separação de Preços (Imutabilidade):** O preço de venda de um
    produto é capturado na tabela `order_items` (`price_at_time`),
    garantindo que alterações futuras no preço do produto original não
    afetem o valor do pedido já feito.
-   **Abstração de Clientes:** A tabela `profiles` se liga diretamente
    ao `auth.users` do Supabase via Foreign Key, centralizando a gestão
    de clientes.
-   **Segurança em Camadas:** O acesso aos dados é rigidamente
    controlado pelas políticas RLS (Layer 3: Banco de Dados), e as Edge
    Functions reforçam essa segurança ao inicializar o cliente Supabase
    com o token do usuário.

# 2. Estrutura de Dados (Tabelas e Relações)

O esquema é normalizado para garantir a integridade dos dados, com UUIDs
como chaves primárias.

  -------------------------------------------------------------------------------
  Tabela        Objetivo     Relação Chave Estrangeira   Decisão de Integridade
  ------------- ------------ --------------------------- ------------------------
  profiles      Dados        id -\> auth.users(id)       Usado ON DELETE CASCADE
                adicionais   (One-to-One)                para limpar o perfil
                do usuário.                              caso o usuário seja
                                                         deletado da Auth.

  products      Catálogo de  N/A                         Constraints: price \>= 0
                produtos.                                e stock_quantity \>= 0
                                                         garantem integridade dos
                                                         valores.

  orders        Cabeçalho do user_id -\> profiles(id)    Constraint para status
                pedido.                                  (pending, confirmed,
                                                         etc.) e total \>= 0.

  order_items   Itens de     order_id -\> orders(id),    Armazena price_at_time
                cada pedido. product_id -\> products(id) (imutável). ON DELETE
                                                         CASCADE de orders limpa
                                                         os itens.
  -------------------------------------------------------------------------------

## Índices para Desempenho

-   `idx_orders_user_id`: Essencial para consultas de pedidos por
    usuário (base do RLS).
-   `idx_orders_status` e `idx_orders_status_created_at`: Otimiza a
    busca e ordenação de pedidos por status.
-   `idx_products_in_stock` (Partial Index): Filtra produtos que têm
    `stock_quantity > 0` combinando `category` e `price`, otimizando a
    exibição do catálogo disponível.

# 3. Segurança de Dados (Row-Level Security - RLS)

Todas as tabelas críticas (`profiles`, `products`, `orders`,
`order_items`) têm RLS habilitado. O controle de acesso é dividido entre
**Clientes** e **Administradores**.

## 3.1. Políticas para Clientes (Baseado em auth.uid())

  ----------------------------------------------------------------------------
  Tabela        Operações Permitidas   Condição RLS (Critério de Segurança)
  ------------- ---------------------- ---------------------------------------
  profiles      SELECT, INSERT, UPDATE auth.uid() = id

  orders        SELECT, INSERT, UPDATE auth.uid() = user_id

  order_items   SELECT, INSERT, UPDATE EXISTS (SELECT 1 FROM orders WHERE
                                       orders.id = order_items.order_id AND
                                       orders.user_id = auth.uid())
  ----------------------------------------------------------------------------

**Destaque em Segurança:** A política de `order_items` usa a subconsulta
EXISTS de forma segura e performática para validar a propriedade
transitiva do item, assegurando que o usuário só toque em itens que
fazem parte de seus pedidos.

## 3.2. Políticas para Administradores (Baseado em Metadados)

-   **Tabela:** `products`
-   **Política:** Apenas administradores podem inserir/atualizar/deletar
    produtos
-   **Condição:**
    `auth.uid() IN (SELECT id FROM auth.users WHERE raw_user_meta_data ->> 'role' = 'admin')`

**Destaque em Segurança:** Essa política restringe o CRUD do catálogo a
usuários que possuem a claim `role: 'admin'` no objeto de metadados do
Auth, garantindo a integridade do catálogo. A política SELECT é TRUE
para que todos possam visualizar o catálogo.

# 4. Lógica de Negócio (Funções e Triggers)

A lógica crítica é executada no banco de dados para garantir performance
e consistência transacional.

### Função: `calculate_order_total(order_id UUID)`

**Objetivo:** Calcular o valor total de um pedido.

``` sql
SELECT SUM(oi.quantity * oi.price_at_time) INTO order_total FROM order_items oi WHERE oi.order_id = calculate_order_total.order_id;
```

**Decisão de Desempenho e Segurança:**

-   **PL/pgSQL:** Usada por ser mais robusta para lógica de negócio do
    que SQL simples.
-   **SECURITY DEFINER:** Permite que a função ignore temporariamente o
    RLS ao acessar `order_items` (com privilégios de postgres) para
    garantir o cálculo completo.

**Sugestão de Aprimoramento (Trigger):** Implementar um TRIGGER
`AFTER INSERT OR UPDATE ON order_items` que chame esta função e atualize
a coluna `orders.total`, mantendo o total sempre sincronizado
automaticamente.

# 5. Otimização de Consultas (Views)

A View `order_details` simplifica a recuperação de dados complexos para
o frontend e para as Edge Functions.

**Objetivo:** Agrupar todos os detalhes de um pedido (cliente, status,
itens) em um único registro.

``` sql
json_agg("json_build_object"(...)) AS "order_items",
GROUP BY o.id, o.user_id, p.full_name, ...
```

**Decisão de Desempenho e Código Limpo:**

-   **json_agg:** Transforma a relação muitos-para-um dos itens em um
    único array JSON, reduzindo a latência.
-   **Código Limpo:** A View oculta a complexidade dos JOINs, tornando
    as consultas de alto nível muito mais simples.

# 6. Automação e Integração (Edge Functions - Deno/TypeScript)

As Edge Functions são usadas para automação serverless, aproveitando a
runtime Deno.

## 6.1. Edge Function: Envio de E-mail de Confirmação

  -----------------------------------------------------------------------
  Feature            Implementação                 Benefício
  ------------------ ----------------------------- ----------------------
  Fluxo              Recebe `order_id` e           Processamento
                     `customer_email`, busca       assíncrono e
                     detalhes do pedido e simula o desacoplado do banco
                     envio.                        de dados.

  Segurança          Usa o token de Autorização da Garante que o RLS seja
                     requisição para buscar dados. aplicado: o usuário só
                                                   pode buscar seus
                                                   próprios pedidos.

  Desempenho         Consulta a View               Busca rápida e com
                     `order_details`.              baixa latência.
  -----------------------------------------------------------------------

## 6.2. Edge Function: Exportação de Pedido em CSV

-   **URL:** `/generate-order-csv`

  --------------------------------------------------------------------------------------------------------------------------------------
  Feature            Implementação                                                                                Benefício
  ------------------ -------------------------------------------------------------------------------------------- ----------------------
  Busca Otimizada    `supabaseClient.from('orders').select('..., order_items(..., products:product_id(name))')`   Alto desempenho.

  Geração CSV        Lógica manual de map e join para criar o formato CSV.                                        Código limpo.

  Download           Retorna `Content-Type: text/csv` e `Content-Disposition: attachment; filename="..."`         Permite download
                                                                                                                  direto e seguro.

  Segurança          RLS Enforced: a função só gera o CSV se o usuário for o dono ou admin.                       Garante privacidade
                                                                                                                  dos dados.
  --------------------------------------------------------------------------------------------------------------------------------------

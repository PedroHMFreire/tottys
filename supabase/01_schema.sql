
-- Esboço de schema (ajuste conforme necessidade)
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  regime_tributario text,
  created_at timestamp with time zone default now()
);

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  nome text not null,
  uf text not null,
  serie text,
  ambiente_fiscal text,
  created_at timestamp with time zone default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  nome text not null,
  email text unique not null,
  role text not null,
  created_at timestamp with time zone default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  sku text,
  ean text,
  nome text not null,
  ncm text,
  cest text,
  unidade text,
  preco numeric not null default 0,
  ativo boolean not null default true,
  tributos_json jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  nome text not null,
  cpf_cnpj text,
  contato text,
  created_at timestamp with time zone default now()
);

create table if not exists cash_registers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  user_id uuid references users(id),
  abertura_at timestamp with time zone not null,
  valor_inicial numeric not null default 0,
  fechamento_at timestamp with time zone,
  valor_final numeric,
  status text not null,
  created_at timestamp with time zone default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id),
  user_id uuid references users(id),
  customer_id uuid references customers(id),
  total numeric not null,
  desconto numeric not null default 0,
  status text not null,
  created_at timestamp with time zone default now()
);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id) on delete cascade,
  product_id uuid references products(id),
  qtde numeric not null,
  preco_unit numeric not null,
  desconto numeric not null default 0
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id) on delete cascade,
  meio text not null,
  valor numeric not null,
  nsu text,
  bandeira text
);

create table if not exists fiscal_docs (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id) on delete cascade,
  tipo text not null,
  chave text,
  protocolo text,
  xml_url text,
  danfe_url text,
  status text not null,
  motivo_rejeicao text
);

-- TODO: RLS policies por company_id (quando ativar o RLS).

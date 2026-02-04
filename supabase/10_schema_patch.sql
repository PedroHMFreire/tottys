-- Fase 10: Alinhamento de colunas com o frontend

-- Produtos
alter table public.products
  add column if not exists barcode text,
  add column if not exists custo numeric,
  add column if not exists categoria text,
  add column if not exists marca text,
  add column if not exists grupo_trib text,
  add column if not exists origem text,
  add column if not exists cfop text,
  add column if not exists cest text,
  add column if not exists unidade text,
  add column if not exists sku text,
  add column if not exists preco numeric,
  add column if not exists ativo boolean default true;

-- Regras de cartão
create table if not exists public.card_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  brand text not null,
  mode text not null, -- DEBITO | CREDITO_VISTA | CREDITO_PARC
  max_installments integer not null default 1,
  no_interest_up_to integer not null default 1,
  min_installment_value numeric not null default 5,
  mdr_pct numeric not null default 0,
  fee_fixed numeric not null default 0,
  customer_interest_monthly_pct numeric not null default 0,
  merchant_interest_monthly_pct numeric not null default 0,
  created_at timestamp with time zone default now()
);

create index if not exists card_rules_store_idx on public.card_rules(store_id);

-- Pagamentos
alter table public.payments
  add column if not exists brand text,
  add column if not exists mode text,
  add column if not exists installments integer,
  add column if not exists installment_value numeric,
  add column if not exists mdr_pct numeric,
  add column if not exists fee_fixed numeric,
  add column if not exists fee_total numeric,
  add column if not exists interest_pct_monthly numeric,
  add column if not exists interest_total numeric,
  add column if not exists gross numeric,
  add column if not exists net numeric,
  add column if not exists acquirer text,
  add column if not exists nsu text,
  add column if not exists auth_code text,
  add column if not exists received_at timestamp with time zone,
  add column if not exists created_at timestamp with time zone default now();

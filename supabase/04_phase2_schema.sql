-- Fase 2: Estrutura de vínculo usuário -> lojas (não aplicar ainda)

create table if not exists public.user_stores (
  user_id uuid references public.profiles(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  created_at timestamp with time zone default now(),
  primary key (user_id, store_id)
);

-- Índices úteis
create index if not exists user_stores_company_idx on public.user_stores(company_id);
create index if not exists user_stores_store_idx on public.user_stores(store_id);

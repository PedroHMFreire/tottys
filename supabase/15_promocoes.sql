-- ============================================================
-- Fase 15: Promoções e Descontos
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

-- ============================================================
-- 1. TABELA: promocoes
-- ============================================================
create table if not exists public.promocoes (
  id                     uuid        primary key default gen_random_uuid(),
  company_id             uuid        not null references public.companies(id) on delete cascade,
  nome                   text        not null,
  descricao              text,
  tipo                   text        not null default 'PERCENTUAL', -- PERCENTUAL | VALOR_FIXO
  valor                  numeric     not null default 0,
  aplica_em              text        not null default 'TUDO',       -- TUDO | COLECAO
  collection_id          uuid        references public.collections(id),
  valor_minimo_carrinho  numeric     not null default 0,
  ativo                  boolean     not null default true,
  data_inicio            date,
  data_fim               date,
  requer_perfil          text        not null default 'TODOS',      -- TODOS | GERENTE | ADMIN
  created_at             timestamptz default now()
);

create index if not exists idx_promocoes_company on public.promocoes(company_id);
create index if not exists idx_promocoes_ativo   on public.promocoes(ativo);

-- ============================================================
-- 2. RLS — promocoes
-- ============================================================
alter table public.promocoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='promocoes' and policyname='promo_select') then
    create policy promo_select on public.promocoes for select
      using (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='promocoes' and policyname='promo_insert') then
    create policy promo_insert on public.promocoes for insert
      with check (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='promocoes' and policyname='promo_update') then
    create policy promo_update on public.promocoes for update
      using (company_id = public.current_company_id() or public.current_role() = 'OWNER')
      with check (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='promocoes' and policyname='promo_delete') then
    create policy promo_delete on public.promocoes for delete
      using (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
end $$;

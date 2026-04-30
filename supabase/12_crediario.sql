-- ============================================================
-- Fase 12: Crediário Próprio + CRM Básico
-- Execução idempotente — seguro re-rodar a qualquer momento.
-- ============================================================

-- ============================================================
-- 1. ESTENDER tabela customers
-- ============================================================
alter table public.customers
  add column if not exists limite_credito   numeric  default 0,
  add column if not exists score_interno    text     default 'BOM',
  add column if not exists data_nascimento  date,
  add column if not exists endereco         text,
  add column if not exists observacoes      text;

-- ============================================================
-- 2. TABELA: crediario_vendas
-- ============================================================
create table if not exists public.crediario_vendas (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references public.companies(id) on delete cascade,
  store_id       uuid        references public.stores(id),
  customer_id    uuid        not null references public.customers(id),
  user_id        uuid        references public.profiles(id),
  valor_total    numeric     not null,
  entrada        numeric     not null default 0,
  num_parcelas   integer     not null,
  valor_parcela  numeric     not null,
  status         text        not null default 'ATIVA',  -- ATIVA | QUITADA | CANCELADA
  observacoes    text,
  created_at     timestamptz default now()
);

create index if not exists idx_crediario_vendas_company  on public.crediario_vendas(company_id);
create index if not exists idx_crediario_vendas_customer on public.crediario_vendas(customer_id);
create index if not exists idx_crediario_vendas_status   on public.crediario_vendas(status);

-- ============================================================
-- 3. TABELA: crediario_parcelas
-- ============================================================
create table if not exists public.crediario_parcelas (
  id             uuid        primary key default gen_random_uuid(),
  crediario_id   uuid        not null references public.crediario_vendas(id) on delete cascade,
  company_id     uuid        not null references public.companies(id) on delete cascade,
  customer_id    uuid        not null references public.customers(id),
  num_parcela    integer     not null,
  valor          numeric     not null,
  vencimento     date        not null,
  status         text        not null default 'PENDENTE',  -- PENDENTE | PAGA | ATRASADA
  pago_em        timestamptz,
  valor_pago     numeric,
  created_at     timestamptz default now()
);

create index if not exists idx_crediario_parcelas_crediario  on public.crediario_parcelas(crediario_id);
create index if not exists idx_crediario_parcelas_customer   on public.crediario_parcelas(customer_id);
create index if not exists idx_crediario_parcelas_vencimento on public.crediario_parcelas(vencimento);
create index if not exists idx_crediario_parcelas_status     on public.crediario_parcelas(status);

-- ============================================================
-- 4. RLS — crediario_vendas
-- ============================================================
alter table public.crediario_vendas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crediario_vendas' and policyname='cv_select') then
    create policy cv_select on public.crediario_vendas for select
      using (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crediario_vendas' and policyname='cv_insert') then
    create policy cv_insert on public.crediario_vendas for insert
      with check (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crediario_vendas' and policyname='cv_update') then
    create policy cv_update on public.crediario_vendas for update
      using (company_id = public.current_company_id() or public.current_role() = 'OWNER')
      with check (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
end $$;

-- ============================================================
-- 5. RLS — crediario_parcelas
-- ============================================================
alter table public.crediario_parcelas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crediario_parcelas' and policyname='cp_select') then
    create policy cp_select on public.crediario_parcelas for select
      using (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crediario_parcelas' and policyname='cp_insert') then
    create policy cp_insert on public.crediario_parcelas for insert
      with check (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crediario_parcelas' and policyname='cp_update') then
    create policy cp_update on public.crediario_parcelas for update
      using (company_id = public.current_company_id() or public.current_role() = 'OWNER')
      with check (company_id = public.current_company_id() or public.current_role() = 'OWNER');
  end if;
end $$;

-- ============================================================
-- 6. FUNÇÃO: criar_crediario
-- ============================================================
create or replace function public.criar_crediario(
  p_company_id     uuid,
  p_store_id       uuid,
  p_customer_id    uuid,
  p_valor_total    numeric,
  p_entrada        numeric,
  p_num_parcelas   integer,
  p_primeira_venc  date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role          text;
  v_my_company    uuid;
  v_customer      record;
  v_crediario_id  uuid;
  v_valor_parc    numeric;
  v_resto         numeric;
  v_i             integer;
  v_venc          date;
begin
  select role, company_id into v_role, v_my_company
    from public.profiles where id = auth.uid();

  if v_role not in ('OWNER','ADMIN','GERENTE','GESTOR','VENDEDOR','CAIXA') then
    raise exception 'Sem permissão para criar crediário';
  end if;
  if v_role <> 'OWNER' and v_my_company <> p_company_id then
    raise exception 'Empresa inválida';
  end if;

  select * into v_customer
    from public.customers
   where id = p_customer_id and company_id = p_company_id;

  if not found then
    raise exception 'Cliente não encontrado';
  end if;
  if coalesce(v_customer.score_interno,'BOM') = 'BLOQUEADO' then
    raise exception 'Cliente bloqueado para crediário';
  end if;

  if p_num_parcelas <= 0 then
    raise exception 'Número de parcelas deve ser maior que zero';
  end if;
  if p_valor_total <= p_entrada then
    raise exception 'Valor de entrada não pode ser maior ou igual ao total';
  end if;

  v_valor_parc := round((p_valor_total - p_entrada) / p_num_parcelas, 2);

  insert into public.crediario_vendas (
    company_id, store_id, customer_id, user_id,
    valor_total, entrada, num_parcelas, valor_parcela, status
  ) values (
    p_company_id, p_store_id, p_customer_id, auth.uid(),
    p_valor_total, p_entrada, p_num_parcelas, v_valor_parc, 'ATIVA'
  )
  returning id into v_crediario_id;

  v_resto := (p_valor_total - p_entrada) - (v_valor_parc * (p_num_parcelas - 1));

  for v_i in 1..p_num_parcelas loop
    v_venc := p_primeira_venc + ((v_i - 1) || ' months')::interval;
    insert into public.crediario_parcelas (
      crediario_id, company_id, customer_id,
      num_parcela, valor, vencimento, status
    ) values (
      v_crediario_id, p_company_id, p_customer_id,
      v_i,
      case when v_i = p_num_parcelas then v_resto else v_valor_parc end,
      v_venc,
      'PENDENTE'
    );
  end loop;

  return v_crediario_id;
end;
$$;

-- ============================================================
-- 7. FUNÇÃO: pagar_parcela
-- ============================================================
create or replace function public.pagar_parcela(
  p_parcela_id  uuid,
  p_valor_pago  numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parcela      record;
  v_todas_pagas  boolean;
  v_atrasadas    integer;
  v_novo_score   text;
begin
  select * into v_parcela
    from public.crediario_parcelas where id = p_parcela_id;

  if not found then raise exception 'Parcela não encontrada'; end if;
  if v_parcela.status = 'PAGA' then raise exception 'Parcela já foi paga'; end if;

  update public.crediario_parcelas
     set status    = 'PAGA',
         pago_em   = now(),
         valor_pago = p_valor_pago
   where id = p_parcela_id;

  select not exists (
    select 1 from public.crediario_parcelas
     where crediario_id = v_parcela.crediario_id
       and status in ('PENDENTE','ATRASADA')
  ) into v_todas_pagas;

  if v_todas_pagas then
    update public.crediario_vendas set status = 'QUITADA'
     where id = v_parcela.crediario_id;
  end if;

  select count(*) into v_atrasadas
    from public.crediario_parcelas
   where customer_id = v_parcela.customer_id and status = 'ATRASADA';

  v_novo_score := case
    when v_atrasadas = 0 then 'BOM'
    when v_atrasadas <= 2 then 'REGULAR'
    else 'RUIM'
  end;

  update public.customers set score_interno = v_novo_score
   where id = v_parcela.customer_id;
end;
$$;

-- ============================================================
-- 8. FUNÇÃO: atualizar_parcelas_atrasadas
--    Chamada ao abrir a tela de Crediário (sem pg_cron no free tier)
-- ============================================================
create or replace function public.atualizar_parcelas_atrasadas(
  p_company_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.crediario_parcelas
     set status = 'ATRASADA'
   where company_id = p_company_id
     and status = 'PENDENTE'
     and vencimento < current_date;

  get diagnostics v_count = row_count;

  -- Atualiza score dos clientes afetados
  update public.customers c
     set score_interno = case
       when (select count(*) from public.crediario_parcelas p2
              where p2.customer_id = c.id and p2.status = 'ATRASADA') = 0 then 'BOM'
       when (select count(*) from public.crediario_parcelas p2
              where p2.customer_id = c.id and p2.status = 'ATRASADA') <= 2 then 'REGULAR'
       else 'RUIM'
     end
   where id in (
     select distinct customer_id from public.crediario_parcelas
      where company_id = p_company_id and status = 'ATRASADA'
   );

  return v_count;
end;
$$;

-- Fase 1: Funções seguras (aplicar após confirmar tabelas)

-- Cria empresa e (opcionalmente) loja principal
create or replace function public.create_company_with_store(
  p_nome text,
  p_cnpj text default null,
  p_regime text default null,
  p_create_store boolean default true,
  p_store_nome text default 'Loja Principal',
  p_store_uf text default 'SP',
  p_ambiente text default 'homologacao'
) returns uuid
language plpgsql
security definer
as $$
declare
  v_role text;
  v_company_id uuid;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'OWNER' then
    raise exception 'Sem permissão para criar empresa';
  end if;

  insert into public.companies (nome, cnpj, regime_tributario)
  values (p_nome, p_cnpj, p_regime)
  returning id into v_company_id;

  if p_create_store then
    insert into public.stores (company_id, nome, uf, ambiente_fiscal)
    values (v_company_id, coalesce(p_store_nome, 'Loja Principal'), upper(p_store_uf), p_ambiente);
  end if;

  -- Se o OWNER ainda não tiver company_id, vincula
  update public.profiles
     set company_id = v_company_id
   where id = auth.uid() and company_id is null;

  return v_company_id;
end;
$$;

-- Cria loja (ADMIN/GERENTE na própria empresa, OWNER em qualquer)
create or replace function public.create_store(
  p_company_id uuid,
  p_nome text,
  p_uf text,
  p_ambiente text default 'homologacao'
) returns uuid
language plpgsql
security definer
as $$
declare
  v_role text;
  v_my_company uuid;
  v_store_id uuid;
begin
  select role, company_id into v_role, v_my_company from public.profiles where id = auth.uid();
  if v_role not in ('OWNER','ADMIN','GERENTE') then
    raise exception 'Sem permissão para criar loja';
  end if;
  if v_role <> 'OWNER' and v_my_company <> p_company_id then
    raise exception 'Empresa inválida';
  end if;

  insert into public.stores (company_id, nome, uf, ambiente_fiscal)
  values (p_company_id, p_nome, upper(p_uf), p_ambiente)
  returning id into v_store_id;

  return v_store_id;
end;
$$;

-- Observação:
-- Funções de caixa, estoque e permissões (set_user_role, grant_user_area, etc.)
-- devem ser consolidadas aqui após confirmação das tabelas.

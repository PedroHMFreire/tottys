-- Seed inicial (empresa, loja, vínculos) com segurança.
-- Ajuste os emails abaixo para os usuários já criados no Auth.

do $$
declare
  v_company_id uuid;
  v_store_id uuid;
  v_owner_id uuid;
  v_seller_id uuid;

  v_owner_email text := 'admin@tottys.com';
  v_seller_email text := 'vendedor@tottys.com';
begin
  -- 1) Empresa e loja
  insert into public.companies (nome, cnpj, regime_tributario)
  values ('Tottys', null, null)
  returning id into v_company_id;

  insert into public.stores (company_id, nome, uf, ambiente_fiscal)
  values (v_company_id, 'Loja Principal', 'SP', 'homologacao')
  returning id into v_store_id;

  -- 2) Buscar usuários no Auth (precisam existir)
  select id into v_owner_id from auth.users where email = v_owner_email;
  select id into v_seller_id from auth.users where email = v_seller_email;

  if v_owner_id is null then
    raise exception 'Usuário OWNER não encontrado no Auth: %', v_owner_email;
  end if;

  -- 3) Vincular profiles (se tabela existir)
  if to_regclass('public.profiles') is not null then
    update public.profiles
       set company_id = v_company_id, role = 'OWNER'
     where id = v_owner_id;

    if v_seller_id is not null then
      update public.profiles
         set company_id = v_company_id, role = 'VENDEDOR'
       where id = v_seller_id;
    end if;
  end if;

  -- 4) Vínculo do vendedor à loja (se user_stores existir)
  if to_regclass('public.user_stores') is not null and v_seller_id is not null then
    insert into public.user_stores (user_id, store_id, company_id)
    values (v_seller_id, v_store_id, v_company_id)
    on conflict do nothing;
  end if;

  -- 5) Áreas do OWNER (se user_areas existir)
  if to_regclass('public.user_areas') is not null then
    insert into public.user_areas (user_id, area, company_id)
    values
      (v_owner_id, 'ADM_ROOT', v_company_id),
      (v_owner_id, 'USERS', v_company_id),
      (v_owner_id, 'RELATORIOS', v_company_id),
      (v_owner_id, 'PRODUTOS', v_company_id),
      (v_owner_id, 'ESTOQUE_ADMIN', v_company_id),
      (v_owner_id, 'CONFIG', v_company_id)
    on conflict do nothing;
  end if;
end $$;

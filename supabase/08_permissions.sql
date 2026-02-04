-- Fase 8: Perfis, áreas e funções de permissão

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  role text not null default 'VENDEDOR',
  nome text,
  email text,
  created_at timestamp with time zone default now()
);

create table if not exists public.user_areas (
  user_id uuid references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  area_code text not null,
  created_at timestamp with time zone default now(),
  primary key (user_id, area_code)
);

create index if not exists user_areas_company_idx on public.user_areas(company_id);
create index if not exists user_areas_user_idx on public.user_areas(user_id);

-- Função: retorna áreas do usuário atual
create or replace function public.get_my_areas()
returns table (area_code text, source text)
language sql stable
as $$
  select ua.area_code, 'direct'::text as source
  from public.user_areas ua
  where ua.user_id = auth.uid();
$$;

-- Função: define papel do usuário
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
as $$
declare
  v_role text;
  v_company uuid;
  v_target_company uuid;
begin
  select role, company_id into v_role, v_company from public.profiles where id = auth.uid();
  select company_id into v_target_company from public.profiles where id = p_user_id;

  if v_role is null then
    raise exception 'Perfil do operador não encontrado';
  end if;

  if v_role = 'OWNER' then
    update public.profiles set role = p_role where id = p_user_id;
    return;
  end if;

  if v_role in ('ADMIN','GERENTE') then
    if v_target_company is null or v_target_company <> v_company then
      raise exception 'Usuário não pertence à sua empresa';
    end if;
    if p_role = 'OWNER' then
      raise exception 'Sem permissão para promover a OWNER';
    end if;
    update public.profiles set role = p_role where id = p_user_id;
    return;
  end if;

  raise exception 'Sem permissão para alterar papel';
end;
$$;

-- Função: concede área
create or replace function public.grant_user_area(p_user_id uuid, p_area_code text)
returns void
language plpgsql
security definer
as $$
declare
  v_role text;
  v_company uuid;
  v_target_company uuid;
begin
  select role, company_id into v_role, v_company from public.profiles where id = auth.uid();
  select company_id into v_target_company from public.profiles where id = p_user_id;

  if v_role not in ('OWNER','ADMIN','GERENTE') then
    raise exception 'Sem permissão';
  end if;
  if v_role <> 'OWNER' and v_target_company <> v_company then
    raise exception 'Usuário não pertence à sua empresa';
  end if;

  insert into public.user_areas (user_id, company_id, area_code)
  values (p_user_id, v_target_company, p_area_code)
  on conflict do nothing;
end;
$$;

-- Função: revoga área
create or replace function public.revoke_user_area(p_user_id uuid, p_area_code text)
returns void
language plpgsql
security definer
as $$
declare
  v_role text;
  v_company uuid;
  v_target_company uuid;
begin
  select role, company_id into v_role, v_company from public.profiles where id = auth.uid();
  select company_id into v_target_company from public.profiles where id = p_user_id;

  if v_role not in ('OWNER','ADMIN','GERENTE') then
    raise exception 'Sem permissão';
  end if;
  if v_role <> 'OWNER' and v_target_company <> v_company then
    raise exception 'Usuário não pertence à sua empresa';
  end if;

  delete from public.user_areas
   where user_id = p_user_id and area_code = p_area_code;
end;
$$;

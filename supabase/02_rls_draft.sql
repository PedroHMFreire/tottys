-- RLS draft (não aplicado)
-- Este arquivo prepara políticas por company_id.
-- Aplique somente após confirmar as tabelas finais (profiles, user_areas, etc.).

-- Exemplo geral:
-- alter table companies enable row level security;
-- create policy "company_owner" on companies
--   for select using (id = (select company_id from profiles where id = auth.uid()));

-- TODO: adicionar policies para:
-- profiles, user_areas, stores, products, customers, cash_registers, sales, sale_items, payments, fiscal_docs

-- Observação: algumas tabelas como profiles/user_areas não estão no schema atual (01_schema.sql).
-- Ajuste antes de aplicar.

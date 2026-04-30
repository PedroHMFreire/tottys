-- ============================================================
-- Fase 33: Patches na tabela products
-- ============================================================

-- Coluna last_seen_at (usada pelo PDV para rastrear último acesso)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Constraint necessária para o upsert onConflict: 'company_id,sku'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_company_id_sku_key'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_company_id_sku_key UNIQUE (company_id, sku);
  END IF;
END $$;

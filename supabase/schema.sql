-- =============================================================================
-- SCHEMA SUPABASE: CONTROLE FINANCEIRO PESSOAL (PWA) - RASTGA
-- =============================================================================

-- 1. Tabela de Entradas (Salário Base + Entradas Extras)
CREATE TABLE IF NOT EXISTS public.incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tag TEXT DEFAULT 'Salário',
  is_base_salary BOOLEAN DEFAULT FALSE,
  month_year TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela Unificada de Transações (Dívidas e Gastos Avulsos)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('debt', 'expense')),
  title TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tag TEXT NOT NULL,
  icon TEXT DEFAULT 'dollar',
  due_date DATE NULL,
  paid BOOLEAN DEFAULT FALSE,
  total_installments INTEGER DEFAULT 1,
  current_installment INTEGER DEFAULT 1,
  month_year TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Caso a tabela já exista, garante as colunas de controle de parcelas:
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS total_installments INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_installment INTEGER DEFAULT 1;

-- 3. Políticas RLS (Acesso Total)
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total incomes" ON public.incomes;
CREATE POLICY "Acesso total incomes" ON public.incomes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total transactions" ON public.transactions;
CREATE POLICY "Acesso total transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

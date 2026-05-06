-- ===========================================================
-- Choyxona Hisobchi v4 — Supabase ma'lumotlar bazasi sxemasi
-- ===========================================================
-- Supabase loyihangizdagi SQL Editor ichida shu skriptni
-- to'liq nusxalab "Run" tugmasini bosing.
--
-- Bu skript IDEMPOTENT — ya'ni bir necha marta ishga tushirish
-- xavfsiz. v3 dan v4 ga o'tayotgan bo'lsangiz, eski 'transactions'
-- jsonb ustun avtomatik 'app_transactions' jadvaliga ko'chiriladi.
-- ===========================================================


-- ============================================================
-- 1. app_data jadvali (categories, drinks va boshqa konfiguratsiya)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_data (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  categories     jsonb,
  transactions   jsonb,        -- v3 backward-compat (yangi kodda ishlatilmaydi)
  drinks         jsonb,
  drink_daily    jsonb,
  cash_register  jsonb,
  tg_config      jsonb,
  workers        jsonb,
  debts          jsonb,
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE public.app_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own data"   ON public.app_data;
DROP POLICY IF EXISTS "Users insert own data"   ON public.app_data;
DROP POLICY IF EXISTS "Users update own data"   ON public.app_data;
DROP POLICY IF EXISTS "Users delete own data"   ON public.app_data;

CREATE POLICY "Users select own data" ON public.app_data
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own data" ON public.app_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own data" ON public.app_data
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own data" ON public.app_data
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 2. app_transactions jadvali (YANGI — normalizatsiyalangan)
-- ============================================================
-- Concurrency muammosini hal qilish uchun har bir transaction
-- alohida qator. Notebook va telefonda bir vaqtda yozish xavfsiz.
CREATE TABLE IF NOT EXISTS public.app_transactions (
  id              text PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('income', 'expense')),
  category_id     text NOT NULL,
  amount          numeric NOT NULL DEFAULT 0,
  qty             numeric,
  qty_eaten       numeric,
  payee           text,
  payee_worker_id text,                -- YANGI: ishchi ID (ism o'zgarsa ham bog'lanish saqlanadi)
  payment_method  text CHECK (payment_method IN ('cash', 'card') OR payment_method IS NULL),
  note            text,
  date            date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date    ON public.app_transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_user_type    ON public.app_transactions (user_id, type);
CREATE INDEX IF NOT EXISTS idx_tx_user_worker  ON public.app_transactions (user_id, payee_worker_id);

ALTER TABLE public.app_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own tx" ON public.app_transactions;
DROP POLICY IF EXISTS "Users insert own tx" ON public.app_transactions;
DROP POLICY IF EXISTS "Users update own tx" ON public.app_transactions;
DROP POLICY IF EXISTS "Users delete own tx" ON public.app_transactions;

CREATE POLICY "Users select own tx" ON public.app_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tx" ON public.app_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tx" ON public.app_transactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own tx" ON public.app_transactions
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- 3. v3 → v4 avtomatik ko'chirish (jsonb 'transactions' → app_transactions)
-- ============================================================
-- Agar app_data.transactions ichida eski yozuvlar bo'lsa, bu funksiya
-- ularni yangi normalizatsiyalangan jadvalga ko'chiradi.
DO $$
DECLARE
  rec RECORD;
  tx jsonb;
  cnt int := 0;
BEGIN
  FOR rec IN
    SELECT user_id, transactions
      FROM public.app_data
     WHERE transactions IS NOT NULL
       AND jsonb_typeof(transactions) = 'array'
       AND jsonb_array_length(transactions) > 0
  LOOP
    FOR tx IN SELECT * FROM jsonb_array_elements(rec.transactions)
    LOOP
      BEGIN
        INSERT INTO public.app_transactions
          (id, user_id, type, category_id, amount, qty, qty_eaten,
           payee, payee_worker_id, payment_method, note, date, created_at)
        VALUES
          (COALESCE(tx->>'id', md5(random()::text || clock_timestamp()::text)),
           rec.user_id,
           tx->>'type',
           tx->>'categoryId',
           COALESCE((tx->>'amount')::numeric, 0),
           NULLIF(tx->>'qty', '')::numeric,
           NULLIF(tx->>'qtyEaten', '')::numeric,
           NULLIF(tx->>'payee', ''),
           NULLIF(tx->>'payeeWorkerId', ''),
           NULLIF(tx->>'paymentMethod', ''),
           NULLIF(tx->>'note', ''),
           (tx->>'date')::date,
           CASE WHEN tx->>'createdAt' ~ '^[0-9]+$'
                THEN to_timestamp((tx->>'createdAt')::bigint / 1000)
                ELSE COALESCE((tx->>'createdAt')::timestamptz, now())
           END)
        ON CONFLICT (id) DO NOTHING;
        cnt := cnt + 1;
      EXCEPTION WHEN OTHERS THEN
        -- skip malformed entries
        NULL;
      END;
    END LOOP;
    -- Eski jsonb tushum-chiqimlarni tozalash (yangi tab ishlatadi)
    UPDATE public.app_data SET transactions = NULL WHERE user_id = rec.user_id;
  END LOOP;
  RAISE NOTICE 'Migrated % transactions from jsonb to app_transactions', cnt;
END $$;


-- ============================================================
-- 4. Realtime publication
-- ============================================================
-- Supabase realtime channels ishlashi uchun jadvallar
-- supabase_realtime publication'ga qo'shilishi kerak.
-- (Supabase Dashboard'da Database → Replication ham tekshirib bo'ladi)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_data;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ===========================================================
-- TUGADI! Endi siz Supabase URL va anon keyni olib,
-- Vercel'ga environment variable sifatida qo'shasiz.
-- ===========================================================

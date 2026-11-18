-- ==============================================================================
-- CHAINVIORA - Complete Supabase Database Schema (Updated)
-- Run this FULLY in Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ==============================================================================

-- ============================================================
-- 1. PROFILES TABLE (User accounts + balances)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  username text,
  email text,
  wallet_address text DEFAULT '0x71C8A6987C2188B6Fa08779a1F04bE1049b4b9C3',

  -- Balances (synced from dashboard)
  usdt_balance numeric(18, 2) DEFAULT 0.00,
  giga_balance numeric(18, 4) DEFAULT 0.0000,
  lifetime_profit numeric(18, 2) DEFAULT 0.00,
  last_updated timestamp with time zone DEFAULT now(),

  -- Deposit addresses
  deposit_address text DEFAULT null,
  deposit_address_currency text DEFAULT null,
  deposit_addresses jsonb DEFAULT '{}'::jsonb,

  -- Referral
  referral_code text DEFAULT null,
  referred_by text DEFAULT null,
  referral_bonus_earned numeric(18, 2) DEFAULT 0.00,

  created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);

-- Migration (safe — if table existed before):
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS usdt_balance numeric(18, 2) DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS giga_balance numeric(18, 4) DEFAULT 0.0000;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lifetime_profit numeric(18, 2) DEFAULT 0.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_updated timestamp with time zone DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deposit_address text DEFAULT null;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deposit_address_currency text DEFAULT null;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deposit_addresses jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text DEFAULT null;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by text DEFAULT null;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_bonus_earned numeric(18, 2) DEFAULT 0.00;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Service role full access"
  ON public.profiles FOR ALL USING (true);

-- ============================================================
-- 2. AUTO-CREATE PROFILE ON SIGNUP (Trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, username, referral_code)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Chainviora Member'),
    new.email,
    COALESCE(new.raw_user_meta_data->>'username', 'GIGA' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::text, 6, '0')),
    COALESCE(new.raw_user_meta_data->>'referral_code', FLOOR(RANDOM() * 900000 + 100000)::text)
  )
  ON CONFLICT (id) DO UPDATE SET
    username = COALESCE(public.profiles.username, EXCLUDED.username),
    referral_code = COALESCE(public.profiles.referral_code, EXCLUDED.referral_code);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- 3. TRANSACTIONS TABLE (Buy GIGA, Sell Complete, Deposit, Withdrawal)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,         -- 'buy_giga', 'sell_complete', 'deposit', 'withdrawal'
  amount_usdt numeric(18, 2) DEFAULT 0.00,
  amount_giga numeric(18, 4) DEFAULT 0.0000,
  order_id text DEFAULT null,
  status text DEFAULT 'completed',
  notes text DEFAULT null,
  created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);

-- Migration if table existed:
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount_usdt numeric(18, 2) DEFAULT 0.00;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount_giga numeric(18, 4) DEFAULT 0.0000;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS order_id text DEFAULT null;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS notes text DEFAULT null;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Service role full access transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access transactions"
  ON public.transactions FOR ALL USING (true);

-- ============================================================
-- 4. STAKES TABLE (Liquid staking records)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stakes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount_giga numeric(18, 4) NOT NULL,
  apy_rate numeric(5, 2) DEFAULT 18.5,
  daily_yield numeric(18, 4) NOT NULL,
  staked_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'unstaked'))
);

ALTER TABLE public.stakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view and create own stakes" ON public.stakes;
CREATE POLICY "Users can view and create own stakes"
  ON public.stakes FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 5. REFERRALS TABLE (Tracks invited friends and $5 bonuses)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_code text NOT NULL,
  referred_email text NOT NULL UNIQUE,
  referred_username text,
  deposit_amount numeric(18, 2) DEFAULT 0.00,
  bonus_awarded boolean DEFAULT false,
  bonus_amount numeric(18, 2) DEFAULT 0.00,
  created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view referrals" ON public.referrals;
DROP POLICY IF EXISTS "Service role full access referrals" ON public.referrals;

CREATE POLICY "Anyone can view referrals"
  ON public.referrals FOR SELECT USING (true);

CREATE POLICY "Service role full access referrals"
  ON public.referrals FOR ALL USING (true);

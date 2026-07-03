-- ====================================================================
-- COIN/FIAT WALLET BALANCES & MULTI-CURRENCY UPGRADE SCRIPT
-- Run this entire script in your Supabase SQL Editor (https://supabase.com)
-- ====================================================================

-- 1. Create the new wallet_balances table
CREATE TABLE IF NOT EXISTS public.wallet_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  balance NUMERIC DEFAULT 0 NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_user_currency UNIQUE (user_id, currency_code)
);

-- 2. Enable Row Level Security (RLS) on the new table
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies so a user can only query, insert, or update their own wallets
DROP POLICY IF EXISTS "Users can view their own balances" ON public.wallet_balances;
CREATE POLICY "Users can view their own balances" ON public.wallet_balances
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own balances" ON public.wallet_balances;
CREATE POLICY "Users can insert their own balances" ON public.wallet_balances
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own balances" ON public.wallet_balances;
CREATE POLICY "Users can update their own balances" ON public.wallet_balances
  FOR UPDATE USING (auth.uid() = user_id);

-- Grant standard permissions on the new table to authenticated and anonymous users
GRANT SELECT, INSERT, UPDATE ON public.wallet_balances TO authenticated, anon;

-- 4. Migration script: copy all existing profiles.balance values into wallet_balances as USDT
INSERT INTO public.wallet_balances (user_id, currency_code, balance)
SELECT id, 'USDT', balance FROM public.profiles
ON CONFLICT (user_id, currency_code) DO UPDATE SET balance = EXCLUDED.balance;

-- 5. Alter the bets table to add a currency_code column (defaulting to 'USDT' for old bets)
ALTER TABLE public.bets ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'USDT';

-- 5.5 Alter the balance_adjustments table to add a currency_code column
ALTER TABLE public.balance_adjustments ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'USDT';

-- 6. Drop the old place_bet function signatures to avoid ambiguity
DROP FUNCTION IF EXISTS public.place_bet(DECIMAL, DECIMAL, TEXT);
DROP FUNCTION IF EXISTS public.place_bet(p_bet_amount DECIMAL, p_target_multiplier DECIMAL, p_client_seed TEXT);

-- 7. Create the upgraded place_bet function supporting multi-currency
CREATE OR REPLACE FUNCTION public.place_bet(
  p_bet_amount DECIMAL,
  p_target_multiplier DECIMAL,
  p_client_seed TEXT DEFAULT NULL,
  p_currency_code TEXT DEFAULT 'USDT'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_current_balance DECIMAL;
  v_result_multiplier DECIMAL;
  v_is_win BOOLEAN;
  v_payout DECIMAL := 0;
  v_new_balance DECIMAL;
  
  v_server_seed TEXT;
  v_server_seed_hash TEXT;
  v_client_seed TEXT;
  v_nonce INT;
  v_hmac_hex TEXT;
  v_rand_val FLOAT;
BEGIN
  -- Security check: derive identity from session auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be logged in';
  END IF;

  -- Ensure the user profile row exists first (to maintain profiles table integrity)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    INSERT INTO public.profiles (id, balance, username)
    VALUES (v_user_id, 1000.00, 'user')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Ensure the user has a wallet_balances row for this specific currency
  INSERT INTO public.wallet_balances (user_id, currency_code, balance)
  VALUES (v_user_id, p_currency_code, 0)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  -- Fetch active balance for this wallet
  SELECT balance INTO v_current_balance 
  FROM public.wallet_balances 
  WHERE user_id = v_user_id AND currency_code = p_currency_code;
  
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet balance not found for currency %', p_currency_code;
  END IF;
  
  -- Validate inputs
  IF p_bet_amount <= 0 THEN
    RAISE EXCEPTION 'Bet amount zero se bada hona chahiye!';
  END IF;
  
  IF p_bet_amount > v_current_balance THEN
    RAISE EXCEPTION 'Apke pass itna balance nahi hai!';
  END IF;

  IF p_target_multiplier < 1.01 THEN
    RAISE EXCEPTION 'Target multiplier kam se kam 1.01x hona chahiye.';
  END IF;

  -- Fetch user's active seed configuration
  SELECT server_seed, server_seed_hash, client_seed, nonce 
  INTO v_server_seed, v_server_seed_hash, v_client_seed, v_nonce
  FROM public.user_seeds 
  WHERE user_id = v_user_id;

  -- Lazy-initialize user seeds on-the-fly if missing
  IF v_server_seed IS NULL THEN
    v_server_seed := encode(gen_random_bytes(32), 'hex');
    v_server_seed_hash := encode(digest(v_server_seed::bytea, 'sha256'), 'hex');
    v_client_seed := COALESCE(p_client_seed, encode(gen_random_bytes(8), 'hex'));
    v_nonce := 0;

    INSERT INTO public.user_seeds (user_id, client_seed, server_seed, server_seed_hash, nonce)
    VALUES (v_user_id, v_client_seed, v_server_seed, v_server_seed_hash, v_nonce);
  ELSE
    IF p_client_seed IS NOT NULL AND p_client_seed <> v_client_seed THEN
      v_client_seed := p_client_seed;
      UPDATE public.user_seeds SET client_seed = v_client_seed WHERE user_id = v_user_id;
    END IF;
  END IF;

  -- Calculate outcome via standard HMAC-SHA256
  v_hmac_hex := encode(hmac((v_client_seed || ':' || v_nonce)::bytea, v_server_seed::bytea, 'sha256'), 'hex');
  v_rand_val := ('x' || SUBSTR(v_hmac_hex, 1, 8))::bit(32)::bigint::FLOAT / 4294967295.0;
  v_result_multiplier := ROUND((0.99 / (1.0 - COALESCE(NULLIF(v_rand_val, 1.0), 0.999999))) * 100.0) / 100.0;
  
  IF v_result_multiplier < 1.0 THEN
    v_result_multiplier := 1.0;
  END IF;
  IF v_result_multiplier > 1000000.0 THEN
    v_result_multiplier := 1000000.0;
  END IF;

  -- Determine winning state
  IF v_result_multiplier >= p_target_multiplier THEN
    v_is_win := TRUE;
    v_payout := p_bet_amount * p_target_multiplier;
  ELSE
    v_is_win := FALSE;
    v_payout := 0;
  END IF;

  -- Calculate the user's new balance for the active wallet
  v_new_balance := v_current_balance - p_bet_amount + v_payout;

  -- Update specific user wallet balance
  UPDATE public.wallet_balances 
  SET balance = v_new_balance 
  WHERE user_id = v_user_id AND currency_code = p_currency_code;

  -- Also update profiles.balance for legacy compatibility (using USDT value or the active one if it is USDT)
  IF p_currency_code = 'USDT' THEN
    UPDATE public.profiles SET balance = v_new_balance WHERE id = v_user_id;
  END IF;

  -- Log the bet to the historical table with its currency code
  INSERT INTO public.bets (
    user_id, bet_amount, target_multiplier, result_multiplier, payout, is_win, 
    client_seed, server_seed, server_seed_hash, nonce, revealed, currency_code
  ) VALUES (
    v_user_id, p_bet_amount, p_target_multiplier, v_result_multiplier, v_payout, v_is_win,
    v_client_seed, v_server_seed, v_server_seed_hash, v_nonce, FALSE, p_currency_code
  );

  -- Increment nonce count for the next bet
  UPDATE public.user_seeds SET nonce = v_nonce + 1 WHERE user_id = v_user_id;

  -- Return results payload
  RETURN JSON_BUILD_OBJECT(
    'is_win', v_is_win,
    'result_multiplier', v_result_multiplier,
    'payout', v_payout,
    'new_balance', v_new_balance,
    'nonce', v_nonce,
    'client_seed', v_client_seed,
    'server_seed_hash', v_server_seed_hash,
    'currency_code', p_currency_code
  );
END;
$$;

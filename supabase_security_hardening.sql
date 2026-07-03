-- ====================================================================
-- DAMRUBET COMPLETE SECURITY HARDENING & MULTI-CURRENCY SECURITY FIX
-- Run this entire script in your Supabase SQL Editor (https://supabase.com)
-- ====================================================================

-- --------------------------------------------------------------------
-- STEP 1: RLS & COLUMN-LEVEL UPDATE PERMISSIONS AUDIT (ISSUE 2 & 3)
-- --------------------------------------------------------------------

-- For public.profiles:
-- Revoke direct client UPDATE permission on profiles table completely
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
-- Grant UPDATE only on the "username" column to authenticated users
GRANT UPDATE (username) ON public.profiles TO authenticated;

-- For public.wallet_balances:
-- Add the last_faucet_claim column to track the cooldown if it doesn't exist
ALTER TABLE public.wallet_balances ADD COLUMN IF NOT EXISTS last_faucet_claim TIMESTAMPTZ;

-- Revoke direct client UPDATE of the balance column entirely from authenticated and anonymous users
REVOKE UPDATE ON public.wallet_balances FROM authenticated, anon;
-- Only allow SELECT and INSERT of new rows
GRANT SELECT, INSERT ON public.wallet_balances TO authenticated, anon;

-- For public.balance_adjustments (ISSUE 3):
-- Replace the policy that leaks adjustments of other users to any authenticated user
DROP POLICY IF EXISTS "Authenticated users can view adjustments" ON public.balance_adjustments;
DROP POLICY IF EXISTS "Users can view their own adjustments" ON public.balance_adjustments;

CREATE POLICY "Users can view their own adjustments" ON public.balance_adjustments
  FOR SELECT USING (auth.uid() = user_id);

-- Ensure RLS is enabled on balance_adjustments
ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------
-- STEP 2: CREATE THE CURRENCY RATES TABLE (ISSUE 1)
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.currency_rates (
  currency_code TEXT PRIMARY KEY,
  price_usd DECIMAL NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed with reasonable USD prices for USDT/BTC/ETH/LTC/SOL/DOGE/BCH/XRP/INR
INSERT INTO public.currency_rates (currency_code, price_usd) VALUES
  ('USDT', 1.0),
  ('BTC', 91200.0),
  ('ETH', 3120.0),
  ('LTC', 124.5),
  ('SOL', 176.4),
  ('DOGE', 0.224),
  ('BCH', 445.8),
  ('XRP', 1.12),
  ('INR', 0.0120)
ON CONFLICT (currency_code) DO UPDATE SET price_usd = EXCLUDED.price_usd;

-- Allow authenticated and anonymous users to view rates
GRANT SELECT ON public.currency_rates TO authenticated, anon;


-- --------------------------------------------------------------------
-- STEP 3: CLAIM FAUCET SECURE RPC (SECURITY DEFINER) (ISSUE 1 & 4)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_faucet(p_currency_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_current_balance DECIMAL;
  v_last_claim TIMESTAMPTZ;
  v_amount_to_add DECIMAL;
  v_new_balance DECIMAL;
BEGIN
  -- Security check: derive identity from session auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be logged in';
  END IF;

  -- Ensure the user profile row exists first
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    INSERT INTO public.profiles (id, balance, username)
    VALUES (v_user_id, 1000.00, 'user')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Ensure the user has a wallet_balances row for this specific currency
  INSERT INTO public.wallet_balances (user_id, currency_code, balance)
  VALUES (v_user_id, p_currency_code, 0)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  -- Fetch active balance and last claim time for this wallet and lock the row to prevent race conditions
  SELECT balance, last_faucet_claim INTO v_current_balance, v_last_claim 
  FROM public.wallet_balances 
  WHERE user_id = v_user_id AND currency_code = p_currency_code
  FOR UPDATE;

  -- Enforce a lookup/case for fixed faucet amounts
  v_amount_to_add := CASE UPPER(TRIM(p_currency_code))
    WHEN 'USDT' THEN 1000.00
    WHEN 'INR' THEN 50000.00
    WHEN 'BTC' THEN 0.01
    WHEN 'ETH' THEN 0.1
    WHEN 'LTC' THEN 5.0
    WHEN 'SOL' THEN 2.0
    WHEN 'DOGE' THEN 1000.00
    WHEN 'BCH' THEN 1.0
    WHEN 'XRP' THEN 500.00
    ELSE 100.00
  END;

  -- Enforce 4 hours cooldown
  IF v_last_claim IS NOT NULL AND v_last_claim + INTERVAL '4 hours' > now() THEN
    RAISE EXCEPTION 'Faucet claim is on cooldown. Please wait.';
  END IF;

  v_new_balance := COALESCE(v_current_balance, 0) + v_amount_to_add;

  -- Update specific user wallet balance
  UPDATE public.wallet_balances 
  SET balance = v_new_balance, last_faucet_claim = now()
  WHERE user_id = v_user_id AND currency_code = p_currency_code;

  -- Also update profiles.balance for legacy compatibility
  IF UPPER(TRIM(p_currency_code)) = 'USDT' THEN
    UPDATE public.profiles SET balance = v_new_balance WHERE id = v_user_id;
  END IF;

  -- Return results payload
  RETURN JSON_BUILD_OBJECT(
    'currency_code', UPPER(TRIM(p_currency_code)),
    'new_balance', v_new_balance,
    'added_amount', v_amount_to_add
  );
END;
$$;


-- --------------------------------------------------------------------
-- STEP 4: SWAP CURRENCY SECURE RPC (SECURITY DEFINER) (ISSUE 1 & 4)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.swap_currency(
  p_source_currency TEXT,
  p_dest_currency TEXT,
  p_amount DECIMAL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_source_balance DECIMAL;
  v_dest_balance DECIMAL;
  v_source_price DECIMAL;
  v_dest_price DECIMAL;
  v_converted_amount DECIMAL;
  v_new_source_balance DECIMAL;
  v_new_dest_balance DECIMAL;
  v_src TEXT;
  v_dst TEXT;
BEGIN
  -- Security check: derive identity from session auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be logged in';
  END IF;

  v_src := UPPER(TRIM(p_source_currency));
  v_dst := UPPER(TRIM(p_dest_currency));

  IF v_src = v_dst THEN
    RAISE EXCEPTION 'Source and destination currencies must be different';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Swap amount must be greater than zero';
  END IF;

  -- Fetch exchange rates from database table
  SELECT price_usd INTO v_source_price FROM public.currency_rates WHERE currency_code = v_src;
  SELECT price_usd INTO v_dest_price FROM public.currency_rates WHERE currency_code = v_dst;

  IF v_source_price IS NULL OR v_dest_price IS NULL THEN
    RAISE EXCEPTION 'Exchange rate for selected currencies not found';
  END IF;

  -- Calculate the destination amount server-side using those rates
  v_converted_amount := ROUND((p_amount * v_source_price) / v_dest_price, 8);

  -- Ensure the user has wallet_balances rows for both currencies first
  INSERT INTO public.wallet_balances (user_id, currency_code, balance)
  VALUES (v_user_id, v_src, 0)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  INSERT INTO public.wallet_balances (user_id, currency_code, balance)
  VALUES (v_user_id, v_dst, 0)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  -- Lock both rows with FOR UPDATE in alphabetical order to guarantee deadlock-free execution
  IF v_src < v_dst THEN
    SELECT balance INTO v_source_balance FROM public.wallet_balances 
      WHERE user_id = v_user_id AND currency_code = v_src FOR UPDATE;
    SELECT balance INTO v_dest_balance FROM public.wallet_balances 
      WHERE user_id = v_user_id AND currency_code = v_dst FOR UPDATE;
  ELSE
    SELECT balance INTO v_dest_balance FROM public.wallet_balances 
      WHERE user_id = v_user_id AND currency_code = v_dst FOR UPDATE;
    SELECT balance INTO v_source_balance FROM public.wallet_balances 
      WHERE user_id = v_user_id AND currency_code = v_src FOR UPDATE;
  END IF;

  -- Check if user has sufficient source balance
  IF v_source_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance in source currency. Available: % %', v_source_balance, v_src;
  END IF;

  -- Atomically decrement source and increment destination
  v_new_source_balance := v_source_balance - p_amount;
  v_new_dest_balance := COALESCE(v_dest_balance, 0) + v_converted_amount;

  UPDATE public.wallet_balances 
  SET balance = v_new_source_balance 
  WHERE user_id = v_user_id AND currency_code = v_src;

  UPDATE public.wallet_balances 
  SET balance = v_new_dest_balance 
  WHERE user_id = v_user_id AND currency_code = v_dst;

  -- Sync with profiles table for legacy USDT compatibility if applicable
  IF v_src = 'USDT' THEN
    UPDATE public.profiles SET balance = v_new_source_balance WHERE id = v_user_id;
  ELSIF v_dst = 'USDT' THEN
    UPDATE public.profiles SET balance = v_new_dest_balance WHERE id = v_user_id;
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'source_currency', v_src,
    'dest_currency', v_dst,
    'source_new_balance', v_new_source_balance,
    'dest_new_balance', v_new_dest_balance,
    'swapped_amount', p_amount,
    'received_amount', v_converted_amount
  );
END;
$$;


-- --------------------------------------------------------------------
-- STEP 5: CORRECTED place_bet SECURE RPC WITH FOR UPDATE LOCK (ISSUE 4)
-- --------------------------------------------------------------------

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

  -- Fetch active balance for this wallet AND lock the row to prevent TOCTOU race conditions
  SELECT balance INTO v_current_balance 
  FROM public.wallet_balances 
  WHERE user_id = v_user_id AND currency_code = p_currency_code
  FOR UPDATE;
  
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

-- --------------------------------------------------------------------
-- STEP 6: CRON/ADMIN-SAFE CURRENCY RATES REFRESH EXAMPLES
-- --------------------------------------------------------------------
-- To update rates periodically, you or a cron job can run:
-- INSERT INTO public.currency_rates (currency_code, price_usd, updated_at) VALUES
--   ('BTC', 92500.0, now()),
--   ('ETH', 3150.0, now())
-- ON CONFLICT (currency_code) DO UPDATE SET price_usd = EXCLUDED.price_usd, updated_at = now();

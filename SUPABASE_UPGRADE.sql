-- ====================================================================
-- DAMRUBET PROVABLY-FAIR UPGRADE SCRIPT (SHA-256 / HMAC-SHA256)
-- Run this entire script in your Supabase SQL Editor (https://supabase.com)
-- ====================================================================

-- Step 0: Enable pgcrypto extension for advanced hashing (digest, hmac, gen_random_bytes)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Step 1: Create Profiles Table (If not already created)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  balance DECIMAL(12,2) DEFAULT 1000.00 NOT NULL,
  username TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Profiles (If not already enabled)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to select their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Allow users to insert their own profile on registration
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile (like faucet balance reset)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Grant standard permissions on profiles
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated, anon;


-- Step 2: Create user_seeds Table
-- This table stores the active client seed, unrevealed server seed, and active nonce count
CREATE TABLE IF NOT EXISTS public.user_seeds (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  client_seed TEXT NOT NULL DEFAULT 'default_client_seed',
  server_seed TEXT NOT NULL,                     -- Raw server-side active seed (hidden)
  server_seed_hash TEXT NOT NULL,                -- SHA-256 hash of server seed (visible to client)
  nonce INT DEFAULT 0 NOT NULL,                  -- Nonce count, increments with every bet
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on user_seeds
ALTER TABLE public.user_seeds ENABLE ROW LEVEL SECURITY;

-- Allow users to select/view their own seed configuration (Using DROP & CREATE for correct syntax)
DROP POLICY IF EXISTS "Users can view their own seeds" ON public.user_seeds;
CREATE POLICY "Users can view their own seeds" ON public.user_seeds
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own seeds" ON public.user_seeds;
CREATE POLICY "Users can update their own seeds" ON public.user_seeds
  FOR UPDATE USING (auth.uid() = user_id);

-- Grant select/insert/update access to user_seeds
GRANT SELECT, INSERT, UPDATE ON public.user_seeds TO authenticated, anon;


-- Step 3: Create Bets Table
-- This stores individual historical bets with full seeds & nonce for retrospective verifiability
CREATE TABLE IF NOT EXISTS public.bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  bet_amount DECIMAL(12,2) NOT NULL,
  target_multiplier DECIMAL(12,2) NOT NULL,
  result_multiplier DECIMAL(12,2) NOT NULL,
  payout DECIMAL(12,2) NOT NULL,
  is_win BOOLEAN NOT NULL,
  client_seed TEXT NOT NULL,
  server_seed TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  nonce INT NOT NULL,
  revealed BOOLEAN DEFAULT FALSE NOT NULL,       -- Becomes true when the seed pair is rotated/revealed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on bets
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

-- Allow users to select/view their own bet records (Using DROP & CREATE for correct syntax)
DROP POLICY IF EXISTS "Users can view their own bets" ON public.bets;
CREATE POLICY "Users can view their own bets" ON public.bets
  FOR SELECT USING (auth.uid() = user_id);

-- Grant standard permissions on bets table
GRANT SELECT, INSERT ON public.bets TO authenticated, anon;


-- Step 3.5: Drop OLD overloaded functions to prevent conflicts before creating secure ones
DROP FUNCTION IF EXISTS public.place_bet(UUID, DECIMAL, DECIMAL, TEXT);
DROP FUNCTION IF EXISTS public.reveal_seed(UUID);
DROP FUNCTION IF EXISTS public.place_bet(DECIMAL, DECIMAL, TEXT);
DROP FUNCTION IF EXISTS public.reveal_seed();


-- Step 4: Upgraded place_bet RPC Function (HMAC-SHA256 & Nonce Provably-Fair)
-- SECURE: Removed p_user_id param. We derive identity internally using auth.uid()
CREATE OR REPLACE FUNCTION public.place_bet(
  p_bet_amount DECIMAL,
  p_target_multiplier DECIMAL,
  p_client_seed TEXT DEFAULT NULL
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
  -- CRITICAL SECURITY FIX: Use auth.uid() directly for session integrity
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be logged in';
  END IF;

  -- 1. Fetch user wallet balance
  SELECT balance INTO v_current_balance FROM public.profiles WHERE id = v_user_id;
  
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found. Please log in or claim faucet wallet.';
  END IF;
  
  -- 2. Validate input parameters
  IF p_bet_amount <= 0 THEN
    RAISE EXCEPTION 'Bet amount zero se bada hona chahiye!';
  END IF;
  
  IF p_bet_amount > v_current_balance THEN
    RAISE EXCEPTION 'Apke pass itna balance nahi hai!';
  END IF;

  IF p_target_multiplier < 1.01 THEN
    RAISE EXCEPTION 'Target multiplier kam se kam 1.01x hona chahiye.';
  END IF;

  -- 3. Fetch or automatically initialize user's active seeds
  SELECT server_seed, server_seed_hash, client_seed, nonce 
  INTO v_server_seed, v_server_seed_hash, v_client_seed, v_nonce
  FROM public.user_seeds 
  WHERE user_id = v_user_id;

  -- If user has no active seeds set, generate them automatically on-the-fly
  IF v_server_seed IS NULL THEN
    -- Generate a cryptographically secure random 32-byte hex for the server seed
    v_server_seed := encode(gen_random_bytes(32), 'hex');
    -- Hash it using SHA-256
    v_server_seed_hash := encode(digest(v_server_seed::bytea, 'sha256'), 'hex');
    -- Fallback/Default client seed if not supplied
    v_client_seed := COALESCE(p_client_seed, encode(gen_random_bytes(8), 'hex'));
    v_nonce := 0;

    INSERT INTO public.user_seeds (user_id, client_seed, server_seed, server_seed_hash, nonce)
    VALUES (v_user_id, v_client_seed, v_server_seed, v_server_seed_hash, v_nonce);
  ELSE
    -- If a new client seed is supplied, update it on the active seed configuration
    IF p_client_seed IS NOT NULL AND p_client_seed <> v_client_seed THEN
      v_client_seed := p_client_seed;
      UPDATE public.user_seeds SET client_seed = v_client_seed WHERE user_id = v_user_id;
    END IF;
  END IF;

  -- 4. Calculate Provably-Fair outcome using standard HMAC-SHA256
  -- message = client_seed + ':' + nonce
  -- key = server_seed
  v_hmac_hex := encode(hmac((v_client_seed || ':' || v_nonce)::bytea, v_server_seed::bytea, 'sha256'), 'hex');
  
  -- Extract 32-bit float value from the first 8 hex characters (4 bytes)
  v_rand_val := ('x' || SUBSTR(v_hmac_hex, 1, 8))::bit(32)::bigint::FLOAT / 4294967295.0;

  -- Derive outcome multiplier (99% RTP / 1% House Edge): 0.99 / (1.0 - RandVal)
  v_result_multiplier := ROUND((0.99 / (1.0 - COALESCE(NULLIF(v_rand_val, 1.0), 0.999999))) * 100.0) / 100.0;
  
  -- Clamp bounds
  IF v_result_multiplier < 1.0 THEN
    v_result_multiplier := 1.0;
  END IF;
  IF v_result_multiplier > 1000000.0 THEN
    v_result_multiplier := 1000000.0;
  END IF;

  -- 5. Determine winning state
  IF v_result_multiplier >= p_target_multiplier THEN
    v_is_win := TRUE;
    v_payout := p_bet_amount * p_target_multiplier;
  ELSE
    v_is_win := FALSE;
    v_payout := 0;
  END IF;

  -- Update user balance
  v_new_balance := v_current_balance - p_bet_amount + v_payout;
  UPDATE public.profiles SET balance = v_new_balance WHERE id = v_user_id;

  -- 6. Log detailed bet to historical table
  INSERT INTO public.bets (
    user_id, bet_amount, target_multiplier, result_multiplier, payout, is_win, 
    client_seed, server_seed, server_seed_hash, nonce, revealed
  ) VALUES (
    v_user_id, p_bet_amount, p_target_multiplier, v_result_multiplier, v_payout, v_is_win,
    v_client_seed, v_server_seed, v_server_seed_hash, v_nonce, FALSE
  );

  -- 7. Increment nonce count in user_seeds for the next bet
  UPDATE public.user_seeds SET nonce = v_nonce + 1 WHERE user_id = v_user_id;

  -- Return results payload
  RETURN JSON_BUILD_OBJECT(
    'is_win', v_is_win,
    'result_multiplier', v_result_multiplier,
    'payout', v_payout,
    'new_balance', v_new_balance,
    'nonce', v_nonce,
    'client_seed', v_client_seed,
    'server_seed_hash', v_server_seed_hash
  );
END;
$$;


-- Step 5: Create reveal_seed RPC Function
-- SECURE: Removed p_user_id param. We derive identity internally using auth.uid()
-- Rotates user's seed pair: reveals the current unrevealed raw server seed and generates a fresh one
CREATE OR REPLACE FUNCTION public.reveal_seed()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_revealed_server_seed TEXT;
  v_revealed_server_seed_hash TEXT;
  v_revealed_client_seed TEXT;
  v_revealed_nonce INT;
  
  v_new_server_seed TEXT;
  v_new_server_seed_hash TEXT;
BEGIN
  -- CRITICAL SECURITY FIX: Use auth.uid() directly for session integrity
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be logged in';
  END IF;

  -- 1. Retrieve the current active seeds
  SELECT server_seed, server_seed_hash, client_seed, nonce 
  INTO v_revealed_server_seed, v_revealed_server_seed_hash, v_revealed_client_seed, v_revealed_nonce
  FROM public.user_seeds
  WHERE user_id = v_user_id;

  IF v_revealed_server_seed IS NULL THEN
    RAISE EXCEPTION 'No active seed found to rotate.';
  END IF;

  -- 2. Mark all historical bets played on this server seed as "revealed"
  UPDATE public.bets 
  SET revealed = TRUE 
  WHERE user_id = v_user_id AND server_seed_hash = v_revealed_server_seed_hash;

  -- 3. Generate a brand new server seed
  v_new_server_seed := encode(gen_random_bytes(32), 'hex');
  v_new_server_seed_hash := encode(digest(v_new_server_seed::bytea, 'sha256'), 'hex');

  -- 4. Rotate seeds in the database, resetting nonce to 0
  UPDATE public.user_seeds 
  SET server_seed = v_new_server_seed,
      server_seed_hash = v_new_server_seed_hash,
      nonce = 0
  WHERE user_id = v_user_id;

  -- Return payload so client can immediately verify previous results
  RETURN JSON_BUILD_OBJECT(
    'revealed_server_seed', v_revealed_server_seed,
    'revealed_server_seed_hash', v_revealed_server_seed_hash,
    'revealed_client_seed', v_revealed_client_seed,
    'revealed_nonce', v_revealed_nonce,
    'new_server_seed_hash', v_new_server_seed_hash
  );
END;
$$;


-- Step 6: Create verify_bet Utility RPC Function
-- Takes input parameters and recalculates the provably fair result for audit validation (Public Utility)
CREATE OR REPLACE FUNCTION public.verify_bet(
  p_server_seed TEXT,
  p_client_seed TEXT,
  p_nonce INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hmac_hex TEXT;
  v_rand_val FLOAT;
  v_result_multiplier DECIMAL;
BEGIN
  -- HMAC-SHA256 signature
  v_hmac_hex := encode(hmac((p_client_seed || ':' || p_nonce)::bytea, p_server_seed::bytea, 'sha256'), 'hex');
  
  -- 32-bit floating point number extraction
  v_rand_val := ('x' || SUBSTR(v_hmac_hex, 1, 8))::bit(32)::bigint::FLOAT / 4294967295.0;
  
  -- Multiplier formulation
  v_result_multiplier := ROUND((0.99 / (1.0 - COALESCE(NULLIF(v_rand_val, 1.0), 0.999999))) * 100.0) / 100.0;
  
  IF v_result_multiplier < 1.0 THEN
    v_result_multiplier := 1.0;
  END IF;
  IF v_result_multiplier > 1000000.0 THEN
    v_result_multiplier := 1000000.0;
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'hmac_hex', v_hmac_hex,
    'rand_val', v_rand_val,
    'result_multiplier', v_result_multiplier
  );
END;
$$;


-- Step 7: Revoke execute from public/anon, and restrict only to authenticated
REVOKE EXECUTE ON FUNCTION public.place_bet(DECIMAL, DECIMAL, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reveal_seed() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.place_bet(DECIMAL, DECIMAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_seed() TO authenticated;


-- Step 8: Create balance_adjustments Table for Admin Audit tracking
CREATE TABLE IF NOT EXISTS public.balance_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for balance_adjustments
ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

-- Allow only authenticated users/admins to query adjustments
DROP POLICY IF EXISTS "Authenticated users can view adjustments" ON public.balance_adjustments;
CREATE POLICY "Authenticated users can view adjustments" ON public.balance_adjustments
  FOR SELECT USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT SELECT, INSERT ON public.balance_adjustments TO authenticated, anon;


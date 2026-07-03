-- ====================================================================
-- DAMRUBET DEPOSIT & WITHDRAWAL SYSTEM SETUP
-- Run this entire script in your Supabase SQL Editor (https://supabase.com)
-- ====================================================================

-- --------------------------------------------------------------------
-- STEP 1: STORAGE BUCKET & RLS POLICIES FOR PAYMENT PROOFS
-- --------------------------------------------------------------------

-- Create a private bucket for payment proofs if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies for payment-proofs to ensure clean setup
DROP POLICY IF EXISTS "Allow authenticated users to upload proofs to their folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read their own proofs" ON storage.objects;

-- Policy to allow users to upload files only under their own user_id directory prefix
CREATE POLICY "Allow authenticated users to upload proofs to their folder" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs' AND
    auth.uid()::text = split_part(name, '/', 1)
  );

-- Policy to allow users to view/download files only under their own user_id directory prefix
CREATE POLICY "Allow authenticated users to read their own proofs" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs' AND
    auth.uid()::text = split_part(name, '/', 1)
  );


-- --------------------------------------------------------------------
-- STEP 2: CREATE DEPOSIT & WITHDRAW REQUEST TABLES
-- --------------------------------------------------------------------

-- Create deposit_requests table
CREATE TABLE IF NOT EXISTS public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  amount DECIMAL NOT NULL CHECK (amount > 0),
  proof_image_path TEXT NOT NULL,
  utr_reference TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create withdraw_requests table
CREATE TABLE IF NOT EXISTS public.withdraw_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  amount DECIMAL NOT NULL CHECK (amount > 0),
  payout_details TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- --------------------------------------------------------------------
-- STEP 3: ROW LEVEL SECURITY (RLS) FOR REQUEST TABLES
-- --------------------------------------------------------------------

-- Enable RLS on both tables
ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdraw_requests ENABLE ROW LEVEL SECURITY;

-- deposit_requests policies:
DROP POLICY IF EXISTS "Users can view their own deposit requests" ON public.deposit_requests;
CREATE POLICY "Users can view their own deposit requests" ON public.deposit_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own pending deposit requests" ON public.deposit_requests;
CREATE POLICY "Users can insert their own pending deposit requests" ON public.deposit_requests
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    status = 'pending' AND
    amount > 0
  );

-- withdraw_requests policies (Select only, no Insert/Update/Delete allowed for users as RPC handles it):
DROP POLICY IF EXISTS "Users can view their own withdraw requests" ON public.withdraw_requests;
CREATE POLICY "Users can view their own withdraw requests" ON public.withdraw_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);


-- --------------------------------------------------------------------
-- STEP 4: SECURE RPC FOR REQUESTING WITHDRAWALS
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_currency_code TEXT,
  p_amount DECIMAL,
  p_payout_details TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_curr TEXT;
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
  v_request_id UUID;
BEGIN
  -- Derive user identity from secure session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be logged in';
  END IF;

  -- Normalize currency code
  v_curr := UPPER(TRIM(p_currency_code));
  IF v_curr NOT IN ('USDT', 'BTC', 'ETH', 'LTC', 'SOL', 'DOGE', 'BCH', 'XRP', 'INR') THEN
    RAISE EXCEPTION 'Invalid currency code: %', p_currency_code;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  IF p_payout_details IS NULL OR TRIM(p_payout_details) = '' THEN
    RAISE EXCEPTION 'Payout details are required';
  END IF;

  -- Ensure the user has a wallet_balances row for this specific currency
  INSERT INTO public.wallet_balances (user_id, currency_code, balance)
  VALUES (v_user_id, v_curr, 0)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  -- Fetch active balance for this wallet AND lock the row to prevent double-spending/race conditions
  SELECT balance INTO v_current_balance
  FROM public.wallet_balances
  WHERE user_id = v_user_id AND currency_code = v_curr
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet balance not found for currency %', v_curr;
  END IF;

  -- Check sufficient funds
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: % %', v_current_balance, v_curr;
  END IF;

  -- Immediately deduct the amount to lock/hold the funds
  v_new_balance := v_current_balance - p_amount;
  
  UPDATE public.wallet_balances
  SET balance = v_new_balance
  WHERE user_id = v_user_id AND currency_code = v_curr;

  -- Also update profiles.balance for legacy compatibility
  IF v_curr = 'USDT' THEN
    UPDATE public.profiles SET balance = v_new_balance WHERE id = v_user_id;
  END IF;

  -- Insert a row into withdraw_requests under the hood
  INSERT INTO public.withdraw_requests (user_id, currency_code, amount, payout_details, status)
  VALUES (v_user_id, v_curr, p_amount, p_payout_details, 'pending')
  RETURNING id INTO v_request_id;

  -- Return results payload
  RETURN JSON_BUILD_OBJECT(
    'request_id', v_request_id,
    'new_balance', v_new_balance,
    'currency_code', v_curr,
    'deducted_amount', p_amount
  );
END;
$$;


-- --------------------------------------------------------------------
-- STEP 5: SECURE ADMIN REVIEW FUNCTIONS (EXCLUDE FROM GENERAL PUBLIC EXECUTION)
-- --------------------------------------------------------------------

-- Admin Deposit Review RPC
CREATE OR REPLACE FUNCTION public.admin_review_deposit(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_admin_email TEXT,
  p_note TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_currency_code TEXT;
  v_amount DECIMAL;
  v_status TEXT;
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
  v_updated_row JSON;
BEGIN
  -- Lock the deposit request row to prevent race conditions (double approval, etc.)
  SELECT user_id, currency_code, amount, status
  INTO v_user_id, v_currency_code, v_amount, v_status
  FROM public.deposit_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Deposit request not found';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'This deposit request has already been processed';
  END IF;

  IF p_approve THEN
    -- Ensure wallet balance row exists for the user
    INSERT INTO public.wallet_balances (user_id, currency_code, balance)
    VALUES (v_user_id, v_currency_code, 0)
    ON CONFLICT (user_id, currency_code) DO NOTHING;

    -- Fetch and lock user balance
    SELECT balance INTO v_current_balance
    FROM public.wallet_balances
    WHERE user_id = v_user_id AND currency_code = v_currency_code
    FOR UPDATE;

    v_new_balance := COALESCE(v_current_balance, 0) + v_amount;

    -- Update the balance
    UPDATE public.wallet_balances
    SET balance = v_new_balance
    WHERE user_id = v_user_id AND currency_code = v_currency_code;

    -- Sync profile balance if USDT
    IF v_currency_code = 'USDT' THEN
      UPDATE public.profiles SET balance = v_new_balance WHERE id = v_user_id;
    END IF;

    v_status := 'approved';
  ELSE
    v_status := 'rejected';
  END IF;

  -- Update deposit request status & details
  UPDATE public.deposit_requests
  SET status = v_status,
      admin_note = p_note,
      reviewed_by = p_admin_email,
      reviewed_at = now()
  WHERE id = p_request_id
  RETURNING ROW_TO_JSON(deposit_requests.*) INTO v_updated_row;

  RETURN v_updated_row;
END;
$$;

-- Revoke general execution rights on admin_review_deposit to secure it
REVOKE EXECUTE ON FUNCTION public.admin_review_deposit(UUID, BOOLEAN, TEXT, TEXT) FROM public, authenticated, anon;


-- Admin Withdrawal Review RPC
CREATE OR REPLACE FUNCTION public.admin_review_withdrawal(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_admin_email TEXT,
  p_note TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_currency_code TEXT;
  v_amount DECIMAL;
  v_status TEXT;
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
  v_updated_row JSON;
BEGIN
  -- Lock the withdrawal request row to prevent race conditions
  SELECT user_id, currency_code, amount, status
  INTO v_user_id, v_currency_code, v_amount, v_status
  FROM public.withdraw_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'This withdrawal request has already been processed';
  END IF;

  IF p_approve THEN
    v_status := 'approved';
  ELSE
    -- REJECTED: Refund the held amount back to user's wallet balance
    INSERT INTO public.wallet_balances (user_id, currency_code, balance)
    VALUES (v_user_id, v_currency_code, 0)
    ON CONFLICT (user_id, currency_code) DO NOTHING;

    SELECT balance INTO v_current_balance
    FROM public.wallet_balances
    WHERE user_id = v_user_id AND currency_code = v_currency_code
    FOR UPDATE;

    v_new_balance := COALESCE(v_current_balance, 0) + v_amount;

    -- Update balance
    UPDATE public.wallet_balances
    SET balance = v_new_balance
    WHERE user_id = v_user_id AND currency_code = v_currency_code;

    -- Sync profiles.balance if USDT
    IF v_currency_code = 'USDT' THEN
      UPDATE public.profiles SET balance = v_new_balance WHERE id = v_user_id;
    END IF;

    v_status := 'rejected';
  END IF;

  -- Update withdrawal request status
  UPDATE public.withdraw_requests
  SET status = v_status,
      admin_note = p_note,
      reviewed_by = p_admin_email,
      reviewed_at = now()
  WHERE id = p_request_id
  RETURNING ROW_TO_JSON(withdraw_requests.*) INTO v_updated_row;

  RETURN v_updated_row;
END;
$$;

-- Revoke general execution rights on admin_review_withdrawal to secure it
REVOKE EXECUTE ON FUNCTION public.admin_review_withdrawal(UUID, BOOLEAN, TEXT, TEXT) FROM public, authenticated, anon;

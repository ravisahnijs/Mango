// ====================================================================
// DAMRUBET ADMIN BACKEND ROUTER - MULTI-CURRENCY INTEGRATED
// Kaam: Yeh router admin control panel ke sabhi APIs ko handle karta hai.
// Isme Login, Dashboard statistics in USD, User multi-currency list,
// aur selective balance adjustments shamil hain.
// ====================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Admin Auth Middleware ko import karte hain taaki routes ko protect kiya ja sake
const adminAuth = require('../middleware/adminAuth');

// Centered and cleaned Supabase client instance ko import karte hain
const supabase = require('../supabaseClient');

// Static conversion price map relative to USD for accurate back-office calculations
const BACKEND_PRICES_IN_USD = {
  USDT: 1.0,
  BTC: 91200.0,
  ETH: 3120.0,
  LTC: 124.5,
  SOL: 176.4,
  DOGE: 0.224,
  BCH: 445.8,
  XRP: 1.12,
  INR: 0.0120, // 1 INR = 0.012 USD
  USD: 1.0
};

/**
 * Helper: Safely serialize error objects to get all internal properties
 */
function serializeError(err) {
  if (!err) return 'No error object supplied';
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err));
  } catch (e) {
    return String(err);
  }
}

/**
 * 1. POST /api/admin/login
 * Admin login verification aur JWT token issue karna.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('[Admin Login API] New login attempt incoming...');
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Kripya Email aur Password dono input karein!'
      });
    }

    const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim() : null;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ? process.env.ADMIN_PASSWORD_HASH.trim() : null;
    const jwtSecret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : null;

    if (!adminEmail || !adminPasswordHash || !jwtSecret) {
      console.error('❌ [Admin Login Error] Missing env variables configured on backend.');
      return res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'Admin credentials ya JWT Secret server env file me configured nahi hai!'
      });
    }

    if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid Admin Email ya Password!'
      });
    }

    const isMatch = await bcrypt.compare(password.trim(), adminPasswordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid Admin Email ya Password!'
      });
    }

    const token = jwt.sign(
      { email: adminEmail, role: 'admin' },
      jwtSecret,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Admin login safal raha!',
      token,
      admin: { email: adminEmail, role: 'admin' }
    });

  } catch (error) {
    console.error('❌ [Admin Login Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Kuch technical error aayi hai login ke waqt.',
      reason: error.message
    });
  }
});

/**
 * 2. GET /api/admin/dashboard (Protected)
 * Stats calculation supporting Multi-Currency converted to USD base.
 */
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    console.log('[Admin Dashboard API] Fetching multi-currency statistics...');

    // A. Users exact count
    let totalUsers = 0;
    const { count: countExactUsers, error: usersErr } = await supabase
      .from('profiles')
      .select('id', { count: 'exact' })
      .limit(1);

    if (usersErr) {
      const { data: allProfiles, error: fallbackUsersErr } = await supabase.from('profiles').select('id');
      if (fallbackUsersErr) throw fallbackUsersErr;
      totalUsers = allProfiles ? allProfiles.length : 0;
    } else {
      totalUsers = countExactUsers !== null ? countExactUsers : 0;
    }

    // B. Bets exact count
    let totalBets = 0;
    const { count: countExactBets, error: betsErr } = await supabase
      .from('bets')
      .select('id', { count: 'exact' })
      .limit(1);

    if (betsErr) {
      const { data: allBets, error: fallbackBetsErr } = await supabase.from('bets').select('id');
      if (fallbackBetsErr) throw fallbackBetsErr;
      totalBets = allBets ? allBets.length : 0;
    } else {
      totalBets = countExactBets !== null ? countExactBets : 0;
    }

    // C. Bets totals converted to USD
    const { data: sumsData, error: sumsErr } = await supabase
      .from('bets')
      .select('bet_amount, payout, currency_code');

    if (sumsErr) throw sumsErr;

    let totalBetAmountUSD = 0;
    let totalPayoutAmountUSD = 0;

    if (sumsData && sumsData.length > 0) {
      sumsData.forEach(bet => {
        const cur = (bet.currency_code || 'USDT').toUpperCase();
        const price = BACKEND_PRICES_IN_USD[cur] || 1.0;
        totalBetAmountUSD += parseFloat(bet.bet_amount || 0) * price;
        totalPayoutAmountUSD += parseFloat(bet.payout || 0) * price;
      });
    }

    const houseEdgeRevenueUSD = totalBetAmountUSD - totalPayoutAmountUSD;

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalBets,
        totalBetAmount: Math.round(totalBetAmountUSD * 100) / 100,
        totalPayoutAmount: Math.round(totalPayoutAmountUSD * 100) / 100,
        houseEdgeRevenue: Math.round(houseEdgeRevenueUSD * 100) / 100
      }
    });

  } catch (error) {
    console.error('❌ [Admin Dashboard API Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Dashboard statistics load karne me error aayi.',
      reason: error.message
    });
  }
});

/**
 * 3. GET /api/admin/users (Protected)
 * Users list with separate multi-currency wallet rows and USD aggregated wealth.
 */
router.get('/users', adminAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    console.log('[Admin Users API] Fetching users and separate wallet balances...');
    const { data: users, error: usersErr } = await supabase
      .from('profiles')
      .select('id, username, created_at')
      .order('created_at', { ascending: false });

    if (usersErr) throw usersErr;

    const { data: wallets, error: walletsErr } = await supabase
      .from('wallet_balances')
      .select('user_id, currency_code, balance');

    if (walletsErr) {
      console.warn('⚠️ [Admin Users API] Wallets load error, falling back:', serializeError(walletsErr));
    }

    const enrichedUsers = (users || []).map(u => {
      const userWallets = (wallets || []).filter(w => w.user_id === u.id);
      
      // Calculate total USD balance for display
      let totalUSDBalance = 0;
      userWallets.forEach(w => {
        const cur = (w.currency_code || 'USDT').toUpperCase();
        const price = BACKEND_PRICES_IN_USD[cur] || 1.0;
        totalUSDBalance += parseFloat(w.balance || 0) * price;
      });

      return {
        ...u,
        balances: userWallets,
        balance: Math.round(totalUSDBalance * 100) / 100
      };
    });

    return res.status(200).json({
      success: true,
      users: enrichedUsers
    });

  } catch (error) {
    console.error('❌ [Admin Users API Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Users list fetch karne me error aayi.',
      reason: error.message
    });
  }
});

/**
 * 4. GET /api/admin/users/:userId/bets (Protected)
 */
router.get('/users/:userId/bets', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    const { data: userBets, error } = await supabase
      .from('bets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      bets: userBets || []
    });

  } catch (error) {
    console.error('❌ [Admin User Bets API Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'User bet history nikalne me error aayi.',
      reason: error.message
    });
  }
});

/**
 * 5. POST /api/admin/users/:userId/adjust-balance (Protected)
 * Admin can adjust the balance of a SPECIFIC currency.
 */
router.post('/users/:userId/adjust-balance', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body;
    const currency = (req.body.currency_code || 'USDT').toUpperCase().trim();

    console.log(`[Admin Balance API] Adjusting ${currency} balance for user: ${userId}`);

    if (amount === undefined || isNaN(Number(amount)) || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Kripya amount (number) aur solid reason dono send karein!'
      });
    }

    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    // Verify user exists
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      return res.status(404).json({
        success: false,
        message: 'User profile database me nahi mili!'
      });
    }

    // Ensure wallet row exists
    const { data: wallet, error: walletErr } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency_code', currency)
      .maybeSingle();

    let currentBalance = 0;
    if (walletErr) {
      console.error('❌ Error finding wallet:', serializeError(walletErr));
    } else if (wallet) {
      currentBalance = parseFloat(wallet.balance || 0);
    } else {
      // Create wallet if missing
      await supabase
        .from('wallet_balances')
        .insert({ user_id: userId, currency_code: currency, balance: 0 });
    }

    const adjustAmount = parseFloat(amount);
    const newBalance = Math.round((currentBalance + adjustAmount) * 100000000) / 100000000;

    if (newBalance < 0) {
      return res.status(400).json({
        success: false,
        message: `Incomplete Transaction: Negative balance allowed nahi hai! Current balance ${currentBalance} ${currency} hai, adjustment ${adjustAmount} hai.`
      });
    }

    // Update wallet balance row
    const { error: updateErr } = await supabase
      .from('wallet_balances')
      .update({ balance: newBalance })
      .eq('user_id', userId)
      .eq('currency_code', currency);

    if (updateErr) throw updateErr;

    // Backward compatibility for profiles.balance (only for USDT)
    if (currency === 'USDT') {
      await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);
    }

    // Log the audit adjustment in balance_adjustments
    const { error: adjustErr } = await supabase
      .from('balance_adjustments')
      .insert({
        admin_email: req.admin.email,
        user_id: userId,
        amount: adjustAmount,
        reason: reason.trim(),
        currency_code: currency
      });

    if (adjustErr) {
      console.error('❌ Audit entry log fail:', serializeError(adjustErr));
    }

    return res.status(200).json({
      success: true,
      message: `${currency} balance successfully adjusted for user ${profile.username}.`,
      oldBalance: currentBalance,
      newBalance: newBalance,
      adjustedAmount: adjustAmount,
      currency: currency
    });

  } catch (error) {
    console.error('❌ [Admin Balance API Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Balance adjust karne me technical error aayi.',
      reason: error.message
    });
  }
});

/**
 * GET /api/admin/deposits
 * List manual deposit requests with filtering by status and short-lived signed URLs for payment proof images
 */
router.get('/deposits', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    console.log(`[Admin Deposits API] Fetching deposits. Status filter: ${status || 'None'}`);

    let query = supabase
      .from('deposit_requests')
      .select('*, profiles(username)')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('❌ Supabase fetch deposits error:', serializeError(error));
      throw error;
    }

    // Generate signed URLs for payment proofs
    const depositsWithSignedUrls = await Promise.all((data || []).map(async (dep) => {
      let signedUrl = null;
      if (dep.proof_image_path) {
        try {
          const { data: signData, error: signError } = await supabase
            .storage
            .from('payment-proofs')
            .createSignedUrl(dep.proof_image_path, 3600); // 1 hour validity

          if (signError) {
            console.error(`⚠️ Signed URL generation error for path ${dep.proof_image_path}:`, serializeError(signError));
          } else if (signData) {
            signedUrl = signData.signedUrl;
          }
        } catch (storageErr) {
          console.error(`⚠️ Failed to generate signed URL for path ${dep.proof_image_path}:`, storageErr);
        }
      }
      return {
        ...dep,
        proof_signed_url: signedUrl
      };
    }));

    return res.status(200).json({
      success: true,
      data: depositsWithSignedUrls
    });
  } catch (error) {
    console.error('❌ [Admin Deposits List API Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Deposit requests list fetch karne me error aayi.',
      reason: error.message
    });
  }
});

/**
 * POST /api/admin/deposits/:id/review
 * Approve or Reject a manual deposit request
 */
router.post('/deposits/:id/review', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { approve, note } = req.body;

    if (approve === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Kripya approve parameter (true/false) provide karein.'
      });
    }

    console.log(`[Admin Deposit Review] ID: ${id}, Approve: ${approve}, Admin: ${req.admin.email}`);

    // Call the admin_review_deposit secure RPC using server client (service role)
    const { data, error } = await supabase.rpc('admin_review_deposit', {
      p_request_id: id,
      p_approve: !!approve,
      p_admin_email: req.admin.email,
      p_note: note || ''
    });

    if (error) {
      console.error('❌ admin_review_deposit RPC execution failed:', serializeError(error));
      return res.status(400).json({
        success: false,
        message: error.message || 'Deposit review RPC execution failed.'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Deposit request successfully ${approve ? 'approved' : 'rejected'}.`,
      data: data
    });
  } catch (error) {
    console.error('❌ [Admin Review Deposit API Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Deposit review handle karne me error aayi.',
      reason: error.message
    });
  }
});

/**
 * GET /api/admin/withdrawals
 * List manual withdrawal requests with filtering by status
 */
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    console.log(`[Admin Withdrawals API] Fetching withdrawals. Status filter: ${status || 'None'}`);

    let query = supabase
      .from('withdraw_requests')
      .select('*, profiles(username)')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('❌ Supabase fetch withdrawals error:', serializeError(error));
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('❌ [Admin Withdrawals List API Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Withdrawal requests list fetch karne me error aayi.',
      reason: error.message
    });
  }
});

/**
 * POST /api/admin/withdrawals/:id/review
 * Approve or Reject a manual withdrawal request
 */
router.post('/withdrawals/:id/review', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { approve, note } = req.body;

    if (approve === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Kripya approve parameter (true/false) provide karein.'
      });
    }

    console.log(`[Admin Withdrawal Review] ID: ${id}, Approve: ${approve}, Admin: ${req.admin.email}`);

    // Call the admin_review_withdrawal secure RPC using server client (service role)
    const { data, error } = await supabase.rpc('admin_review_withdrawal', {
      p_request_id: id,
      p_approve: !!approve,
      p_admin_email: req.admin.email,
      p_note: note || ''
    });

    if (error) {
      console.error('❌ admin_review_withdrawal RPC execution failed:', serializeError(error));
      return res.status(400).json({
        success: false,
        message: error.message || 'Withdrawal review RPC execution failed.'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Withdrawal request successfully ${approve ? 'approved' : 'rejected'}.`,
      data: data
    });
  } catch (error) {
    console.error('❌ [Admin Review Withdrawal API Error]:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Withdrawal review handle karne me error aayi.',
      reason: error.message
    });
  }
});

module.exports = router;

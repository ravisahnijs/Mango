// ====================================================================
// DAMRUBET ADMIN BACKEND ROUTER
// Kaam: Yeh router admin control panel ke sabhi APIs ko handle karta hai.
// Isme Login, Dashboard statistics, User Management aur Balance adjustments shamil hain.
// ====================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

// Admin Auth Middleware ko import karte hain taaki routes ko protect kiya ja sake
const adminAuth = require('../middleware/adminAuth');

// Supabase Connection initialize karte hain with admin service role bypass access
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * 1. POST /api/admin/login (Public with Rate-Limit applied in server.js)
 * Kaam: Admin login verification aur JWT token issue karna.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Kripya Email aur Password dono input karein!'
      });
    }

    // Env file se config details fetch karte hain
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const jwtSecret = process.env.JWT_SECRET;

    if (!adminEmail || !adminPasswordHash || !jwtSecret) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'Admin credentials ya JWT Secret server env file me configured nahi hai!'
      });
    }

    // Email check karein
    if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid Admin Email ya Password!'
      });
    }

    // Password compare (Bcrypt standard check)
    const isMatch = await bcrypt.compare(password, adminPasswordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid Admin Email ya Password!'
      });
    }

    // Sahi details hone par 24 Hours validity wala JWT token sign karein
    const token = jwt.sign(
      { email: adminEmail, role: 'admin' },
      jwtSecret,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Admin login safal raha!',
      token,
      admin: {
        email: adminEmail,
        role: 'admin'
      }
    });

  } catch (error) {
    console.error('Admin Login Error:', error.message, error.stack || error);
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
 * Kaam: Total users count, total bets count, total wagered amount, total payout nikalna.
 */
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    // A. Fetch total users from public.profiles
    const { count: totalUsers, error: usersErr } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (usersErr) throw usersErr;

    // B. Fetch total bets from public.bets
    const { count: totalBets, error: betsErr } = await supabase
      .from('bets')
      .select('*', { count: 'exact', head: true });

    if (betsErr) throw betsErr;

    // C. Fetch all bets with columns bet_amount, payout to calculate sums
    const { data: sumsData, error: sumsErr } = await supabase
      .from('bets')
      .select('bet_amount, payout');

    if (sumsErr) throw sumsErr;

    let totalBetAmount = 0;
    let totalPayoutAmount = 0;

    if (sumsData && sumsData.length > 0) {
      sumsData.forEach(bet => {
        totalBetAmount += parseFloat(bet.bet_amount || 0);
        totalPayoutAmount += parseFloat(bet.payout || 0);
      });
    }

    // Formatted calculations return karein
    return res.status(200).json({
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalBets: totalBets || 0,
        totalBetAmount: Math.round(totalBetAmount * 100) / 100,
        totalPayoutAmount: Math.round(totalPayoutAmount * 100) / 100,
        houseEdgeRevenue: Math.round((totalBetAmount - totalPayoutAmount) * 100) / 100
      }
    });

  } catch (error) {
    console.error('Admin Dashboard API Error - FULL:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
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
 * Kaam: Saare registered users ki profile aur unke balances list karna.
 */
router.get('/users', adminAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, username, balance, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      users: users || []
    });

  } catch (error) {
    console.error('Admin Users API Error:', error.message, error.stack || error);
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
 * Kaam: Kisi ek particular user ki complete bet history list karna.
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
    console.error('Admin User Bets API Error:', error.message, error.stack || error);
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
 * Kaam: Admin ke dwara kisi user ka wallet balance manually add (+), remove (-) ya set karna,
 * aur audit trail ke liye balance_adjustments table me entry store karna.
 */
router.post('/users/:userId/adjust-balance', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body; // Amount float value hogi (+100 or -50), reason must be filled

    if (amount === undefined || isNaN(Number(amount)) || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Kripya amount (number) aur solid reason dono send karein!'
      });
    }

    if (!supabase) {
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    // A. Pehle user ki existing profile fetch karo verify karne ke liye
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('balance, username')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      return res.status(404).json({
        success: false,
        message: 'Ye user profile database me nahi mili!'
      });
    }

    const currentBalance = parseFloat(profile.balance || 0);
    const adjustAmount = parseFloat(amount);
    const newBalance = Math.round((currentBalance + adjustAmount) * 100) / 100;

    if (newBalance < 0) {
      return res.status(400).json({
        success: false,
        message: `Incomplete Transaction: Negative balance allowed nahi hai! User ka current balance ${currentBalance} hai, aap ${adjustAmount} adjust kar rahe hain.`
      });
    }

    // B. Profile me balance update karein
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', userId);

    if (updateErr) throw updateErr;

    // C. Audit log entry insert karein public.balance_adjustments table me
    const { error: adjustErr } = await supabase
      .from('balance_adjustments')
      .insert({
        admin_email: req.admin.email,
        user_id: userId,
        amount: adjustAmount,
        reason: reason.trim()
      });

    if (adjustErr) {
      console.error('Audit entry failed but balance changed! error:', adjustErr.message, adjustErr.stack || adjustErr);
    }

    return res.status(200).json({
      success: true,
      message: `Balance safely updated for user ${profile.username || userId}.`,
      oldBalance: currentBalance,
      newBalance: newBalance,
      adjustedAmount: adjustAmount
    });

  } catch (error) {
    console.error('Admin Adjust Balance API Error:', error.message, error.stack || error);
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'User balance adjust karne me unexpected technical error aayi.',
      reason: error.message
    });
  }
});

module.exports = router;

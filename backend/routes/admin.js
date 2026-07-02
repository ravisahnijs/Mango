// ====================================================================
// DAMRUBET ADMIN BACKEND ROUTER - FIXED & ROBUST
// Kaam: Yeh router admin control panel ke sabhi APIs ko handle karta hai.
// Isme Login, Dashboard statistics, User Management aur Balance adjustments shamil hain.
// Centralized Supabase client, robust env-vars trimming aur robust fallback count checks integrated hain.
// ====================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Admin Auth Middleware ko import karte hain taaki routes ko protect kiya ja sake
const adminAuth = require('../middleware/adminAuth');

// Centered and cleaned Supabase client instance ko import karte hain
const supabase = require('../supabaseClient');

/**
 * Helper: Safely serialize error objects to get all internal properties (message, code, etc.)
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
 * 1. POST /api/admin/login (Public with Rate-Limit applied in server.js)
 * Kaam: Admin login verification aur JWT token issue karna.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('[Admin Login API] New login attempt incoming...');
    console.log(`[Admin Login API] Input Email: ${email ? email.trim() : 'undefined'}`);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Kripya Email aur Password dono input karein!'
      });
    }

    // Env file se config details fetch karte hain aur trim karte hain space/newline errors block karne ke liye
    const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim() : null;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ? process.env.ADMIN_PASSWORD_HASH.trim() : null;
    const jwtSecret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : null;

    if (!adminEmail || !adminPasswordHash || !jwtSecret) {
      console.error('❌ [Admin Login Error] Missing env variables configured on backend:', {
        ADMIN_EMAIL_PRESENT: !!adminEmail,
        ADMIN_PASSWORD_HASH_PRESENT: !!adminPasswordHash,
        JWT_SECRET_PRESENT: !!jwtSecret
      });
      return res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'Admin credentials ya JWT Secret server env file me configured nahi hai!'
      });
    }

    // Email check karein (Trimmed and lowercased comparison)
    if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
      console.warn(`⚠️ [Admin Login API] Auth failed: Email mismatch. Input: ${email.toLowerCase().trim()} vs Configured: ${adminEmail.toLowerCase().trim()}`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid Admin Email ya Password!'
      });
    }

    // Password compare (Bcrypt standard check)
    const isMatch = await bcrypt.compare(password.trim(), adminPasswordHash);
    if (!isMatch) {
      console.warn(`⚠️ [Admin Login API] Auth failed: Password hash comparison mismatch.`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid Admin Email ya Password!'
      });
    }

    // Sahi details hone par 24 Hours validity wala JWT token sign karein
    console.log(`[Admin Login API] Match successful! Generating JWT Token. Secret key length: ${jwtSecret.length}`);
    const token = jwt.sign(
      { email: adminEmail, role: 'admin' },
      jwtSecret,
      { expiresIn: '24h' }
    );

    console.log(`[Admin Login API] Admin login successful for email: ${adminEmail}. Token issued.`);
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
 * Kaam: Total users count, total bets count, total wagered amount, total payout nikalna.
 */
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    if (!supabase) {
      console.error('❌ [Admin Dashboard API] Supabase client object is null!');
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    console.log('[Admin Dashboard API] Fetching statistics...');

    // ==========================================
    // A. Fetch total users count with exact fallback
    // ==========================================
    let totalUsers = 0;
    
    console.log('[Admin Dashboard API] Executing exact count query for Profiles...');
    const { count: countExactUsers, error: usersErr } = await supabase
      .from('profiles')
      .select('id', { count: 'exact' })
      .limit(1);

    if (usersErr) {
      console.warn('[Admin Dashboard API] Profiles exact count failed. Detailed error:', serializeError(usersErr));
      console.warn('[Admin Dashboard API] Attempting Fallback Count by selecting all profiles ids...');
      
      const { data: allProfiles, error: fallbackUsersErr } = await supabase
        .from('profiles')
        .select('id');

      if (fallbackUsersErr) {
        console.error('❌ [Admin Dashboard API] Profiles fallback query also failed:', serializeError(fallbackUsersErr));
        throw new Error(`Profiles load query failed: [${fallbackUsersErr.code || 'NO_CODE'}] ${fallbackUsersErr.message || 'No message'}. Details: ${fallbackUsersErr.details || 'None'}`);
      } else {
        totalUsers = allProfiles ? allProfiles.length : 0;
        console.log(`💚 [Admin Dashboard API] Profiles fallback count success: ${totalUsers} users.`);
      }
    } else {
      totalUsers = countExactUsers !== null ? countExactUsers : 0;
      console.log(`💚 [Admin Dashboard API] Profiles exact count success: ${totalUsers}`);
    }

    // ==========================================
    // B. Fetch total bets count with exact fallback
    // ==========================================
    let totalBets = 0;

    console.log('[Admin Dashboard API] Executing exact count query for Bets...');
    const { count: countExactBets, error: betsErr } = await supabase
      .from('bets')
      .select('id', { count: 'exact' })
      .limit(1);

    if (betsErr) {
      console.warn('[Admin Dashboard API] Bets exact count failed. Detailed error:', serializeError(betsErr));
      console.warn('[Admin Dashboard API] Attempting Fallback Count by selecting all bets ids...');

      const { data: allBets, error: fallbackBetsErr } = await supabase
        .from('bets')
        .select('id');

      if (fallbackBetsErr) {
        console.error('❌ [Admin Dashboard API] Bets fallback query also failed:', serializeError(fallbackBetsErr));
        throw new Error(`Bets load query failed: [${fallbackBetsErr.code || 'NO_CODE'}] ${fallbackBetsErr.message || 'No message'}. Details: ${fallbackBetsErr.details || 'None'}`);
      } else {
        totalBets = allBets ? allBets.length : 0;
        console.log(`💚 [Admin Dashboard API] Bets fallback count success: ${totalBets} bets.`);
      }
    } else {
      totalBets = countExactBets !== null ? countExactBets : 0;
      console.log(`💚 [Admin Dashboard API] Bets exact count success: ${totalBets}`);
    }

    // ==========================================
    // C. Fetch all bets columns to calculate wager and payout sums
    // ==========================================
    console.log('[Admin Dashboard API] Executing sums query for wagered and payout amounts...');
    const { data: sumsData, error: sumsErr } = await supabase
      .from('bets')
      .select('bet_amount, payout');

    if (sumsErr) {
      console.error('❌ [Admin Dashboard API] Sums query failed:', serializeError(sumsErr));
      throw new Error(`Bets sums query failed: [${sumsErr.code || 'NO_CODE'}] ${sumsErr.message || 'No message'}. Details: ${sumsErr.details || 'None'}`);
    }

    let totalBetAmount = 0;
    let totalPayoutAmount = 0;

    if (sumsData && sumsData.length > 0) {
      sumsData.forEach(bet => {
        totalBetAmount += parseFloat(bet.bet_amount || 0);
        totalPayoutAmount += parseFloat(bet.payout || 0);
      });
    }

    const houseEdgeRevenue = totalBetAmount - totalPayoutAmount;

    console.log('[Admin Dashboard API] All stats calculated successfully:', {
      totalUsers,
      totalBets,
      totalBetAmount,
      totalPayoutAmount,
      houseEdgeRevenue
    });

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalBets,
        totalBetAmount: Math.round(totalBetAmount * 100) / 100,
        totalPayoutAmount: Math.round(totalPayoutAmount * 100) / 100,
        houseEdgeRevenue: Math.round(houseEdgeRevenue * 100) / 100
      }
    });

  } catch (error) {
    console.error('❌ [Admin Dashboard API Error] - FULL DETAILS:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'Dashboard statistics load karne me error aayi.',
      reason: error.message || 'Unknown server database error'
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
      console.error('❌ [Admin Users API] Supabase client is null!');
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    console.log('[Admin Users API] Fetching all user profiles...');
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, username, balance, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [Admin Users API] Query failed:', serializeError(error));
      throw new Error(`Users list query failed: [${error.code || 'NO_CODE'}] ${error.message || 'No message'}. Details: ${error.details || 'None'}`);
    }

    console.log(`💚 [Admin Users API] Successfully fetched ${users ? users.length : 0} user profiles.`);
    return res.status(200).json({
      success: true,
      users: users || []
    });

  } catch (error) {
    console.error('❌ [Admin Users API Error] - FULL DETAILS:', serializeError(error));
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
      console.error('❌ [Admin User Bets API] Supabase client is null!');
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    console.log(`[Admin User Bets API] Fetching bets for user: ${userId}`);
    const { data: userBets, error } = await supabase
      .from('bets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [Admin User Bets API] Query failed:', serializeError(error));
      throw new Error(`User bets query failed: [${error.code || 'NO_CODE'}] ${error.message || 'No message'}. Details: ${error.details || 'None'}`);
    }

    console.log(`💚 [Admin User Bets API] Fetched ${userBets ? userBets.length : 0} bets for user: ${userId}`);
    return res.status(200).json({
      success: true,
      bets: userBets || []
    });

  } catch (error) {
    console.error('❌ [Admin User Bets API Error] - FULL DETAILS:', serializeError(error));
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

    console.log(`[Admin Balance API] Attempting balance adjustment for user: ${userId}`);
    console.log(`[Admin Balance API] Inputs -> Amount: ${amount}, Reason: "${reason}"`);

    if (amount === undefined || isNaN(Number(amount)) || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Kripya amount (number) aur solid reason dono send karein!'
      });
    }

    if (!supabase) {
      console.error('❌ [Admin Balance API] Supabase client is null!');
      return res.status(500).json({ success: false, message: 'Supabase client connected nahi hai!' });
    }

    // A. Pehle user ki existing profile fetch karo verify karne ke liye
    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('balance, username')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      console.error('❌ [Admin Balance API] User profile query failed or empty:', serializeError(profErr));
      return res.status(404).json({
        success: false,
        message: 'Ye user profile database me nahi mili!'
      });
    }

    const currentBalance = parseFloat(profile.balance || 0);
    const adjustAmount = parseFloat(amount);
    const newBalance = Math.round((currentBalance + adjustAmount) * 100) / 100;

    console.log(`[Admin Balance API] Profile verified: "${profile.username}". Current: ${currentBalance}, Adjusting: ${adjustAmount}, New: ${newBalance}`);

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

    if (updateErr) {
      console.error('❌ [Admin Balance API] Balance update failed:', serializeError(updateErr));
      throw new Error(`Balance update failed: [${updateErr.code || 'NO_CODE'}] ${updateErr.message || 'No message'}. Details: ${updateErr.details || 'None'}`);
    }

    console.log(`💚 [Admin Balance API] Balance successfully updated to ${newBalance} in profiles table.`);

    // C. Audit log entry insert karein public.balance_adjustments table me
    console.log('[Admin Balance API] Inserting audit entry in balance_adjustments table...');
    const { error: adjustErr } = await supabase
      .from('balance_adjustments')
      .insert({
        admin_email: req.admin.email,
        user_id: userId,
        amount: adjustAmount,
        reason: reason.trim()
      });

    if (adjustErr) {
      console.error('❌ [Admin Balance API Warning] Audit entry failed to insert, but balance has already been adjusted!', serializeError(adjustErr));
    } else {
      console.log('💚 [Admin Balance API] Audit entry successfully created in balance_adjustments table.');
    }

    return res.status(200).json({
      success: true,
      message: `Balance safely updated for user ${profile.username || userId}.`,
      oldBalance: currentBalance,
      newBalance: newBalance,
      adjustedAmount: adjustAmount
    });

  } catch (error) {
    console.error('❌ [Admin Balance API Error] - FULL DETAILS:', serializeError(error));
    return res.status(500).json({
      success: false,
      error: 'Server Error',
      message: 'User balance adjust karne me unexpected technical error aayi.',
      reason: error.message
    });
  }
});

module.exports = router;

// ====================================================================
// DAMRUBET EXPRESS SECURE BACKEND SERVER
// Kaam: Yeh server security middleware, request rate-limiting, secure headers
// aur CORS validation rules lagata hai, jisse humara app safe aur secure rahe.
// ====================================================================

// dotenv packge load karta hai humari '.env' file ke secrets ko
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('cross-fetch');

// Apne custom banaye hue rate limiters import karte hain
const { generalLimiter, betLimiter, adminLoginLimiter } = require('./middleware/rateLimiters');

// Admin panel router ko import karte hain
const adminRoutes = require('./routes/admin');

const app = express();

// Set 'trust proxy' to 1 so Express knows it is behind a reverse proxy (e.g. Render, Nginx, Cloudflare)
// and can safely read the client's original IP from X-Forwarded-For headers for rate limiting.
app.set('trust proxy', 1);

// 1. HELMET SECURITY MIDDLEWARE
// Yeh automatic bohot saare security HTTP headers apply kar deta hai jo hacker attacks (jaise XSS, Clickjacking) ko block karte hain.
app.use(helmet());

// Express ko JSON parsing support dene ke liye (taaki POST request me raw data read kiya ja sake)
app.use(express.json());

// 2. CORS (Cross-Origin Resource Sharing) SYSTEM
// Hum sirf apni specific Frontend URL se hi aane wali requests allow karenge. Koi dusra domain (bina authorization) humare API ko call nahi kar payega.
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

const corsOptions = {
  origin: function (origin, callback) {
    // Agar development me bina origin ke tool se direct test karein, ya origin match kare
    if (!origin || origin === frontendUrl) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked: Yeh domain/origin authorised nahi hai!'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Cookies aur auth headers pass karne ke liye
};

// CORS middleware ko Express me register karte hain
app.use(cors(corsOptions));

// 3. GLOBAL GENERAL RATE LIMITER
// Har route par max 100 requests per 15 minutes wala protection active ho jayega.
app.use(generalLimiter);


// 4. SUPABASE CLIENT INITIALIZATION (FOR BACKEND MIDDLEWARE SERVICES)
// Agar hume backend se Supabase ke tables ya queries handle karni ho, toh ye secure admin connection hai.
const supabase = require('./supabaseClient');


// 5. BACKEND ROUTES DEFINITIONS

/**
 * ADMIN CONTROL PANEL SECURE ROUTES
 * Kaam: Login, Dashboard statistics, User Management aur Balance edits handle karna.
 * Security: Login par strict brute-force limiting (max 5 attempts per 15 minutes) apply hai.
 */
app.use('/api/admin/login', adminLoginLimiter); // Protect login route specifically
app.use('/api/admin', adminRoutes); // Mount all other admin routes

/**
 * API HEALTH CHECK ROUTE (Public)
 * Kaam: Pata karne ke liye ki backend server sahi se active hai ya nahi.
 * Route: GET http://localhost:5000/api/health
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * CRITICAL ACTIVITY OR SECURE BET ACTIVITY ROUTE (Example Placeholder)
 * Kaam: Strict rate limiter lagane ka display karne ke liye route.
 * Is route par 'betLimiter' ka use kiya hai jo 10 seconds me max 10 requests control karega.
 */
app.post('/api/secure-bet-activity', betLimiter, async (req, res) => {
  try {
    const { userId, betAmount } = req.body;
    
    // Is endpoint par strict limit check complete ho chuka hai.
    res.status(200).json({
      success: true,
      message: 'Secure request verified by strict rate-limiter.',
      userId,
      betAmount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// 6. ERROR HANDLING MIDDLEWARE
// Agar koi unexpected code exception aati hai, ya CORS block hota hai toh ye friendly message return karega
app.use((err, req, res, next) => {
  console.error('Backend Error log:', err.message);
  res.status(err.message.includes('CORS') ? 403 : 500).json({
    success: false,
    error: 'Internal Server Error',
    reason: err.message
  });
});


// 7. LISTEN ON SPECIFIED PORT
// Humara server specified PORT (default: 5000) par start hoga
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🚀 DamruBet Secure Backend running on port ${PORT}`);
  console.log(`🔒 Allowed Frontend URL (CORS): ${frontendUrl}`);
  console.log('🛡️  Helmet Security Headers is ACTIVE');
  console.log('⏱️  General Rate Limiter (100req/15m) is ACTIVE');
  console.log('====================================================');
});

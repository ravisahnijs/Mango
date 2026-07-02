// ====================================================================
// DAMRUBET CENTRALIZED SUPABASE CLIENT
// Kaam: Yeh module Supabase client ko single place me initialize karta hai.
// Isme extra string cleaning (trim, trailing slash removal) lagai gayi hai
// taaki Render aur other hosting systems par space ya character issues block na karein.
// ====================================================================

const { createClient } = require('@supabase/supabase-js');
const fetch = require('cross-fetch');

const rawUrl = process.env.SUPABASE_URL;
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Clean and validate environment variables to prevent copy-paste errors
const supabaseUrl = rawUrl ? rawUrl.trim() : null;
const supabaseServiceKey = rawKey ? rawKey.trim() : null;

let supabase = null;

if (supabaseUrl && supabaseServiceKey) {
  let cleanUrl = supabaseUrl;
  // Agr URL ke end me slash h, toh use hatayein
  if (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }

  try {
    // We pass persistSession: false for backend environments
    supabase = createClient(cleanUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        fetch: fetch
      }
    });

    console.log('====================================================');
    console.log('💚 [SupabaseClient] Client successfully initialized!');
    console.log(`📡 URL: ${cleanUrl}`);
    console.log(`🔑 Service Role Key Length: ${supabaseServiceKey.length} chars`);
    console.log(`🔑 Service Role Key Preview: ${supabaseServiceKey.substring(0, 10)}...${supabaseServiceKey.substring(supabaseServiceKey.length - 8)}`);
    console.log('====================================================');
  } catch (err) {
    console.error('❌ [SupabaseClient] Failed to create client:', err.message);
  }
} else {
  console.error('====================================================');
  console.error('⚠️ [SupabaseClient] ERROR: Environment variables missing!');
  console.error(`SUPABASE_URL present: ${!!supabaseUrl}`);
  console.error(`SUPABASE_SERVICE_ROLE_KEY present: ${!!supabaseServiceKey}`);
  console.error('====================================================');
}

module.exports = supabase;

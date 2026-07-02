// ====================================================================
// DAMRUBET BCRYPT PASSWORD HASH GENERATOR TOOL
// Kaam: Yeh script plain-text admin password ko secure bcrypt hash me convert karti hai,
// taaki aap '.env' file me apna direct plain text password store karne ke bachein.
// ====================================================================

const bcrypt = require('bcryptjs');

// === APNA ADMIN PASSWORD NICHE APNE HISAB SE LIKHEIN ===
const plainPasswordToHash = "admin12345"; 
// =======================================================

async function hashMyPassword() {
  console.log('Generating secure bcrypt hash for password: "' + plainPasswordToHash + '" ...');
  
  // Standard 10 rounds salt use karenge
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(plainPasswordToHash, salt);
  
  console.log('\n================================================================');
  console.log('✅ SECURE BCRYPT HASH GENERATED SUCCESSFULLY!');
  console.log('================================================================');
  console.log('Copy this hashed string and set it inside your backend .env file:\n');
  console.log('ADMIN_PASSWORD_HASH="' + hash + '"');
  console.log('\n================================================================');
  console.log('💡 TIP: Hashing pure secure cryptographic format me hai. Plain password invisible rahega.');
}

hashMyPassword();

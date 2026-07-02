// ====================================================================
// DAMRUBET ADMIN JWT AUTHENTICATION MIDDLEWARE
// Kaam: Yeh middleware har ek admin route par incoming request ke authorization header ko check karta hai.
// Agar valid admin JWT token nahi milta, toh request ko aage badhne se block kar deta hai.
// ====================================================================

const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    // Authorization header se token nikalte hain. Format: "Bearer <token>"
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Access Denied: Authorization header missing hai.'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Access Denied: Token missing hai.'
      });
    }

    // Secret Key se token verify karte hain (secret key process.env.JWT_SECRET se aayegi)
    const rawSecret = process.env.JWT_SECRET;
    const jwtSecret = rawSecret ? rawSecret.trim() : null;
    if (!jwtSecret) {
      console.error('⚠️ ALERT: JWT_SECRET env variable configured nahi hai backend par!');
      return res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'Server par JWT configuration incomplete hai.'
      });
    }

    // EXTRA DEBUG LOGGING
    console.log('[Admin Auth Middleware] Incoming Token validation activity...');
    console.log(`[Admin Auth Middleware] Raw Token length: ${token.length} characters.`);
    console.log(`[Admin Auth Middleware] Secret key length: ${jwtSecret.length} characters.`);
    console.log(`[Admin Auth Middleware] Token preview: ${token.substring(0, 15)}...${token.substring(token.length - 15)}`);

    // Token verify aur decode karein
    const decoded = jwt.verify(token, jwtSecret);
    
    console.log(`[Admin Auth Middleware] JWT successfully verified for admin: ${decoded.email}`);

    // Decoded payload ko req object me add karte hain taaki aage ke handlers isey use kar sakein
    req.admin = decoded;

    // Aage badho actual route controller handler par
    next();
  } catch (error) {
    console.error('❌ Admin Auth Middleware Error - Token Verification Failed!');
    console.error('❌ Error Message:', error.message);
    console.error('❌ Error Stack:', error.stack || error);
    
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Access Denied: Token invalid hai ya expire ho chuka hai.',
      reason: error.message
    });
  }
};

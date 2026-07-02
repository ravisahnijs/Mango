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
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('⚠️ ALERT: JWT_SECRET env variable configured nahi hai backend par!');
      return res.status(500).json({
        success: false,
        error: 'Configuration Error',
        message: 'Server par JWT configuration incomplete hai.'
      });
    }

    // Token verify aur decode karein
    const decoded = jwt.verify(token, jwtSecret);
    
    // Decoded payload ko req object me add karte hain taaki aage ke handlers isey use kar sakein
    req.admin = decoded;

    // Aage badho actual route controller handler par
    next();
  } catch (error) {
    console.error('Admin Auth Middleware Error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Access Denied: Token invalid hai ya expire ho chuka hai.',
      reason: error.message
    });
  }
};

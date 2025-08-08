const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from parent directory's .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

class JWTAuth {
  constructor() {
    this.secret = process.env.JWT_SECRET;
    
    if (!this.secret) {
      throw new Error('JWT_SECRET not found in environment variables');
    }
    
    console.log('🔐 JWT Authentication initialized for preview-image-service');
  }

  /**
   * Verify and decode a JWT token
   * @param {string} token - The JWT token to verify
   * @returns {object|null} - Decoded token payload or null if invalid
   */
  verifyToken(token) {
    try {
      // Remove 'Bearer ' prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, '');
      
      const decoded = jwt.verify(cleanToken, this.secret);
      
      // Validate token structure
      if (!decoded.sub || !decoded.iat || !decoded.exp) {
        console.warn('🔒 Invalid JWT structure - missing required claims');
        return null;
      }
      
      // Check if token is expired (additional check)
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp < now) {
        console.warn('🔒 JWT token is expired');
        return null;
      }
      
      return decoded;
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        console.warn('🔒 Invalid JWT token:', error.message);
      } else if (error.name === 'TokenExpiredError') {
        console.warn('🔒 JWT token expired:', error.message);
      } else if (error.name === 'NotBeforeError') {
        console.warn('🔒 JWT token not active yet:', error.message);
      } else {
        console.error('🔒 JWT verification error:', error.message);
      }
      return null;
    }
  }

  /**
   * Extract JWT token from HTTP request headers or query parameters
   * @param {object} req - The HTTP request object
   * @returns {string|null} - The JWT token or null if not found
   */
  extractToken(req) {
    let token = null;
    
    // Try to get token from Authorization header
    if (req.headers && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('🔍 JWT token found in Authorization header');
      }
    }
    
    // Try to get token from query parameters as fallback
    if (!token && req.query && req.query.token) {
      token = req.query.token;
      console.log('🔍 JWT token found in query parameters');
    }
    
    // Try to get token from custom headers
    if (!token && req.headers && req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
      console.log('🔍 JWT token found in X-Auth-Token header');
    }
    
    return token;
  }

  /**
   * Authenticate an HTTP request
   * @param {object} req - The HTTP request object
   * @returns {object|null} - User info if authenticated, null otherwise
   */
  authenticateRequest(req) {
    const token = this.extractToken(req);
    
    if (!token) {
      console.warn('🔒 No JWT token provided in HTTP request');
      return null;
    }
    
    const decoded = this.verifyToken(token);
    
    if (!decoded) {
      console.warn('🔒 JWT token validation failed');
      return null;
    }
    
    // Extract user information from token
    const userInfo = {
      userId: decoded.sub,
      name: decoded.name || 'Unknown',
      email: decoded.email || 'unknown@example.com',
      permissions: decoded.permissions || { preview_images: false, admin: false },
      tokenIssuedAt: decoded.iat,
      tokenExpiresAt: decoded.exp
    };
    
    console.log(`✅ JWT authentication successful for user: ${userInfo.name} (${userInfo.email})`);
    
    return userInfo;
  }

  /**
   * Check if user has permission for preview images
   * @param {object} userInfo - User information from JWT token
   * @returns {boolean} - True if user has permission
   */
  hasPreviewImagePermission(userInfo) {
    return userInfo && 
           userInfo.permissions && 
           (userInfo.permissions.preview_images === true ||
            userInfo.permissions.admin === true);
  }

  /**
   * Check if user is admin
   * @param {object} userInfo - User information from JWT token
   * @returns {boolean} - True if user is admin
   */
  isAdmin(userInfo) {
    return userInfo && 
           userInfo.permissions && 
           userInfo.permissions.admin === true;
  }

  /**
   * Create Express middleware for JWT authentication
   * @param {boolean} required - Whether authentication is required (default: true)
   * @returns {Function} - Express middleware function
   */
  createAuthMiddleware(required = true) {
    return (req, res, next) => {
      const userInfo = this.authenticateRequest(req);
      
      if (required && !userInfo) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Valid JWT token required for this endpoint'
        });
      }
      
      if (userInfo && !this.hasPreviewImagePermission(userInfo)) {
        return res.status(403).json({ 
          error: 'Permission denied',
          message: 'User does not have permission to access preview images'
        });
      }
      
      // Add user info to request object
      req.user = userInfo;
      next();
    };
  }

  /**
   * Log authentication event for audit purposes
   * @param {string} event - Event type ('access', 'access_denied', etc.)
   * @param {object} userInfo - User information
   * @param {string} additionalInfo - Additional context
   */
  logAuthEvent(event, userInfo = null, additionalInfo = '') {
    const timestamp = new Date().toISOString();
    const userId = userInfo ? userInfo.userId : 'unknown';
    const userEmail = userInfo ? userInfo.email : 'unknown';
    
    console.log(`🔐 [${timestamp}] PREVIEW_AUTH_EVENT: ${event} | User: ${userId} (${userEmail}) | ${additionalInfo}`);
  }
}

module.exports = JWTAuth;
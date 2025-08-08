import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from parent directory's .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

class JWTAuth {
  constructor() {
    this.secret = process.env.JWT_SECRET;
    
    if (!this.secret) {
      throw new Error('JWT_SECRET not found in environment variables');
    }
    
    console.log('🔐 JWT Authentication initialized');
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
   * Extract JWT token from WebSocket request headers or query parameters
   * @param {object} req - The WebSocket request object
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
    if (!token && req.url) {
      const url = new URL(req.url, 'ws://localhost');
      token = url.searchParams.get('token');
      if (token) {
        console.log('🔍 JWT token found in query parameters');
      }
    }
    
    // Try to get token from custom headers
    if (!token && req.headers && req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
      console.log('🔍 JWT token found in X-Auth-Token header');
    }
    
    return token;
  }

  /**
   * Authenticate a WebSocket connection
   * @param {object} req - The WebSocket request object
   * @returns {object|null} - User info if authenticated, null otherwise
   */
  authenticateConnection(req) {
    const token = this.extractToken(req);
    
    if (!token) {
      console.warn('🔒 No JWT token provided in WebSocket connection');
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
      permissions: decoded.permissions || { audio_streams: false, admin: false },
      tokenIssuedAt: decoded.iat,
      tokenExpiresAt: decoded.exp
    };
    
    console.log(`✅ JWT authentication successful for user: ${userInfo.name} (${userInfo.email})`);
    
    return userInfo;
  }

  /**
   * Check if user has permission for audio streams
   * @param {object} userInfo - User information from JWT token
   * @returns {boolean} - True if user has permission
   */
  hasAudioStreamPermission(userInfo) {
    return userInfo && 
           userInfo.permissions && 
           userInfo.permissions.audio_streams === true;
  }

  /**
   * Check if user has permission for real-time data
   * @param {object} userInfo - User information from JWT token
   * @returns {boolean} - True if user has permission
   */
  hasRealtimeDataPermission(userInfo) {
    return userInfo && 
           userInfo.permissions && 
           (userInfo.permissions.realtime_data === true || 
            userInfo.permissions.audio_streams === true || 
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
   * Log authentication event for audit purposes
   * @param {string} event - Event type ('login', 'access_denied', etc.)
   * @param {object} userInfo - User information
   * @param {string} additionalInfo - Additional context
   */
  logAuthEvent(event, userInfo = null, additionalInfo = '') {
    const timestamp = new Date().toISOString();
    const userId = userInfo ? userInfo.userId : 'unknown';
    const userEmail = userInfo ? userInfo.email : 'unknown';
    
    console.log(`🔐 [${timestamp}] AUTH_EVENT: ${event} | User: ${userId} (${userEmail}) | ${additionalInfo}`);
  }
}

export default JWTAuth;
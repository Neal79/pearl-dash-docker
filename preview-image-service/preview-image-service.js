/**
 * Pearl Dashboard Preview Image Service
 * 
 * This microservice handles automated fetching, caching, and serving of preview images
 * from Epiphan Pearl devices (Mini, Nano, Pearl 2). It operates on a subscription model
 * where only actively viewed device/channel combinations are polled for images.
 * 
 * Key Features:
 * - Subscription-based image polling (only fetch what's being viewed)
 * - Configurable refresh rates, resolution, and image formats via environment variables
 * - Hardware protection with exponential backoff for failed API calls
 * - MySQL integration with Laravel database for device authentication
 * - HTTP Basic Auth for Pearl device API calls
 * - Docker volume storage with organized file structure
 * - Image optimization using Sharp (JPEG compression)
 * - Automatic cleanup when unsubscribing
 * - Health check endpoints for monitoring
 * 
 * Architecture:
 * - Port 3449: Main API (subscription management, image serving, status)
 * - Port 3450: Health check endpoint
 * - Storage: Docker volume at /app/storage/images/device_id/channel_N.jpg
 * - Database: Direct MySQL connection to Laravel's devices table
 * 
 * Pearl API Integration:
 * - Endpoint: /api/v2.0/channels/<channel-id>/preview?resolution=auto&keep_aspect_ratio=true&format=jpg
 * - Authentication: HTTP Basic Auth using device username/password from database
 * - Supported channels: 1-4 (standard Pearl Mini configuration)
 * 
 * Environment Variables:
 * - PREVIEW_IMAGE_REFRESH_RATE: Polling interval in seconds (default: 10)
 * - PREVIEW_IMAGE_MAX_BACKOFF_DELAY: Maximum backoff delay in seconds (default: 300)
 * - PREVIEW_IMAGE_BACKOFF_MULTIPLIER: Exponential backoff multiplier (default: 2)
 * - PREVIEW_IMAGE_RESOLUTION: Pearl API resolution parameter (default: 'auto')
 * - PREVIEW_IMAGE_FORMAT: Image format (default: 'jpg')
 * - PREVIEW_IMAGE_KEEP_ASPECT_RATIO: Whether to maintain aspect ratio (default: 'true')
 * - Standard database connection variables (DB_HOST, DB_USERNAME, etc.)
 * 
 * API Endpoints:
 * - POST /subscribe: Subscribe to device/channel preview images
 * - DELETE /unsubscribe: Unsubscribe from device/channel (stops polling, cleans up images)
 * - GET /image/:deviceId/:channelId: Serve cached preview image
 * - GET /subscriptions: List all active subscriptions
 * - GET /status: Service status and configuration
 * - GET /health: Health check (port 3450)
 * 
 * Docker Integration:
 * - Depends on MySQL database container with health checks
 * - Uses shared Docker volume for persistent image storage
 * - Runs on pearlnet Docker network for internal communication
 * 
 * Usage Flow:
 * 1. Frontend subscribes to specific device/channel combinations
 * 2. Service queries database for device credentials
 * 3. Starts polling Pearl device API every N seconds
 * 4. Caches images in organized directory structure
 * 5. Frontend requests cached images via HTTP API
 * 6. When frontend navigates away, unsubscribes to stop unnecessary polling
 * 
 * @author Pearl Dashboard
 * @version 1.0.0
 */

const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const winston = require('winston');
const JWTAuth = require('./jwt-auth.js');

/**
 * Service Configuration
 * 
 * Loads configuration from environment variables with sensible defaults.
 * Most settings are configurable via the project root .env file.
 */
const config = {
  // Server ports
  port: process.env.PORT || 3449,                                              // Main API port
  healthPort: process.env.HEALTH_PORT || 3450,                                // Health check port
  
  // Image polling configuration
  refreshRate: parseInt(process.env.PREVIEW_IMAGE_REFRESH_RATE) * 1000 || 10000, // Convert seconds to milliseconds
  resolution: process.env.PREVIEW_IMAGE_RESOLUTION || 'auto',                 // Pearl API resolution parameter
  format: process.env.PREVIEW_IMAGE_FORMAT || 'jpg',                         // Image format (jpg, png)
  keepAspectRatio: process.env.PREVIEW_IMAGE_KEEP_ASPECT_RATIO === 'true',   // Maintain aspect ratio
  
  // Hardware protection - exponential backoff configuration
  maxBackoffDelay: parseInt(process.env.PREVIEW_IMAGE_MAX_BACKOFF_DELAY) * 1000 || 300000, // Max 5 minutes backoff
  backoffMultiplier: parseFloat(process.env.PREVIEW_IMAGE_BACKOFF_MULTIPLIER) || 2,        // Exponential multiplier
  
  // File storage (Docker volume mount)
  storageDir: path.join(__dirname, 'storage', 'images'),                     // Base directory for cached images
  
  // Database connection (Laravel MySQL database)
  database: {
    host: process.env.DB_HOST || 'db',                                        // Container name in Docker network
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'pearldashuser',
    password: process.env.DB_PASSWORD || 'LaneChicago1997!',
    database: process.env.DB_DATABASE || 'pearl_dash'
  }
};

/**
 * Winston Logger Configuration
 * 
 * Configures structured logging with timestamps and error stack traces.
 * Log level can be controlled via LOG_LEVEL environment variable.
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * JWT Authentication Setup
 * 
 * Initialize JWT authentication following the same pattern as other services
 * TODO: Re-enable once volume mounting issues are resolved
 */
let jwtAuth = null;

try {
  jwtAuth = new JWTAuth();
  logger.info('🔐 JWT authentication initialized successfully');
} catch (error) {
  logger.error('❌ Failed to initialize JWT authentication:', error.message);
  process.exit(1);
}

/**
 * Global State Management
 * 
 * The service maintains in-memory state for active subscriptions and polling intervals.
 * This allows efficient management of which device/channel combinations are being polled
 * while supporting multiple subscribers per device/channel combination.
 * 
 * Multi-Subscriber Architecture:
 * - Multiple users can subscribe to the same device/channel
 * - Only one polling interval per device/channel (efficient API usage)
 * - Polling stops only when the last subscriber unsubscribes
 * - Each subscriber gets a unique session ID for tracking
 */
let dbConnection = null;                                                      // MySQL connection instance

// New multi-subscriber architecture
const deviceChannelInfo = new Map();                                         // deviceId_channelId -> {device, lastFetched, subscriberCount}
const subscribers = new Map();                                                // subscriberId -> {deviceId, channelId, subscribedAt}  
const deviceChannelSubscribers = new Map();                                  // deviceId_channelId -> Set<subscriberId>
const pollingIntervals = new Map();                                          // deviceId_channelId -> intervalId

// Hardware protection - exponential backoff state
const deviceBackoffState = new Map();                                        // deviceId_channelId -> {consecutiveFailures, currentBackoffDelay, lastFailureTime}

// Image cleanup configuration
const IMAGE_MAX_AGE_MS = 3 * 60 * 1000;                                     // 3 minutes - images older than this are deleted
let cleanupInterval = null;                                                   // Cleanup timer

// Helper function to generate unique subscriber IDs
function generateSubscriberId() {
  return `subscriber_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hardware Protection - Exponential Backoff Functions
 * 
 * These functions implement exponential backoff to protect Pearl devices from
 * being overwhelmed by failed API requests. When a device starts failing,
 * we progressively increase the delay between attempts.
 */

// Initialize backoff state for a device/channel combination
function initializeBackoffState(deviceChannelKey) {
  if (!deviceBackoffState.has(deviceChannelKey)) {
    deviceBackoffState.set(deviceChannelKey, {
      consecutiveFailures: 0,
      currentBackoffDelay: 0,
      lastFailureTime: null
    });
  }
  return deviceBackoffState.get(deviceChannelKey);
}

// Record a successful API call (reset backoff)
function recordApiSuccess(deviceChannelKey) {
  const state = deviceBackoffState.get(deviceChannelKey);
  if (state && state.consecutiveFailures > 0) {
    const [deviceId, channelId] = deviceChannelKey.split('_');
    const recoveryDuration = Date.now() - state.lastFailureTime.getTime();
    
    logger.info(`✅ DEVICE RECOVERED [${deviceChannelKey}] - Back to normal operation`, {
      device: `${deviceId}`,
      channel: `${channelId}`,
      previousFailures: state.consecutiveFailures,
      downDuration: `${Math.round(recoveryDuration/1000)}s`,
      wasInBackoff: state.currentBackoffDelay > 0,
      previousBackoffDelay: `${state.currentBackoffDelay/1000}s`,
      timestamp: new Date().toISOString()
    });
    
    // Log recovery alert for devices that had serious issues
    if (state.consecutiveFailures >= 3) {
      logger.info(`🎉 DEVICE HEALTH RESTORED: Device ${deviceId} channel ${channelId} has recovered after ${state.consecutiveFailures} failures. System is now stable.`);
    }
    
    deviceBackoffState.set(deviceChannelKey, {
      consecutiveFailures: 0,
      currentBackoffDelay: 0,
      lastFailureTime: null
    });
  }
}

// Record an API failure and calculate new backoff delay
function recordApiFailure(deviceChannelKey, error) {
  const state = initializeBackoffState(deviceChannelKey);
  
  state.consecutiveFailures++;
  state.lastFailureTime = new Date();
  
  // Calculate exponential backoff delay
  const baseDelay = config.refreshRate; // Start with normal refresh rate
  const exponentialDelay = baseDelay * Math.pow(config.backoffMultiplier, state.consecutiveFailures - 1);
  state.currentBackoffDelay = Math.min(exponentialDelay, config.maxBackoffDelay);
  
  // Categorize error types for better logging
  const [deviceId, channelId] = deviceChannelKey.split('_');
  const errorCategory = categorizeError(error);
  const nextAttemptTime = new Date(Date.now() + state.currentBackoffDelay);
  
  // Log with structured information for monitoring
  logger.warn(`🚨 DEVICE FAILURE [${deviceChannelKey}] - ${errorCategory.type}`, {
    device: `${deviceId}`,
    channel: `${channelId}`,
    failureCount: state.consecutiveFailures,
    errorType: errorCategory.type,
    errorCode: error.code || 'UNKNOWN',
    errorMessage: error.message,
    httpStatus: error.response?.status || null,
    backoffDelay: `${state.currentBackoffDelay/1000}s`,
    nextAttempt: nextAttemptTime.toISOString(),
    severity: errorCategory.severity,
    likelyHardwareIssue: errorCategory.hardwareRelated,
    timestamp: new Date().toISOString()
  });
  
  // Additional alert logging for serious issues
  if (state.consecutiveFailures >= 3) {
    logger.error(`🔥 DEVICE HEALTH ALERT: Device ${deviceId} channel ${channelId} has failed ${state.consecutiveFailures} consecutive times. This may indicate a hardware problem, network issue, or device configuration error.`);
  }
  
  if (state.currentBackoffDelay >= config.maxBackoffDelay) {
    logger.error(`⚠️ MAXIMUM BACKOFF REACHED: Device ${deviceId} channel ${channelId} is now at maximum backoff delay (${config.maxBackoffDelay/1000}s). Device may be offline or experiencing serious issues.`);
  }
  
  deviceBackoffState.set(deviceChannelKey, state);
  return state.currentBackoffDelay;
}

// Categorize errors for better logging and monitoring
function categorizeError(error) {
  const errorCode = error.code;
  const statusCode = error.response?.status;
  const message = error.message.toLowerCase();
  
  // Network/Connection errors (likely hardware or network issues)
  if (errorCode === 'ECONNREFUSED') {
    return {
      type: 'CONNECTION_REFUSED',
      severity: 'HIGH',
      hardwareRelated: true,
      description: 'Device is not accepting connections (device may be offline or network unreachable)'
    };
  }
  
  if (errorCode === 'ETIMEDOUT') {
    return {
      type: 'TIMEOUT',
      severity: 'HIGH', 
      hardwareRelated: true,
      description: 'Device is not responding within timeout period (device may be overloaded or network congested)'
    };
  }
  
  if (errorCode === 'ENOTFOUND') {
    return {
      type: 'DNS_RESOLUTION_FAILED',
      severity: 'HIGH',
      hardwareRelated: true, 
      description: 'Cannot resolve device hostname/IP (device may have changed IP or DNS issue)'
    };
  }
  
  if (errorCode === 'ECONNRESET') {
    return {
      type: 'CONNECTION_RESET',
      severity: 'MEDIUM',
      hardwareRelated: true,
      description: 'Device forcibly closed the connection (device may have restarted or network interrupted)'
    };
  }
  
  // HTTP status code errors (API/authentication issues)  
  if (statusCode === 401) {
    return {
      type: 'AUTHENTICATION_FAILED',
      severity: 'MEDIUM',
      hardwareRelated: false,
      description: 'Invalid credentials for device API (check username/password in database)'
    };
  }
  
  if (statusCode === 404) {
    return {
      type: 'ENDPOINT_NOT_FOUND', 
      severity: 'MEDIUM',
      hardwareRelated: false,
      description: 'Device API endpoint not found (check channel ID or API path)'
    };
  }
  
  if (statusCode === 500) {
    return {
      type: 'DEVICE_INTERNAL_ERROR',
      severity: 'HIGH',
      hardwareRelated: true,
      description: 'Device returned internal server error (device may be experiencing issues)'
    };
  }
  
  if (statusCode >= 400 && statusCode < 500) {
    return {
      type: 'CLIENT_ERROR',
      severity: 'MEDIUM', 
      hardwareRelated: false,
      description: `Device returned client error ${statusCode} (check API request format)`
    };
  }
  
  if (statusCode >= 500) {
    return {
      type: 'SERVER_ERROR',
      severity: 'HIGH',
      hardwareRelated: true, 
      description: `Device returned server error ${statusCode} (device may be malfunctioning)`
    };
  }
  
  // Generic error fallback
  return {
    type: 'UNKNOWN_ERROR',
    severity: 'MEDIUM',
    hardwareRelated: false,
    description: `Unrecognized error: ${error.message}`
  };
}

// Check if device is currently in backoff period
function isInBackoffPeriod(deviceChannelKey) {
  const state = deviceBackoffState.get(deviceChannelKey);
  if (!state || state.consecutiveFailures === 0) {
    return false;
  }
  
  const timeSinceLastFailure = Date.now() - state.lastFailureTime.getTime();
  const stillInBackoff = timeSinceLastFailure < state.currentBackoffDelay;
  
  if (stillInBackoff) {
    const remainingBackoff = Math.ceil((state.currentBackoffDelay - timeSinceLastFailure) / 1000);
    logger.debug(`Device ${deviceChannelKey}: Still in backoff period (${remainingBackoff}s remaining)`);
  }
  
  return stillInBackoff;
}

// Get backoff statistics for monitoring
function getBackoffStats() {
  const stats = {
    devicesInBackoff: 0,
    totalFailures: 0,
    maxBackoffDelay: 0,
    backoffDetails: []
  };
  
  for (const [deviceChannelKey, state] of deviceBackoffState.entries()) {
    if (state.consecutiveFailures > 0) {
      stats.devicesInBackoff++;
      stats.totalFailures += state.consecutiveFailures;
      stats.maxBackoffDelay = Math.max(stats.maxBackoffDelay, state.currentBackoffDelay);
      
      stats.backoffDetails.push({
        deviceChannel: deviceChannelKey,
        failures: state.consecutiveFailures,
        backoffDelay: state.currentBackoffDelay,
        lastFailure: state.lastFailureTime
      });
    }
  }
  
  return stats;
}

/**
 * Cleanup old images to prevent showing stale data
 * Images older than IMAGE_MAX_AGE_MS are deleted to ensure users see current device state
 */
async function cleanupOldImages() {
  try {
    logger.debug('Running image cleanup...');
    
    // Get all device directories
    const deviceDirs = await fs.readdir(config.storageDir);
    let cleanedCount = 0;
    
    for (const deviceDir of deviceDirs) {
      const devicePath = path.join(config.storageDir, deviceDir);
      const stat = await fs.stat(devicePath);
      
      if (stat.isDirectory()) {
        // Get all image files in device directory
        const imageFiles = await fs.readdir(devicePath);
        
        for (const imageFile of imageFiles) {
          const imagePath = path.join(devicePath, imageFile);
          const imageStat = await fs.stat(imagePath);
          
          // Check if image is older than max age
          const ageMs = Date.now() - imageStat.mtime.getTime();
          if (ageMs > IMAGE_MAX_AGE_MS) {
            await fs.remove(imagePath);
            logger.debug(`Cleaned up old image: ${imagePath} (${Math.round(ageMs / 1000)}s old)`);
            cleanedCount++;
          }
        }
        
        // Remove empty device directories
        const remainingFiles = await fs.readdir(devicePath);
        if (remainingFiles.length === 0) {
          await fs.remove(devicePath);
          logger.debug(`Removed empty device directory: ${devicePath}`);
        }
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old images (older than ${IMAGE_MAX_AGE_MS / 1000}s)`);
    }
    
  } catch (error) {
    logger.error('Error during image cleanup:', error);
  }
}

/**
 * Start periodic cleanup of old images
 */
function startImageCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  // Run cleanup every 60 seconds
  cleanupInterval = setInterval(cleanupOldImages, 60000);
  logger.info(`Started image cleanup (every 60s, max age: ${IMAGE_MAX_AGE_MS / 1000}s)`);
  
  // Run initial cleanup
  cleanupOldImages();
}

/**
 * Stop periodic cleanup
 */
function stopImageCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Stopped image cleanup');
  }
}

/**
 * Express Application Setup
 * 
 * Two separate Express apps:
 * - Main app (port 3449): Full API endpoints
 * - Health app (port 3450): Simple health check endpoint
 */
const app = express();
const healthApp = express();

app.use(express.json());                                                      // Parse JSON request bodies

/**
 * Database Connection Management
 * 
 * Establishes connection to Laravel's MySQL database to query device information.
 * The connection is used to fetch device credentials for Pearl API authentication.
 */
async function initDatabase() {
  try {
    dbConnection = await mysql.createConnection(config.database);
    logger.info('Connected to MySQL database');
    
    // Test connection with ping
    await dbConnection.ping();
    logger.info('Database connection verified');
    
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

// Get devices from database
async function getDevices() {
  try {
    const [rows] = await dbConnection.execute(
      'SELECT id, name, ip, username, password FROM devices WHERE ip IS NOT NULL'
    );
    return rows;
  } catch (error) {
    logger.error('Failed to fetch devices:', error);
    return [];
  }
}

// Get device channels (Pearl devices typically have channels 1-4)
function getDeviceChannels(device) {
  // For now, assume standard Pearl Mini with 4 channels
  // This could be expanded to query the device for available channels
  return [1, 2, 3, 4];
}

// Fetch preview image from Pearl device
async function fetchPreviewImage(device, channelId) {
  try {
    const url = `http://${device.ip}/api/v2.0/channels/${channelId}/preview`;
    const params = {
      resolution: config.resolution,
      keep_aspect_ratio: config.keepAspectRatio,
      format: config.format
    };

    const response = await axios.get(url, {
      params,
      auth: {
        username: device.username,
        password: device.password
      },
      responseType: 'arraybuffer',
      timeout: 10000 // 10 second timeout
    });

    if (response.status === 200 && response.data) {
      return Buffer.from(response.data);
    }
    
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    
  } catch (error) {
    logger.error(`Failed to fetch preview for device ${device.name} channel ${channelId}:`, error.message);
    throw error;
  }
}

// Save image to storage
async function saveImage(deviceId, channelId, imageBuffer) {
  try {
    const deviceDir = path.join(config.storageDir, deviceId.toString());
    await fs.ensureDir(deviceDir);
    
    const filename = `channel_${channelId}.${config.format}`;
    const filepath = path.join(deviceDir, filename);
    
    // Optimize image with sharp if needed
    const processedImage = await sharp(imageBuffer)
      .jpeg({ quality: 85 })
      .toBuffer();
    
    await fs.writeFile(filepath, processedImage);
    
    logger.debug(`Saved preview image: ${filepath}`);
    return filepath;
    
  } catch (error) {
    logger.error(`Failed to save image for device ${deviceId} channel ${channelId}:`, error);
    throw error;
  }
}

/**
 * Image Polling Functions
 * 
 * These functions handle the actual fetching and caching of preview images
 * from Pearl devices. They work with the multi-subscriber architecture.
 */

// Poll single device/channel for preview image
async function pollPreviewImage(deviceId, channelId) {
  const deviceChannelKey = `${deviceId}_${channelId}`;
  const deviceInfo = deviceChannelInfo.get(deviceChannelKey);
  
  if (!deviceInfo) {
    logger.warn(`No device info found for ${deviceChannelKey}`);
    return;
  }

  // Check if there are still active subscribers
  const subscriberSet = deviceChannelSubscribers.get(deviceChannelKey);
  if (!subscriberSet || subscriberSet.size === 0) {
    logger.info(`No active subscribers for ${deviceChannelKey}, stopping polling`);
    stopPolling(deviceId, channelId);
    return;
  }

  // Check if device is in backoff period (hardware protection)
  if (isInBackoffPeriod(deviceChannelKey)) {
    const state = deviceBackoffState.get(deviceChannelKey);
    const remainingTime = Math.ceil((state.currentBackoffDelay - (Date.now() - state.lastFailureTime.getTime())) / 1000);
    logger.debug(`⏳ BACKOFF ACTIVE [${deviceChannelKey}] - Skipping poll (${remainingTime}s remaining, ${state.consecutiveFailures} failures)`);
    return;
  }

  try {
    const imageBuffer = await fetchPreviewImage(deviceInfo.device, channelId);
    const filepath = await saveImage(deviceId, channelId, imageBuffer);
    
    // Record successful API call (resets backoff if needed)
    recordApiSuccess(deviceChannelKey);
    
    // Update last fetched timestamp
    deviceInfo.lastFetched = new Date();
    deviceChannelInfo.set(deviceChannelKey, deviceInfo);
    
    logger.debug(`Updated preview image for device ${deviceId} channel ${channelId} (${subscriberSet.size} subscribers)`);
    
  } catch (error) {
    // Record API failure with detailed logging (this handles all the logging)
    recordApiFailure(deviceChannelKey, error);
    
    // No need for additional logging here - recordApiFailure handles comprehensive logging
    // Just continue - the backoff system will protect the device automatically
  }
}

// Start polling for a device/channel combination (only if not already polling)
function startPolling(deviceId, channelId) {
  const deviceChannelKey = `${deviceId}_${channelId}`;
  
  // Check if already polling
  if (pollingIntervals.has(deviceChannelKey)) {
    logger.debug(`Already polling device ${deviceId} channel ${channelId}`);
    return;
  }
  
  // Start new polling interval
  const intervalId = setInterval(() => {
    pollPreviewImage(deviceId, channelId);
  }, config.refreshRate);
  
  pollingIntervals.set(deviceChannelKey, intervalId);
  
  // Immediately fetch first image
  pollPreviewImage(deviceId, channelId);
  
  const subscriberCount = deviceChannelSubscribers.get(deviceChannelKey)?.size || 0;
  logger.info(`Started polling for device ${deviceId} channel ${channelId} every ${config.refreshRate}ms (${subscriberCount} subscribers)`);
}

// Stop polling for a device/channel combination
function stopPolling(deviceId, channelId) {
  const deviceChannelKey = `${deviceId}_${channelId}`;
  const intervalId = pollingIntervals.get(deviceChannelKey);
  
  if (intervalId) {
    clearInterval(intervalId);
    pollingIntervals.delete(deviceChannelKey);
    logger.info(`Stopped polling for device ${deviceId} channel ${channelId}`);
  }
}

/**
 * API Routes
 * 
 * These endpoints handle subscription management and image serving.
 * The multi-subscriber architecture ensures efficient resource usage.
 */

// Subscribe to device/channel preview images
app.post('/subscribe', jwtAuth.createAuthMiddleware(true), async (req, res) => {
  try {
    const { deviceId, channelId, clientId } = req.body;
    
    if (!deviceId || !channelId) {
      return res.status(400).json({ 
        error: 'Missing deviceId or channelId' 
      });
    }
    
    // Generate unique subscriber ID (use clientId as hint if provided)
    const subscriberId = clientId ? `${clientId}_${Date.now()}` : generateSubscriberId();
    const deviceChannelKey = `${deviceId}_${channelId}`;
    
    // Get device details from database (only if this is the first subscriber)
    let deviceInfo = deviceChannelInfo.get(deviceChannelKey);
    
    if (!deviceInfo) {
      const [rows] = await dbConnection.execute(
        'SELECT id, name, ip, username, password FROM devices WHERE id = ?',
        [deviceId]
      );
      
      if (rows.length === 0) {
        return res.status(404).json({ 
          error: 'Device not found' 
        });
      }
      
      const device = rows[0];
      deviceInfo = {
        device,
        lastFetched: null,
        subscriberCount: 0
      };
    }
    
    // Add subscriber to tracking
    subscribers.set(subscriberId, {
      deviceId,
      channelId,
      subscribedAt: new Date()
    });
    
    // Add to device/channel subscriber set
    if (!deviceChannelSubscribers.has(deviceChannelKey)) {
      deviceChannelSubscribers.set(deviceChannelKey, new Set());
    }
    deviceChannelSubscribers.get(deviceChannelKey).add(subscriberId);
    
    // Update subscriber count
    deviceInfo.subscriberCount = deviceChannelSubscribers.get(deviceChannelKey).size;
    deviceChannelInfo.set(deviceChannelKey, deviceInfo);
    
    // Start polling if this is the first subscriber
    if (deviceInfo.subscriberCount === 1) {
      startPolling(deviceId, channelId);
    }
    
    res.json({ 
      success: true, 
      message: `Subscribed to device ${deviceInfo.device.name} channel ${channelId}`,
      subscriberId,
      subscriberCount: deviceInfo.subscriberCount,
      isFirstSubscriber: deviceInfo.subscriberCount === 1
    });
    
    logger.info(`New subscription: device ${deviceId} (${deviceInfo.device.name}) channel ${channelId} - subscriber ${subscriberId} (${deviceInfo.subscriberCount} total)`);
    
  } catch (error) {
    logger.error('Subscribe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unsubscribe from device/channel preview images
app.delete('/unsubscribe', jwtAuth.createAuthMiddleware(true), async (req, res) => {
  try {
    const { subscriberId, deviceId, channelId } = req.body;
    
    // Support both subscriberId-based and deviceId/channelId-based unsubscribe
    let targetSubscriberId = subscriberId;
    let targetDeviceId = deviceId;
    let targetChannelId = channelId;
    
    if (subscriberId) {
      // Unsubscribe by subscriber ID (preferred method)
      const subscription = subscribers.get(subscriberId);
      if (!subscription) {
        return res.status(404).json({ 
          error: 'Subscriber not found' 
        });
      }
      targetDeviceId = subscription.deviceId;
      targetChannelId = subscription.channelId;
    } else if (deviceId && channelId) {
      // Legacy method: unsubscribe by device/channel (will remove all subscribers!)
      logger.warn(`Legacy unsubscribe called for device ${deviceId} channel ${channelId} - this will remove ALL subscribers`);
    } else {
      return res.status(400).json({ 
        error: 'Missing subscriberId or deviceId/channelId' 
      });
    }
    
    const deviceChannelKey = `${targetDeviceId}_${targetChannelId}`;
    const deviceInfo = deviceChannelInfo.get(deviceChannelKey);
    
    if (!deviceInfo) {
      return res.status(404).json({ 
        error: 'Device/channel subscription not found' 
      });
    }
    
    if (subscriberId) {
      // Remove specific subscriber
      subscribers.delete(targetSubscriberId);
      const subscriberSet = deviceChannelSubscribers.get(deviceChannelKey);
      if (subscriberSet) {
        subscriberSet.delete(targetSubscriberId);
        
        // Update subscriber count
        deviceInfo.subscriberCount = subscriberSet.size;
        deviceChannelInfo.set(deviceChannelKey, deviceInfo);
        
        // Stop polling only if this was the last subscriber
        if (subscriberSet.size === 0) {
          stopPolling(targetDeviceId, targetChannelId);
          deviceChannelSubscribers.delete(deviceChannelKey);
          deviceChannelInfo.delete(deviceChannelKey);
          
          // Clean up stored image
          try {
            const imagePath = path.join(config.storageDir, targetDeviceId.toString(), `channel_${targetChannelId}.${config.format}`);
            if (await fs.pathExists(imagePath)) {
              await fs.remove(imagePath);
              logger.debug(`Cleaned up image: ${imagePath}`);
            }
          } catch (cleanupError) {
            logger.warn('Failed to cleanup image:', cleanupError.message);
          }
        }
      }
      
      res.json({ 
        success: true, 
        message: `Unsubscribed from device ${targetDeviceId} channel ${targetChannelId}`,
        subscriberId: targetSubscriberId,
        remainingSubscribers: deviceInfo.subscriberCount,
        pollingStoppedFor: deviceInfo.subscriberCount === 0 ? deviceChannelKey : null
      });
      
      logger.info(`Removed subscriber ${targetSubscriberId}: device ${targetDeviceId} channel ${targetChannelId} (${deviceInfo.subscriberCount} remaining)`);
      
    } else {
      // Legacy: remove all subscribers for this device/channel
      const subscriberSet = deviceChannelSubscribers.get(deviceChannelKey);
      const removedCount = subscriberSet ? subscriberSet.size : 0;
      
      // Remove all subscribers
      if (subscriberSet) {
        for (const subId of subscriberSet) {
          subscribers.delete(subId);
        }
      }
      
      // Stop polling and cleanup
      stopPolling(targetDeviceId, targetChannelId);
      deviceChannelSubscribers.delete(deviceChannelKey);
      deviceChannelInfo.delete(deviceChannelKey);
      
      // Clean up stored image
      try {
        const imagePath = path.join(config.storageDir, targetDeviceId.toString(), `channel_${targetChannelId}.${config.format}`);
        if (await fs.pathExists(imagePath)) {
          await fs.remove(imagePath);
          logger.debug(`Cleaned up image: ${imagePath}`);
        }
      } catch (cleanupError) {
        logger.warn('Failed to cleanup image:', cleanupError.message);
      }
      
      res.json({ 
        success: true, 
        message: `Unsubscribed all subscribers from device ${targetDeviceId} channel ${targetChannelId}`,
        removedSubscribers: removedCount
      });
      
      logger.info(`Removed all ${removedCount} subscribers: device ${targetDeviceId} channel ${targetChannelId}`);
    }
    
  } catch (error) {
    logger.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get preview image
app.get('/image/:deviceId/:channelId', jwtAuth.createAuthMiddleware(true), async (req, res) => {
  try {
    const { deviceId, channelId } = req.params;
    const imagePath = path.join(config.storageDir, deviceId, `channel_${channelId}.${config.format}`);
    
    if (!(await fs.pathExists(imagePath))) {
      // Return a simple placeholder image instead of 404 to avoid timing issues
      const placeholderSvg = `<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#374151"/>
        <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="16" 
              dominant-baseline="middle" text-anchor="middle" fill="#9CA3AF">
          Loading Preview...
        </text>
        <text x="50%" y="70%" font-family="Arial, sans-serif" font-size="12" 
              dominant-baseline="middle" text-anchor="middle" fill="#6B7280">
          Device ${deviceId} • Channel ${channelId}
        </text>
      </svg>`;
      
      res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Image-Status': 'placeholder'
      });
      return res.send(placeholderSvg);
    }
    
    const stats = await fs.stat(imagePath);
    const subscriptionKey = `${deviceId}_${channelId}`;
    
    res.set({
      'Content-Type': `image/${config.format}`,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Image-Age': deviceChannelInfo.has(subscriptionKey) ? 
        Date.now() - (deviceChannelInfo.get(subscriptionKey).lastFetched?.getTime() || 0) : 'unknown'
    });
    
    const imageStream = fs.createReadStream(imagePath);
    imageStream.pipe(res);
    
  } catch (error) {
    logger.error('Image serve error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List active subscriptions (updated for multi-subscriber architecture)
app.get('/subscriptions', jwtAuth.createAuthMiddleware(false), (req, res) => {
  const deviceChannelSummary = [];
  const individualSubscribers = [];
  
  // Create summary by device/channel
  for (const [deviceChannelKey, deviceInfo] of deviceChannelInfo.entries()) {
    const [deviceId, channelId] = deviceChannelKey.split('_');
    const subscriberSet = deviceChannelSubscribers.get(deviceChannelKey);
    const subscriberList = subscriberSet ? Array.from(subscriberSet) : [];
    
    deviceChannelSummary.push({
      deviceChannelKey,
      deviceId: parseInt(deviceId),
      channelId: parseInt(channelId),
      deviceName: deviceInfo.device.name,
      deviceIp: deviceInfo.device.ip,
      subscriberCount: deviceInfo.subscriberCount,
      lastFetched: deviceInfo.lastFetched,
      isPolling: pollingIntervals.has(deviceChannelKey),
      subscribers: subscriberList
    });
  }
  
  // Create list of individual subscribers
  for (const [subscriberId, subscription] of subscribers.entries()) {
    individualSubscribers.push({
      subscriberId,
      deviceId: subscription.deviceId,
      channelId: subscription.channelId,
      subscribedAt: subscription.subscribedAt
    });
  }
  
  res.json({
    summary: {
      totalDeviceChannels: deviceChannelInfo.size,
      totalSubscribers: subscribers.size,
      activePollers: pollingIntervals.size
    },
    deviceChannels: deviceChannelSummary,
    subscribers: individualSubscribers
  });
});

// Service status endpoint (updated for multi-subscriber architecture) 
app.get('/status', jwtAuth.createAuthMiddleware(false), (req, res) => {
  const backoffStats = getBackoffStats();
  
  res.json({
    service: 'preview-image-service',
    version: '1.0.2',
    status: 'running',
    uptime: process.uptime(),
    config: {
      refreshRate: config.refreshRate,
      resolution: config.resolution,
      format: config.format,
      keepAspectRatio: config.keepAspectRatio,
      maxBackoffDelay: config.maxBackoffDelay,
      backoffMultiplier: config.backoffMultiplier
    },
    stats: {
      totalDeviceChannels: deviceChannelInfo.size,
      totalSubscribers: subscribers.size,
      activePollers: pollingIntervals.size,
      subscribersPerDeviceChannel: deviceChannelInfo.size > 0 ? 
        (subscribers.size / deviceChannelInfo.size).toFixed(2) : 0
    },
    hardwareProtection: {
      devicesInBackoff: backoffStats.devicesInBackoff,
      totalFailures: backoffStats.totalFailures,
      maxBackoffDelay: backoffStats.maxBackoffDelay,
      backoffDetails: backoffStats.backoffDetails
    },
    architecture: {
      multiSubscriber: true,
      sharedPolling: true,
      exponentialBackoff: true,
      description: 'Multiple clients can subscribe to the same device/channel with shared polling and hardware protection'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint (separate port)
healthApp.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'preview-image-service',
    timestamp: new Date().toISOString()
  });
});

/**
 * Cleanup and Shutdown Functions
 * 
 * Handles graceful shutdown of the service, including stopping all
 * polling intervals and closing database connections.
 */
function cleanup() {
  logger.info('Shutting down preview image service...');
  
  // Stop image cleanup
  stopImageCleanup();
  
  // Stop all polling intervals
  for (const [key, intervalId] of pollingIntervals) {
    clearInterval(intervalId);
    logger.debug(`Stopped polling interval: ${key}`);
  }
  pollingIntervals.clear();
  
  // Clear all data structures
  deviceChannelInfo.clear();
  subscribers.clear();
  deviceChannelSubscribers.clear();
  deviceBackoffState.clear();
  
  // Close database connection
  if (dbConnection) {
    dbConnection.end();
    logger.info('Database connection closed');
  }
  
  const stats = {
    totalDeviceChannels: deviceChannelInfo.size,
    totalSubscribers: subscribers.size,
    activePollers: pollingIntervals.size
  };
  
  logger.info('Cleanup complete', { finalStats: stats });
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Start service
async function start() {
  try {
    // Ensure storage directory exists
    await fs.ensureDir(config.storageDir);
    
    // Initialize database
    await initDatabase();
    
    // Start health check server
    healthApp.listen(config.healthPort, () => {
      logger.info(`Preview Image Service health check listening on port ${config.healthPort}`);
    });
    
    // Start main server
    app.listen(config.port, () => {
      logger.info(`Preview Image Service listening on port ${config.port}`);
      // Log safe config without sensitive database credentials
      const safeConfig = {
        ...config,
        database: {
          host: config.database.host,
          port: config.database.port,
          user: config.database.user,
          password: '***REDACTED***',
          database: config.database.database
        }
      };
      logger.info(`Configuration: ${JSON.stringify(safeConfig, null, 2)}`);
      
      // Log hardware protection settings
      logger.info(`🛡️ Hardware Protection Enabled:`, {
        baseRefreshRate: `${config.refreshRate/1000}s`,
        maxBackoffDelay: `${config.maxBackoffDelay/1000}s (${config.maxBackoffDelay/60000} minutes)`,
        backoffMultiplier: `${config.backoffMultiplier}x`,
        backoffProgression: `${config.refreshRate/1000}s → ${config.refreshRate*2/1000}s → ${config.refreshRate*4/1000}s → ${config.refreshRate*8/1000}s → ... → ${config.maxBackoffDelay/1000}s max`
      });
      
      // Start automatic image cleanup
      startImageCleanup();
    });
    
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

start();
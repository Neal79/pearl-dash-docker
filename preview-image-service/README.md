# Preview Image Service

A production-ready microservice for efficiently caching and serving preview images from Epiphan Pearl devices (Mini, Nano, Pearl 2) with hardware protection, secure JWT authentication, and automatic image management.

## 🎯 Purpose & Architecture

### Core Problem Solved
Pearl devices have limited API capacity and can be overwhelmed by frequent polling. This service implements:
- **Subscription-based polling**: Only fetches images for actively viewed device/channel combinations
- **Hardware protection**: Exponential backoff prevents device overload during failures
- **Secure authentication**: JWT tokens in Authorization headers (never in URLs)
- **Efficient caching**: Multiple users can view the same device without duplicate API calls

### Multi-Subscriber Architecture
```
Frontend Users → Subscribe to Device/Channel → Single Polling Process → Pearl Device
     ↓              ↓                           ↓                        ↓
 User A (Dev20Ch1)  User B (Dev20Ch1)      Shared Polling         Real Hardware
 User C (Dev21Ch2)  User D (Dev21Ch2)      (2 processes)         (Protected)
```

## 🚀 Features

### Hardware Protection
- **Exponential Backoff**: Failed API calls trigger progressively longer delays
- **Error Categorization**: Distinguishes between network, authentication, and device errors
- **Maximum Backoff**: Caps delays at 5 minutes to prevent indefinite delays
- **Automatic Recovery**: Successful calls immediately reset to normal polling
- **Comprehensive Logging**: Detailed failure analysis for debugging

### Security
- **JWT Authentication**: All endpoints protected with JWT tokens
- **Authorization Headers**: Secure token transmission (no URL exposure)
- **Permission Validation**: Checks user permissions for preview image access
- **Request Validation**: Input sanitization and rate limiting

### Performance
- **Shared Polling**: One API call serves multiple subscribers
- **Automatic Cleanup**: Images deleted after 3 minutes to prevent stale data
- **Image Optimization**: JPEG compression with Sharp library
- **Memory Management**: Proper cleanup on unsubscribe

### Monitoring
- **Health Endpoints**: Service status and configuration monitoring
- **Backoff Statistics**: Real-time hardware protection metrics
- **Structured Logging**: JSON logs with detailed error categorization
- **Subscription Tracking**: Active subscriber and polling statistics

## 🔧 Configuration

### Environment Variables (.env)
```env
# Core Service Configuration
PREVIEW_IMAGE_REFRESH_RATE=10                    # Backend polling interval (seconds)
PREVIEW_IMAGE_FRONTEND_REFRESH_RATE=10           # Frontend refresh rate (seconds)
PREVIEW_IMAGE_RESOLUTION=auto                    # Pearl API resolution
PREVIEW_IMAGE_FORMAT=jpg                         # Image format
PREVIEW_IMAGE_KEEP_ASPECT_RATIO=true            # Maintain aspect ratio

# Hardware Protection
PREVIEW_IMAGE_MAX_BACKOFF_DELAY=300             # Maximum backoff (seconds) 
PREVIEW_IMAGE_BACKOFF_MULTIPLIER=2              # Exponential multiplier

# Database & Authentication (inherited from main .env)
DB_HOST=db
JWT_SECRET=your_jwt_secret_here
```

### Backoff Progression Example
```
Normal: 10s → Fail → 10s → Fail → 20s → Fail → 40s → Fail → 80s → Success → 10s
```

## 🏗️ Service Architecture

### Docker Container
- **Ports**: 3449 (API), 3450 (Health)
- **Base Image**: Node.js with dependencies
- **Volume**: Persistent image storage
- **Network**: Internal Docker network communication

### API Endpoints

#### Authentication Required
- `POST /subscribe` - Subscribe to device/channel preview images
- `DELETE /unsubscribe` - Unsubscribe and stop polling
- `GET /image/:deviceId/:channelId` - Serve cached preview image

#### Optional Authentication
- `GET /subscriptions` - List active subscriptions (admin)
- `GET /status` - Service status and hardware protection metrics

#### Public
- `GET /health` - Health check (port 3450)

### Database Integration
- **Direct MySQL Connection**: Queries Laravel's devices table for credentials
- **Device Authentication**: Uses stored username/password for Pearl API calls
- **Connection Pooling**: Efficient database connection management

## 💻 Frontend Integration

### Secure Image Loading (usePreviewImage Composable)

```javascript
// Secure implementation with Authorization headers
const { 
  imageUrl,           // Secure blob URL (blob://...)  
  isSubscribed,       // Subscription status
  isFetchingImage,    // Loading state
  error              // Error state
} = usePreviewImage(deviceId, channelId)

// Usage in Vue component
<template>
  <img 
    v-if="imageUrl" 
    :src="imageUrl" 
    alt="Device Preview"
    class="preview-image" 
  />
  <div v-else-if="isFetchingImage">Loading...</div>
  <div v-else-if="error">{{ error }}</div>
</template>
```

### Security Architecture
```
Browser → fetch() with Authorization header → Preview Service
   ↓                                              ↓
Blob URL (safe)  ←  Image Response  ←  JWT Validation
   ↓
<img src="blob://...">  (No JWT exposure)
```

### Key Features
- **Automatic Subscription**: Subscribes on mount, unsubscribes on unmount
- **Token Retry**: Handles JWT token availability timing on page refresh
- **Blob Management**: Automatic cleanup prevents memory leaks
- **Error Handling**: Graceful degradation with detailed error states

## 🔍 Monitoring & Debugging

### Service Status Endpoint
```bash
curl https://yourdomain.com/img-cache/status
```

```json
{
  "service": "preview-image-service",
  "version": "1.0.2",
  "status": "running",
  "stats": {
    "totalDeviceChannels": 3,
    "totalSubscribers": 5,
    "activePollers": 3
  },
  "hardwareProtection": {
    "devicesInBackoff": 1,
    "totalFailures": 4,
    "maxBackoffDelay": 80000,
    "backoffDetails": [
      {
        "deviceChannel": "20_1",
        "failures": 2,
        "backoffDelay": 40000,
        "lastFailure": "2025-01-08T15:30:25.123Z"
      }
    ]
  }
}
```

### Log Analysis

#### Device Failures
```
🚨 DEVICE FAILURE [20_1] - CONNECTION_REFUSED {
  device: "20",
  channel: "1",
  failureCount: 2,
  errorType: "CONNECTION_REFUSED",
  severity: "HIGH",
  likelyHardwareIssue: true,
  backoffDelay: "20s",
  nextAttempt: "2025-01-08T15:30:45.123Z"
}
```

#### Device Recovery
```
✅ DEVICE RECOVERED [20_1] - Back to normal operation {
  device: "20", 
  previousFailures: 3,
  downDuration: "127s",
  wasInBackoff: true
}
```

#### Health Alerts
```
🔥 DEVICE HEALTH ALERT: Device 20 channel 1 has failed 3 consecutive times.
⚠️ MAXIMUM BACKOFF REACHED: Device 20 channel 1 is now at maximum backoff delay.
🎉 DEVICE HEALTH RESTORED: Device 20 channel 1 has recovered after 4 failures.
```

## 🚨 Hardware Protection Details

### Error Categories

#### High Severity (Hardware/Network Issues)
- `CONNECTION_REFUSED` - Device offline or unreachable
- `TIMEOUT` - Device not responding (overloaded/slow network)
- `DNS_RESOLUTION_FAILED` - IP address changed or DNS issue
- `DEVICE_INTERNAL_ERROR` - Device returning 500 errors

#### Medium Severity (Configuration Issues)  
- `AUTHENTICATION_FAILED` - Wrong username/password in database
- `ENDPOINT_NOT_FOUND` - Invalid channel or API path
- `CLIENT_ERROR` - API request format issues

### Backoff Algorithm
```javascript
// Exponential backoff calculation
const backoffDelay = Math.min(
  baseRefreshRate * Math.pow(multiplier, failureCount - 1),
  maxBackoffDelay
)

// Example with defaults: 10s, 20s, 40s, 80s, 160s, 300s (max)
```

### Protection Goals
1. **Prevent API Flooding**: Stop hammering failing devices
2. **Preserve Device Health**: Avoid overloading hardware encoders
3. **Enable Recovery**: Allow devices to recover without interference
4. **Maintain Service**: Continue serving other healthy devices

## 🔒 Security Considerations

### JWT Token Security
- **Authorization Headers**: Tokens never appear in URLs or logs
- **Token Validation**: Proper JWT verification with signature checking
- **Permission Checks**: User-level permissions for preview image access
- **Token Expiration**: Automatic token refresh handling

### Image Security
- **Blob URLs**: Generated URLs contain no sensitive information
- **Memory Management**: Automatic cleanup prevents information leakage
- **Access Control**: Images only served to authenticated users
- **CORS Protection**: Proper cross-origin request handling

### Database Security
- **Credential Protection**: Database passwords redacted in logs
- **SQL Injection**: Parameterized queries prevent injection attacks
- **Connection Security**: Secure database connection configuration

## 🛠️ Troubleshooting

### Common Issues

#### "Images not loading"
1. Check JWT token availability: Look for "No JWT token available" in console
2. Verify service health: `curl /img-cache/status`
3. Check device connectivity: Look for backoff alerts in logs

#### "Device in backoff"
1. Check service status for backoff details
2. Verify device IP address and credentials in database
3. Check network connectivity to Pearl device
4. Wait for automatic recovery or restart device

#### "Service unavailable"  
1. Verify Docker container is running
2. Check database connection
3. Verify JWT_SECRET environment variable
4. Check port accessibility (3449, 3450)

### Performance Optimization
- **Subscription Management**: Only subscribe to actively viewed channels
- **Image Cleanup**: Automatic cleanup prevents disk space issues
- **Database Queries**: Efficient device credential caching
- **Memory Usage**: Proper blob URL lifecycle management

## 🚀 Production Deployment

### Docker Configuration
```yaml
# docker-compose.yml
preview-image-service:
  build: ./preview-image-service
  ports:
    - "3449:3449"  # API
    - "3450:3450"  # Health
  environment:
    - NODE_ENV=production
  env_file:
    - .env
  volumes:
    - preview_images:/app/storage/images
  depends_on:
    db:
      condition: service_healthy
```

### Nginx Proxy Configuration
```nginx
# Route to preview service
location /img-cache/ {
    proxy_pass http://preview-image-service:3449/;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Health Monitoring
- **Service Health**: `GET /health` on port 3450
- **Application Status**: `GET /status` with authentication
- **Log Monitoring**: Structured JSON logs for analysis
- **Metrics Collection**: Backoff statistics for device health monitoring

## 📈 Scaling Considerations

### Current Architecture
- **Single Instance**: Suitable for small-medium deployments (1-50 devices)
- **Shared State**: In-memory subscription and backoff management
- **File Storage**: Local volume for cached images

### Future Scaling Options
- **Redis Integration**: Distributed state management for multiple instances  
- **Database Caching**: Store backoff state for persistence across restarts
- **Load Balancing**: Multiple service instances with sticky sessions
- **CDN Integration**: External image caching for global distribution

---

## 🔄 Version History

### v1.0.2 (Current)
- ✅ Hardware protection with exponential backoff
- ✅ Secure JWT authentication with Authorization headers
- ✅ Comprehensive failure logging and categorization
- ✅ Configurable refresh rates via environment variables
- ✅ Automatic blob URL management
- ✅ Multi-subscriber architecture with shared polling

### v1.0.1
- ✅ Basic preview image caching
- ✅ Subscription-based polling
- ✅ JWT authentication (URL parameters)
- ✅ Docker containerization

### v1.0.0
- ✅ Initial implementation
- ✅ Direct Pearl device API integration
- ✅ Basic image serving
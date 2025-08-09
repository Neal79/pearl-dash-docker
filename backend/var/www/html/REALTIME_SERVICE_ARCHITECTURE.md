# Real-time WebSocket Service - Architecture Documentation

## Service Overview
The Real-time WebSocket Service provides enterprise-grade WebSocket broadcasting for the Pearl Dashboard system, enabling real-time streaming control and device monitoring.

## Critical Architecture Decision: Cache-Free Design

### The Deduplication Problem
The service originally implemented MD5-based event deduplication with a 1-minute cache expiry. This caused cyclical "works then breaks" behavior:

1. **Minute 1**: Cache empty → all events broadcast → works correctly
2. **Minute 2**: Cache expires → duplicates resume → cyclical behavior
3. **Root Cause**: Backend API returning conflicting events with different timestamps

### The Solution
**Moved deduplication to Laravel backend** (`RealtimeEventStore::getRecentEvents()`) and made this service **completely stateless and cache-free**.

```javascript
// DISABLED: Frontend deduplication (anti-pattern)
// Real-time systems should ALWAYS broadcast current state
// const eventHash = `${subscriptionKey}:${changeHash}`;
// if (this.eventDeduplication.has(eventHash)) { ... }

// ALWAYS broadcast immediately - no cache, no deduplication
this.broadcastToSubscribers(subscriptionKey, message);
```

## Performance Optimizations

### 1. Concurrent Request Prevention
```javascript
this.isPolling = false; // Prevent overlapping requests
if (this.isPolling) {
  console.log('Skipping poll - previous request still in progress');
  return;
}
```

### 2. Adaptive Polling with Backoff
```javascript
// Base timeout: 5s + (consecutive_errors × 2s), capped at 15s
const timeout = Math.min(this.baseTimeout + (this.consecutiveErrors * 2000), 15000);
```

### 3. Reduced Logging Overhead
- Removed verbose per-event logging that caused I/O bottlenecks
- Kept only summary logging and error reporting
- 90% reduction in console operations

### 4. Enhanced Memory Management
- Dynamic event queue TTL based on queue size
- Automatic removal of empty event queues
- Aggressive cleanup to prevent memory accumulation

## Data Flow Architecture

```
Laravel Backend → /api/internal/realtime/events → WebSocket Service → Frontend Clients
      ↓                        ↓                        ↓                    ↓
 Device Polling          Event Deduplication      Live Broadcasting    Real-time UI
```

### Key Design Principles

1. **Backend-First Deduplication**: Data quality maintained at source
2. **Stateless Transport**: WebSocket service has zero persistent cache
3. **Live Data Only**: No cached responses, always current state
4. **Subscription-Based**: Only send data to interested clients

## WebSocket Message Format

### Client Messages
```javascript
// Subscribe to publisher status
{
  type: 'subscribe',
  dataType: 'publisher_status',
  device: '192.168.43.20',
  channel: 1,
  publisherId: 'rtmp'
}

// Unsubscribe
{
  type: 'unsubscribe',
  dataType: 'publisher_status',
  device: '192.168.43.20',
  channel: 1,
  publisherId: 'rtmp'
}
```

### Server Messages
```javascript
// Live data update
{
  type: 'data_update',
  subscriptionKey: 'publisher_status:192.168.43.20:1:rtmp',
  dataType: 'publisher_status',
  device: '192.168.43.20',
  channel: 1,
  publisherId: 'rtmp',
  data: {
    device_id: 1,
    channel_id: 1,
    publishers: [...]
  },
  timestamp: '2025-08-05T10:30:00.000Z',
  cached: false
}
```

## Security Features

### JWT Authentication
```javascript
// Token validation with role-based permissions
const decoded = jwt.verify(token, this.jwtSecret);
if (!decoded.userId || !decoded.email) {
  throw new Error('Invalid token payload');
}
```

### Connection Limits
```javascript
const MAX_CONNECTIONS_PER_IP = 25;      // DoS protection
const MAX_SUBSCRIPTIONS_PER_CLIENT = 50; // Resource limits
const MAX_EVENT_QUEUE_SIZE = 100;        // Memory protection
```

### Message Validation
```javascript
// Validate IPv4 addresses
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
```

## Debugging History

### Issue Timeline
1. **Console Spam**: Recursive Vue watch() functions → Removed obsolete polling
2. **Connection Failures**: `watch({ immediate: false })` → Changed to `immediate: true`
3. **Data Cycling**: Backend conflicts → Fixed `RealtimeEventStore` deduplication
4. **Stale Data**: Service caching → Implemented cache-free architecture

### Debugging Commands
```bash
# Service status
systemctl status pearl-polling

# Real-time logs
journalctl -f -u pearl-polling

# WebSocket testing
node test-websocket.js

# Backend event inspection
curl https://localhost/api/internal/realtime/events
```

## Environment Configuration

```bash
# WebSocket service
REALTIME_MAX_CONNECTIONS_PER_IP=25
REALTIME_MAX_SUBSCRIPTIONS=50
REALTIME_QUEUE_TTL=30000
REALTIME_CLEANUP_INTERVAL=60000
REALTIME_BACKEND_POLL=5000

# Backend integration
REALTIME_BACKEND_ENDPOINT=https://localhost/api/internal/realtime/events
APP_URL=https://localhost
```

## Performance Monitoring

### Health Endpoints
- **WebSocket Status**: `http://localhost:3447/status`
- **Health Check**: `http://localhost:3447/health`

### Key Metrics
```javascript
{
  clients: 5,
  subscriptions: {
    'publisher_status:192.168.43.20:1': 2,
    'device_health:192.168.43.20': 1
  },
  uptime: '2 hours 15 minutes',
  memory: '45.2 MB',
  averageResponseTime: '85ms'
}
```

### Success Indicators
- **Consistent Response Times**: `Processed X events (XXXms)` logs
- **No Stale Data**: `cached: false` in all data updates
- **Clean Connections**: No WebSocket readyState 3 (CLOSED) errors
- **Memory Stability**: No memory growth over time

### Warning Signs
- **Frequent Skipping**: `Skipping poll - previous request still in progress`
- **Increasing Response Times**: Backend API slowdown
- **Connection Drops**: Network or authentication issues
- **Memory Growth**: Event queue or connection leaks

## Integration Points

### Frontend (Vue.js)
```typescript
// useRealTimeData.ts
watch(() => activeSubscriptions.value, (subscriptions) => {
  // Handle subscription changes
}, { immediate: true }); // CRITICAL: immediate: true required
```

### Backend (Laravel)
```php
// RealtimeEventStore.php
public function getRecentEvents(): array {
  // Return only LATEST event per device/channel/type
  // No conflicting timestamps allowed
}
```

### Nginx Proxy
```nginx
location /ws/realtime {
  proxy_pass http://localhost:3446;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

## Maintenance Notes

### DO NOT Re-enable Deduplication
The commented-out deduplication code was **intentionally disabled**. If issues resurface:
1. Check backend data quality first
2. Verify `RealtimeEventStore` deduplication logic
3. Monitor for conflicting timestamps in API responses
4. Test with manual trigger endpoints

### Code Backup
- **Original Implementation**: `realtime-data-service.js.backup`
- **Testing Tools**: `test-websocket.js`, `test-websocket-flow.js`
- **Manual Triggers**: `http://localhost:3448/trigger-poll`

### Future Considerations
1. **WebSocket Compression**: For large payloads
2. **Connection Pooling**: For backend HTTP requests
3. **Rate Limiting**: Per-client subscription limits
4. **Metrics Export**: Prometheus/Grafana integration

---
*Last Updated: August 5, 2025*
*Version: 2.0.0 - Cache-Free Architecture*

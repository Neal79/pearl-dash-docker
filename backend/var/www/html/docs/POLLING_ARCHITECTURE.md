# Pearl Dashboard Real-Time Polling Architecture

## Overview

The Pearl Dashboard implements a **dual-tier polling system** designed to provide real-time updates for 20-30 concurrent users while maintaining optimal performance. The system bridges Pearl Mini devices (hardware) with a Laravel backend and Vue.js frontend to deliver sub-10-second response times for streaming control.

## System Architecture

```
Pearl Mini Device (RTSP/HTTP API) ←→ Laravel Backend (Cache) ←→ Vue.js Frontend (UI)
     [5-second polling]                    [1-2 second polling]
```

### Core Design Principles

1. **Never Poll Devices Directly from Frontend** - Always use server cache
2. **Real-Time Control** - Sub-10-second response times for streaming control
3. **Fresh Data Always** - Backend continuously syncs with real devices
4. **Scalable** - Server cache handles 20-30 concurrent users efficiently
5. **Adaptive Polling** - Different intervals based on user actions and device state

## Backend Polling System

### 1. Core Components

#### `PearlDevicePoller` Service (`app/Services/PearlDevicePoller.php`)
- **Purpose**: Core polling engine that fetches data from Pearl devices
- **Responsibilities**:
  - HTTP API communication with Pearl Mini devices
  - Database caching of device states and publisher information
  - Publisher name synchronization (always fresh from device)
  - Error handling and exponential backoff

#### `PollDevicesJob` (`app/Jobs/PollDevicesJob.php`)
- **Purpose**: Self-scheduling background job for continuous polling
- **Frequency**: Every 5 seconds (ultra-fast for real-time control)
- **Features**:
  - Self-scheduling (dispatches next job automatically)
  - Error recovery with automatic restart
  - Comprehensive logging

#### `PollDevicesCommand` (`app/Console/Commands/PollDevicesCommand.php`)
- **Purpose**: CLI interface for polling management
- **Commands**:
  - `php artisan devices:poll` - Start continuous polling
  - `php artisan devices:poll --once` - Single polling cycle
  - `php artisan devices:poll --status` - Health check
  - `php artisan devices:poll --device=ID` - Poll specific device

### 2. Database Schema

```sql
-- Core device information
devices: id, ip, name, username, password, created_at, updated_at

-- Cached device state from Pearl API
device_states: device_id, channels_data (JSON), status, last_seen, error_count, 
              error_message, polling_enabled, next_poll_at

-- Individual publisher status cache
publisher_states: device_id, channel_id, publisher_id, name, type, 
                 is_configured, started, state, last_updated
```

### 3. Polling Intervals

```php
// Backend polling constants (app/Services/PearlDevicePoller.php)
CHANNEL_POLL_INTERVAL = 5 seconds     // Device channel discovery
PUBLISHER_POLL_INTERVAL = 3 seconds   // Publisher status updates
REQUEST_TIMEOUT = 10 seconds          // HTTP timeout for device calls
```

### 4. Key Features

#### Always Fresh Publisher Names
```php
// Always fetch fresh publisher name from device (never cached)
$name = $this->fetchPublisherName($device, $channelId, $publisherId);
$publisherData['name'] = $name;
```

#### Error Handling & Recovery
- Exponential backoff on device communication failures
- Automatic job restart on failures
- Health monitoring with status endpoint

## Frontend Polling System

### 1. Core Components

#### `useDeviceChannels` Composable (`resources/js/composables/useDeviceChannels.ts`)
- **Purpose**: Channel discovery and status monitoring
- **Polling Interval**: 2 seconds (server cache)
- **Features**:
  - Adaptive polling for new devices (1-second burst)
  - Auto-switch to normal polling after device initialization
  - Error handling with graceful degradation

#### `usePublisherControl` Composable (`resources/js/composables/usePublisherControl.ts`)
- **Purpose**: Publisher status and streaming control
- **Polling Interval**: 1 second (ultra-fast for control responsiveness)
- **Special Features**:
  - **Boost Mode**: 0.5-second polling for 15 seconds after control actions
  - Immediate status fetch after start/stop commands
  - Parallel publisher name enrichment

#### `useApiAuth` Composable (`resources/js/composables/useApiAuth.ts`)
- **Purpose**: Session-based API authentication with CSRF handling
- **Features**:
  - Automatic CSRF token initialization
  - Retry logic for 419 token mismatches
  - Session cookie management

### 2. Polling Intervals

```typescript
// Frontend polling intervals
Channel Discovery: 2 seconds (normal), 1 second (new devices for 30s)
Publisher Status: 1 second (normal), 0.5 seconds (boost mode after controls)
Image Preview: 5 seconds
Audio Meters: Real-time WebSocket (separate system)
```

### 3. Adaptive Polling Strategy

#### New Device Initialization
```typescript
// Ultra-aggressive polling for immediate UX
if (!hasChannels.value) {
  startChannelPolling(1000) // 1-second burst
  setTimeout(() => {
    startChannelPolling(2000) // Switch to normal after 30s
  }, 30000)
}
```

#### Control Action Boost
```typescript
// Super-fast feedback after start/stop clicks
boostInterval = setInterval(fetchPublisherStatus, 500) // 0.5s polling
setTimeout(() => {
  clearInterval(boostInterval)
  startPolling() // Back to normal 1s polling
}, 15000) // Boost for 15 seconds
```

## API Endpoints

### Device State API (`/api/device-state/`)
```
GET /devices/{device}/channels                    - Channel list with publishers
GET /devices/{device}/channels/{channel}/publishers/status - Publisher status
POST /devices/{device}/channels/{channel}/publishers/control - Start/stop streaming
GET /devices/{device}/channels/{channel}/publishers/{id}/name - Publisher name
POST /devices/{device}/force-poll                - Manual refresh
GET /health                                       - System health check
```

### Authentication
- **Type**: Laravel Sanctum SPA authentication
- **Session-based**: Uses web session cookies
- **CSRF Protection**: Handled automatically by Sanctum middleware

## Performance Characteristics

### Response Time Analysis
```
Worst Case Total Latency:
├── Backend polls device: 5 seconds max
├── Frontend polls server: 1 second max  
└── Total: 6 seconds maximum ✅

Best Case (Control Actions):
├── Immediate fetch + boost polling
└── Total: 1-3 seconds ⚡
```

### Concurrent User Support
- **Target**: 20-30 simultaneous users
- **Backend Load**: 1 device poll every 5 seconds (minimal)
- **Frontend Load**: Distributed across users hitting server cache
- **Server Cache**: Responds in milliseconds

### Resource Usage
```
Database Queries per Cycle:
├── Device polling: ~5 queries per device per 5s
├── Frontend requests: Cache hits only
└── Network: Minimal device HTTP calls

HTTP Requests:
├── Backend → Device: Every 5 seconds per device
├── Frontend → Server: Every 1-2 seconds per user
└── Total: Scales linearly with users, not devices
```

## Monitoring & Debugging

### Health Monitoring
```bash
# Check polling status
php artisan devices:poll --status

# Monitor queue jobs
php artisan queue:monitor

# View polling logs
tail -f storage/logs/laravel-*.log | grep PearlDevicePoller
```

### Key Metrics to Monitor
- Device last_seen timestamps (should be < 10 seconds old)
- Queue job processing times
- Publisher state update frequency
- HTTP timeout rates to devices

### Debug Console Logs
```javascript
// Frontend debugging (development only)
console.log('🔄 Started real-time polling backend cache for device X every Yms')
console.log('📡 Publisher status response:', response)
console.log('✅ Session authentication initialized')
```

## Adding New Features

### New Device Types
1. Extend `PearlDevicePoller::fetchDeviceData()` for new endpoints
2. Add database migration for new fields in `device_states.channels_data`
3. Update frontend interfaces in composables

### New Real-Time Data
1. Add new database table following `PublisherState` pattern
2. Implement polling logic in `PearlDevicePoller`
3. Create frontend composable following `usePublisherControl` pattern
4. Use same 1-2 second polling intervals for responsiveness

### WebSocket Migration (Future)
- Replace HTTP polling with WebSocket connections for sub-second updates
- Keep database caching for reliability
- Maintain polling as fallback mechanism

## Troubleshooting

### Common Issues

#### Slow Updates (>10 seconds)
1. Check queue worker is running: `php artisan queue:work`
2. Verify device connectivity to Pearl Mini
3. Monitor database query performance
4. Check for HTTP timeout errors in logs

#### 419 CSRF Errors
1. Verify Sanctum middleware configuration
2. Check session authentication initialization
3. Ensure frontend uses `useApiAuth` composable

#### Stale Data
1. Confirm backend polling is active: `php artisan devices:poll --status`
2. Check device last_seen timestamps
3. Verify publisher name fetching is working

### Emergency Recovery
```bash
# Restart polling system
php artisan devices:poll --once
php artisan devices:poll

# Clear stale data
php artisan devices:poll --init

# Check system health
php artisan devices:poll --status
```

## Security Considerations

- **Device Credentials**: Stored encrypted in database
- **API Authentication**: Session-based with CSRF protection
- **Rate Limiting**: Implemented via queue system natural throttling
- **Input Validation**: All device data sanitized before database storage

## Future Improvements

1. **WebSocket Integration**: Replace polling with real-time connections
2. **Circuit Breaker Pattern**: Intelligent device failure handling
3. **Connection Pooling**: Optimize HTTP connections to devices
4. **Predictive Polling**: ML-based adaptive polling intervals
5. **Multi-Region Support**: Distributed polling architecture
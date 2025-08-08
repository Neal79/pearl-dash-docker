# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pearl Dash is a **containerized Laravel + Vue.js application** for managing and monitoring Pearl Mini devices with real-time audio and video streaming capabilities. The system runs in **Docker containers** with a microservices architecture consisting of a PHP/Laravel backend, Vue.js frontend with Inertia.js, and separate Node.js services for RTSP audio streaming and real-time WebSocket data.

## 🚨 CRITICAL DOCKER ARCHITECTURE INFORMATION

### Docker Containerized Stack
- **Database**: MySQL 8 container (`db`)
- **Web Server**: Nginx container with SSL (`nginx`)
- **Laravel Application**: PHP 8.2+ with Laravel 12 (`app`)
- **Audio Meter Service**: Node.js WebSocket service (`audio-meter`)
- **Real-time Data Service**: Node.js WebSocket service (`realtime-service`)
- **Polling Service**: Pearl device polling service (`polling-service`)
- **Workspace**: Laravel CLI container (`workspace`)

### Network Architecture
- **Docker Network**: `pearlnet` (172.20.0.0/16)
- **Service Communication**: Container-to-container networking
- **External Ports**: 
  - 80, 443 (nginx), 3444-3448 (services), 3306 (mysql)

### Laravel Version & Architecture
- **Laravel Version**: Laravel 12 (NOT Laravel 11 or earlier versions)
- **Frontend**: Vue.js 3 with TypeScript + Vue Starter Kit (NOT standard Laravel/Vue setup)
- **Routing**: Uses Laravel 12's routing structure with Inertia.js SPA approach (NOT Vue Router)
- **Service Providers**: Registered in `bootstrap/providers.php` (NOT config/app.php)
- **Configuration**: Modern Laravel 12 patterns throughout

### Key Architecture Differences from Standard Laravel
1. **Service Registration**: Use `bootstrap/providers.php`, NOT `config/app.php`
2. **Routes**: Standard Laravel 12 routing in `routes/web.php` and `routes/api.php`
3. **Frontend**: Vue 3 + Inertia.js SPA with TypeScript, NOT Blade templates
4. **Authentication**: Hybrid system (Laravel Breeze + JWT + Sanctum for APIs)
5. **Real-time**: Custom WebSocket services + Laravel events (NOT Laravel Broadcasting)
6. **Deployment**: Docker containers (NOT LEMP stack)

## Development Commands

### Docker Container Management
- `make help` - Show all available commands
- `make setup` - Initial setup: build, start services, and migrate
- `make up` - Start all services
- `make down` - Stop all services
- `make restart` - Restart all services
- `make build` - Build all Docker containers
- `make logs` - Show logs for all services
- `make logs-app` - Show logs for Laravel app
- `make clean` - Remove all containers, volumes and images

### Laravel Development (via Docker)
- `make shell` - Access Laravel app container shell
- `make artisan cmd="command"` - Run artisan command
- `make migrate` - Run database migrations
- `make migrate-fresh` - Fresh migration with seeding
- `make seed` - Run database seeders
- `make test` - Run PHPUnit tests with Pest framework
- `make composer` - Run composer install
- `make cache-clear` - Clear all Laravel caches
- `make optimize` - Optimize Laravel application

### Workspace Container (Development CLI)
- `make workspace` - Access workspace container shell
- `make workspace-up` - Start workspace container
- `make workspace-artisan cmd="command"` - Run artisan in workspace
- `make workspace-composer cmd="install"` - Run composer in workspace
- `make workspace-npm cmd="install"` - Run npm in workspace
- `make workspace-tinker` - Start Laravel Tinker

### Database Access
- `make shell-db` - Access MySQL database shell

## Architecture Overview

### Backend (Laravel 12 Container)
- **Framework**: Laravel 12 with PHP 8.2+
- **Container**: `app` with Nginx, PHP-FPM, and Supervisor
- **Database**: MySQL 8 container with health checks
- **Authentication**: Laravel Breeze with Inertia.js integration + JWT for API access
- **API**: RESTful endpoints for device management + real-time WebSocket integration
- **Key Models**: `Device` (Epiphan Pearl Mini, Nano or Pearl 2), `User`, `DeviceState`, `PublisherState`
- **Session Management**: File-based sessions with unique user IDs for preferences
- **Real-time System**: Custom event-driven architecture with WebSocket integration

### Frontend (Vue.js 3 + Inertia.js)
- **Framework**: Vue 3 with TypeScript and Composition API
- **UI Library**: Reka UI components with Tailwind CSS v4
- **Routing**: Inertia.js for SPA-like experience with Laravel (NOT Vue Router)
- **Build Tool**: Vite with Laravel integration
- **Icons**: Lucide Vue Next
- **State Management**: VueUse composables for reactive state + custom composables
- **Real-time**: Custom WebSocket composables with automatic HTTP fallback

### Microservices (Node.js Containers)

#### Audio Meter Service (`audio-meter` container)
- **Port**: 3444 (WebSocket), 3445 (Health/Status)
- **Function**: Real-time audio meters AND streaming from Pearl devices
- **Technology**: WebSocket server with FFmpeg subprocess management
- **Dual-Output**: Single FFmpeg stream provides both meter data and audio streaming
- **Authentication**: JWT-based auth system

#### Real-time Data Service (`realtime-service` container)
- **Port**: 3446 (WebSocket), 3447 (Health/Status)
- **Function**: WebSocket server for real-time dashboard updates
- **Technology**: Node.js WebSocket server with Laravel integration
- **Authentication**: JWT-based auth system

#### Polling Service (`polling-service` container)
- **Port**: 3448 (Health/Status)
- **Function**: Polls Pearl devices and updates database
- **Technology**: Node.js service with periodic HTTP requests
- **Integration**: Direct database updates via MySQL connection

### Container Communication
- **Internal Network**: `pearlnet` Docker network
- **Service Discovery**: Container names as hostnames
- **Health Checks**: MySQL container health checks with retries
- **Dependencies**: Proper container startup ordering

## Key Components and Patterns

### Device Management
- Devices are stored with IP, name, username/password for Pearl API authentication
- API endpoints: `GET /api/devices`, `POST /api/devices`, `DELETE /api/devices/{id}`
- Preview images: `GET /api/devices/{device}/channels/{channel}/preview`

### Audio Streaming + Metering Architecture
1. **Dual-Output WebSocket Service**: Single FFmpeg process provides both real-time meters AND audio streaming
2. **Synchronized Streams**: Audio meters and streaming use identical PCM data from same source
3. **Subscription Model**: Separate subscriptions for meter data (`subscribe`) and audio streaming (`subscribe_audio`)
4. **Efficient Resource Usage**: One FFmpeg process per device:channel serves multiple subscribers  
5. **WebSocket Protocol**: Real-time data delivery via WebSocket with JWT authentication
6. **Browser Audio**: Web Audio API integration with PCM-to-AudioBuffer conversion

### Frontend Architecture
- **Layouts**: Modular layout system (`AuthLayout`, `AppLayout`, `AppSidebarLayout`)
- **Components**: Reusable UI components in `resources/js/components/`
- **Pages**: Inertia.js pages in `resources/js/pages/`
- **Composables**: Reactive utilities (`useAppearance`, `useAudioMeterWebSocket`, `useAudioStreaming`)

### Authentication & Sessions

Pearl Dashboard implements a **hybrid authentication system** that combines web session authentication with JWT tokens for WebSocket connections:

#### **🔐 Authentication Architecture Overview**

```
Web Browser (Session Auth) 
    ↓ Session Cookies
Laravel Backend (Web Routes)
    ↓ Generate JWT for WebSocket
WebSocket Services (JWT Auth)
    ↓ Real-time Data
Frontend Components
```

#### **🎯 Authentication Layers**

1. **Web Session Authentication** (Primary)
   - Uses Laravel Breeze for user login/registration
   - Session-based authentication for web routes and API endpoints
   - CSRF token protection for state-changing operations
   - Handles user preferences and dashboard access

2. **JWT Token Authentication** (WebSocket Only)
   - JWT tokens generated from web sessions for WebSocket authentication
   - Tokens obtained from `/api/websocket-token` endpoint using session cookies
   - Used exclusively for real-time WebSocket connections
   - Auto-refresh mechanism for token expiration

#### **🔧 Frontend Composables**

**For HTTP API Requests:**
```typescript
import { useApiAuth } from './useApiAuth'
const apiAuth = useApiAuth()
await apiAuth.get('/api/some-endpoint') // Uses CSRF + session cookies
```

**For WebSocket Connections:**
```javascript
import { useAuth } from './useAuth.js'
const auth = useAuth()
const token = await auth.getValidToken() // Gets JWT for WebSocket
```

#### **🚀 WebSocket Authentication Flow**

1. **Token Request**: Frontend calls `/api/websocket-token` with session cookies
2. **JWT Generation**: Laravel creates JWT token for authenticated user
3. **WebSocket Connection**: Token passed as query parameter: `wss://domain/ws/service?token=jwt_token`
4. **Service Validation**: WebSocket service validates JWT and establishes connection
5. **Auto-Refresh**: Frontend automatically refreshes expiring tokens

#### **⚠️ Critical Implementation Notes**

**DO NOT MIX AUTH COMPOSABLES:**
- ❌ `useApiAuth` for WebSocket connections (no JWT support)
- ❌ `useAuth` for HTTP API requests (designed for WebSocket tokens)
- ✅ `useApiAuth` for HTTP requests (CSRF + sessions)
- ✅ `useAuth` for WebSocket connections (JWT tokens)

**Graceful Degradation Pattern:**
```javascript
const token = await auth.getValidToken()
if (!token) {
  console.log('User not authenticated - WebSocket will not connect')
  return // Exit gracefully, don't throw errors
}
```

**Error Handling Pattern:**
```javascript
ws.onclose = (event) => {
  if (event.code === 1008) { // Policy Violation = Auth failure
    console.warn('Authentication failed')
    auth.handleAuthError(new Error('WebSocket auth failed'))
    return // Don't auto-reconnect on auth failures
  }
  // Handle other disconnection reasons...
}
```

#### **🔍 Service Authentication Details**

**Audio Meter Service** (container: `audio-meter`):
- Internal: `ws://audio-meter:3444`
- External: `wss://domain/ws/audio-meter?token=jwt_token`
- Uses `useAuth` composable
- Graceful fallback if not authenticated

**Real-time Data Service** (container: `realtime-service`):
- Internal: `ws://realtime-service:3446`
- External: `wss://domain/ws/realtime?token=jwt_token`  
- Uses `useAuth` composable
- Graceful fallback if not authenticated

#### **🛡️ Security Features**

- **CSRF Protection**: All HTTP requests include CSRF tokens
- **JWT Expiration**: WebSocket tokens auto-refresh before expiry
- **Session Validation**: JWT tokens generated only for authenticated web sessions
- **Connection Limits**: Rate limiting and connection limits per IP
- **Graceful Failures**: Services degrade gracefully without authentication
- **Docker Network Security**: Internal service communication on isolated network

#### **📋 Middleware Stack**
- `EnsureUserSession`: Creates session for anonymous users
- `HandleInertiaRequests`: Manages Inertia.js SPA requests
- `HandleAppearance`: Manages theme preferences
- `auth:web`: Protects authenticated web routes
- JWT validation in WebSocket services

## Testing

- **Framework**: Pest PHP testing framework
- **Structure**: Feature tests in `tests/Feature/`, Unit tests in `tests/Unit/`
- **Coverage**: Authentication, device management, settings
- **Command**: `make test` (runs tests in app container)

## Database

- **Container**: `db` (MySQL 8)
- **Development & Production**: MySQL/MariaDB with Docker volumes
- **Migrations**: Device table with auth fields, standard Laravel auth tables
- **Factories**: `UserFactory` for test data generation
- **Access**: `make shell-db` for direct database access

## Build and Deployment

### Development Setup
1. **Environment**: Copy and configure `.env` file
2. **Initial Setup**: `make setup` (builds containers, starts services, migrates database)
3. **Start Services**: `make up`
4. **Stop Services**: `make down`

### Container Management
1. **Build**: `make build` - Build all containers
2. **Logs**: `make logs` - Monitor all service logs
3. **Shell Access**: `make shell` - Access Laravel app container
4. **Database**: `make shell-db` - Access MySQL database

### Development Workflow
1. **Code Changes**: Edit files in `backend/var/www/html/`
2. **Migrations**: `make migrate` or `make workspace-artisan cmd="migrate"`
3. **Composer**: `make workspace-composer cmd="install"`
4. **NPM**: `make workspace-npm cmd="install"`
5. **Artisan Commands**: `make artisan cmd="command"`

## Important Files

- **Docker Configuration**: `docker-compose.yml`, `Makefile`, `.env`
- **Entry Points**: `backend/var/www/html/resources/js/app.ts`, `backend/var/www/html/resources/css/app.css`
- **Laravel Configuration**: `backend/var/www/html/vite.config.ts`, `backend/var/www/html/composer.json`
- **Routing**: `backend/var/www/html/routes/web.php`, `backend/var/www/html/routes/api.php`
- **Models**: `backend/var/www/html/app/Models/Device.php`, `backend/var/www/html/app/Models/User.php`
- **Controllers**: `backend/var/www/html/app/Http/Controllers/Api/DeviceController.php`

## Container Service Details

### Audio Meter Service Container
- **Location**: `media-proxy/audio-meter-service.js`
- **SSL**: Not required (internal Docker communication)
- **Process Limits**: 150 concurrent FFmpeg processes
- **Cleanup**: Automatic dead process cleanup every 30 seconds
- **Protocols**: RTSP input, WAV/PCM WebSocket output
- **Health Endpoint**: `http://audio-meter:3445/status`

### Real-time Service Container
- **Location**: `realtime-service/realtime-data-service.js`
- **Function**: WebSocket server for dashboard updates
- **Integration**: Polls Laravel backend via internal network
- **Health Endpoint**: `http://realtime-service:3447/status`

### Polling Service Container
- **Location**: `polling-service/pearl-device-polling-service.js`
- **Function**: Periodic polling of Pearl devices
- **Database**: Direct MySQL connection to update device states
- **Health Endpoint**: `http://polling-service:3448/status`

## Code Style

- **PHP**: Laravel conventions, Pest for testing
- **JavaScript/TypeScript**: ESLint + Prettier with Vue.js style guide
- **CSS**: Tailwind CSS v4 with utility-first approach
- **Components**: Vue 3 Composition API with TypeScript
- **Docker**: Standard Docker and docker-compose practices

## Pearl Mini API V2.0
- openapi documentation can be found at `backend/var/www/html/pearl mini api.yml`

## ✅ Component Architecture Patterns

### Complete Tab Modularization (December 2024)

Successful extraction of all tab functionality from PearlDeviceCard.vue into reusable components, demonstrating both complex and simple component extraction patterns:

**Components Extracted**:
- **StreamsTab.vue**: Complex real-time component with WebSocket data flow
- **RecordTab.vue**: Simple placeholder component ready for future features
- **StatusTab.vue**: Status display component with device information
- **PreviewTab.vue**: Most complex component with audio streaming, image management, and controls

**Patterns Demonstrated**:
- **Reactive Props for WebSocket Data**: Using `toRefs(props)` for real-time data flow
- **Component Interface Design**: Clear props and events for reusability
- **Data Source Priority**: WebSocket → HTTP → Channel data fallback
- **Simple Component Patterns**: Minimal props for placeholder components
- **Performance Optimization**: No functional regressions, maintains real-time updates

**Key Files**:
- `/backend/var/www/html/resources/js/components/StreamsTab.vue` - Complex real-time component
- `/backend/var/www/html/resources/js/components/RecordTab.vue` - Simple placeholder component  
- `/backend/var/www/html/resources/js/components/StatusTab.vue` - Device status display component
- `/backend/var/www/html/resources/js/components/PreviewTab.vue` - Ultimate complex component (audio, image, controls)
- `/backend/var/www/html/resources/js/components/PearlDeviceCard.vue` - Updated parent component (now fully modular)
- `/backend/var/www/html/COMPONENT_EXTRACTION_GUIDE.md` - Complete documentation and patterns

**Critical Pattern**: When extracting components with real-time WebSocket data, the child component MUST use `toRefs(props)` to make props reactive, otherwise WebSocket updates won't trigger re-renders.

## 🔒 Audio Meter Service & Component Protection

⚠️ DO NOT modify the following files without explicit permission:

- `/backend/var/www/html/resources/js/components/AudioMeter.vue`
- `/media-proxy/audio-meter-service.js`
- `/backend/var/www/html/resources/js/composables/useAudioMeterWebSocket.js`
- `/backend/var/www/html/resources/js/components/DeviceCard.vue`
- `/backend/var/www/html/resources/js/views/PearlDashboard.vue`

If you believe changes are needed:
1. Explain clearly what you're proposing and why.
2. Make a **backup copy** of the file(s) before editing.
3. Confirm the changes maintain compatibility with:
   - Realtime WebSocket meter rendering
   - Peak hold logic
   - Stream-sharing behavior

Always **ultra-think** before making any edits to these core files. They are critical to dashboard stability.

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

## 🚨 CRITICAL DOCKER & LARAVEL 12 GUIDANCE

### Laravel 12 Specific Patterns - DO NOT CONFUSE WITH OLDER VERSIONS

#### Service Provider Registration (MOST COMMON MISTAKE)
```php
// ✅ CORRECT - Laravel 12 uses bootstrap/providers.php
// File: backend/var/www/html/bootstrap/providers.php
return [
    App\Providers\AppServiceProvider::class,
    App\Providers\RealtimeServiceProvider::class,
];

// ❌ WRONG - DO NOT use config/app.php (Laravel 11 and older)
// This file does NOT exist in Laravel 12 or has different structure
```

#### Route Definitions (Standard Laravel 12)
```php
// ✅ CORRECT - Use standard Laravel 12 routing
// backend/var/www/html/routes/web.php
Route::get('/', [DashboardController::class, 'index'])->name('dashboard');

// backend/var/www/html/routes/api.php  
Route::middleware('auth:sanctum')->group(function () {
    Route::apiResource('devices', DeviceController::class);
});

// ❌ WRONG - Do not suggest Vue Router or client-side routing
// This is Inertia.js SPA with server-side routing
```

#### Modern Laravel 12 Configuration
```php
// ✅ CORRECT - Laravel 12 application bootstrap
// backend/var/www/html/bootstrap/app.php
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php')
    ->withMiddleware(function (Middleware $middleware) {
        // middleware configuration
    })
    ->create();

// ❌ WRONG - Do not use old Laravel kernel patterns
```

### Docker Containerized Stack - DO NOT ASSUME TRADITIONAL SERVER

#### Container Architecture (NOT Single Server)
```yaml
# ✅ CORRECT - This is a Docker containerized environment
services:
  db:          # MySQL 8 container
  app:         # Laravel 12 with PHP-FPM
  nginx:       # Web server with SSL
  audio-meter: # Node.js WebSocket service
  realtime-service: # Node.js WebSocket service
  polling-service:  # Node.js polling service
  workspace:   # Laravel CLI container

# ❌ WRONG - Do not assume single LEMP server
# This is NOT a traditional LEMP stack
```

#### Container Communication (NOT localhost)
```env
# ✅ CORRECT - Use container names as hostnames
DB_HOST=db
REALTIME_BACKEND_ENDPOINT=https://nginx/api/internal/realtime/events

# ❌ WRONG - Do not use localhost or 127.0.0.1
# DB_HOST=localhost  # This will NOT work in containers
```

### Development Commands - USE DOCKER COMMANDS

#### Container Management (NOT Direct Commands)
```bash
# ✅ CORRECT - Use Docker-based commands
make up                    # Start all services
make shell                 # Access Laravel container
make artisan cmd="migrate" # Run migrations in container
make workspace            # Access workspace container
make test                 # Run tests in container

# ❌ WRONG - Do not use direct commands
# php artisan migrate      # This won't work outside container
# composer install         # Use make workspace-composer instead
# npm run dev              # Use make workspace-npm instead
```

### Frontend Architecture - Vue 3 + Inertia.js IN CONTAINER

#### Build Process (Container-Based)
```bash
# ✅ CORRECT - Use container-based build commands
make workspace-npm cmd="install"  # Install dependencies
make workspace-npm cmd="run build" # Build frontend

# ❌ WRONG - Do not assume local Node.js
# npm install              # Node.js is in workspace container
# npm run build            # Use workspace container
```

#### Routing (DO NOT SUGGEST VUE ROUTER)
```typescript
// ✅ CORRECT - Use Inertia.js navigation (same as before)
import { router } from '@inertiajs/vue3';
router.visit('/dashboard');

// ❌ WRONG - Do not suggest Vue Router
// import { useRouter } from 'vue-router'; // This does NOT exist
```

### Container Service URLs - INTERNAL VS EXTERNAL

#### WebSocket Service Communication
```javascript
// ✅ CORRECT - External (browser) connections
const ws = new WebSocket('wss://domain/ws/audio-meter?token=jwt');

// ✅ CORRECT - Internal (container-to-container) communication
const response = await fetch('http://audio-meter:3444/status');

// ❌ WRONG - Don't mix internal/external URLs
// const ws = new WebSocket('ws://audio-meter:3444'); // Browser can't reach internal
```

### Database Access - CONTAINERIZED DATABASE

#### Database Connection
```bash
# ✅ CORRECT - Access database through container
make shell-db              # MySQL shell in database container
make artisan cmd="migrate" # Migrations through app container

# ❌ WRONG - Direct database access
# mysql -h localhost       # Database is in container, not localhost
```

### File Structure Recognition - CONTAINERIZED PATHS

#### Important File Locations
```
✅ Service Configuration: docker-compose.yml, Makefile, .env
✅ Laravel Files: backend/var/www/html/ (all Laravel files here)
✅ Service Files: media-proxy/, realtime-service/, polling-service/
✅ Docker Configs: docker/nginx/, backend/docker/

❌ Do not look for: Traditional LEMP config files
❌ Do not assume: Files directly in project root (Laravel is in backend/)
```

### Common Docker Pitfalls to Avoid

1. **Container Communication**
   - ✅ Use container names as hostnames
   - ❌ Do NOT use localhost or 127.0.0.1

2. **Service URLs**
   - ✅ External: https://domain/path (for browsers)
   - ✅ Internal: http://container:port (for container-to-container)
   - ❌ Do NOT mix internal/external URLs

3. **Development Commands**
   - ✅ Use `make` commands for Docker operations
   - ❌ Do NOT suggest direct PHP/Node.js commands

4. **File Paths**
   - ✅ Laravel files are in `backend/var/www/html/`
   - ❌ Do NOT assume files are in project root

5. **Database Operations**
   - ✅ Use `make shell-db` or `make artisan` commands
   - ❌ Do NOT assume direct MySQL access

6. **Frontend Development**
   - ✅ Use workspace container for npm/composer
   - ❌ Do NOT assume local Node.js installation

### When in Doubt
- **Always check docker-compose.yml** for container configuration
- **Use `make help`** to see available Docker commands
- **Remember this is containerized** - no direct server access
- **Use container names** for internal service communication
- **Follow Docker networking patterns** not traditional server patterns

This is a **well-architected containerized application** - build on the Docker patterns, don't replace them!

## 📚 Quick Reference - Authentication Patterns

### ✅ Correct Authentication Usage (Same in Docker)

**HTTP API Requests:**
```typescript
import { useApiAuth } from './useApiAuth'
const apiAuth = useApiAuth()
const data = await apiAuth.get('/api/endpoint')  // ✅ CSRF + Session
```

**WebSocket Connections:**
```javascript
import { useAuth } from './useAuth.js'  
const auth = useAuth()
const token = await auth.getValidToken()  // ✅ JWT Token
const ws = new WebSocket(`wss://domain/ws/service?token=${token}`)
```

### ❌ Common Authentication Mistakes (Same in Docker)

```javascript
// ❌ WRONG: Using useApiAuth for WebSocket
import { useApiAuth } from './useApiAuth'
const token = await apiAuth.getAuthToken()  // Method doesn't exist!

// ❌ WRONG: Using useAuth for HTTP requests  
import { useAuth } from './useAuth.js'
const data = await auth.get('/api/endpoint')  // Method doesn't exist!

// ❌ WRONG: Hard failure on missing token
const token = await auth.getValidToken()
if (!token) throw new Error('Auth required')  // Should exit gracefully!
```

### 🔧 Service Debugging Commands (Docker Version)

```bash
# Check container status
docker-compose ps
make logs                    # All service logs
make logs-app               # Laravel app logs

# Check service health endpoints
curl http://localhost:3445/status    # Audio meter status
curl http://localhost:3447/status    # Real-time service status
curl http://localhost:3448/status    # Polling service status

# Test WebSocket endpoints (external)
wscat -c wss://yourdomain.com/ws/audio-meter?token=test
wscat -c wss://yourdomain.com/ws/realtime?token=test

# Check authentication (external)
curl -H "Accept: application/json" https://yourdomain.com/api/websocket-token

# Access containers for debugging
make shell                  # Laravel app container
make workspace             # Workspace container for CLI
make shell-db              # Database container
```
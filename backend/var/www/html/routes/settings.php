<?php

use App\Http\Controllers\Api\RealtimeController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Settings Routes - IMPORTANT ROUTING ARCHITECTURE NOTES
|--------------------------------------------------------------------------
|
| This file handles both legacy settings infrastructure and internal service routes.
| 
| ROUTING CONFLICT RESOLUTION (August 2024):
| ==========================================
| 
| PROBLEM: 
| - Pearl Dashboard uses a clean `/settings` route for a simple settings page
| - Previous implementation had: Route::redirect('settings', '/settings/profile')  
| - This caused conflicts: clicking Settings → redirected to /settings/profile → 404
|
| SOLUTION:
| - Removed the problematic redirect to allow clean /settings route in web.php
| - Kept internal service routes that realtime-service depends on
| - Used surgical approach instead of deleting entire settings infrastructure
|
| CURRENT ARCHITECTURE:
| - `/settings` (web.php) → PearlDashboard layout with blank settings page
| - `/api/internal/realtime/*` (below) → Internal routes for Node.js services
|
| WARNING FOR FUTURE DEVELOPERS:
| - DO NOT add Route::redirect('settings', '/settings/profile') back
| - DO NOT remove the internal API routes below (realtime service needs them)
| - If you need user profile/password settings, create new routes like:
|   - `/settings/profile`, `/settings/password`, etc. (but not the root `/settings`)
|
*/

// REMOVED: Route::redirect('settings', '/settings/profile'); 
// This redirect conflicted with our clean /settings route in web.php
// If you need Laravel Breeze-style settings, use specific sub-routes instead

/*
|--------------------------------------------------------------------------
| Internal Service API Routes
|--------------------------------------------------------------------------
|
| These routes are consumed by Node.js microservices, NOT the frontend.
| 
| REALTIME SERVICE DEPENDENCY:
| - realtime-data-service.js polls /api/internal/realtime/events  
| - This service provides WebSocket data to the frontend
| - Authentication: These routes may need special auth handling for service-to-service communication
|
| CRITICAL: Do not remove these routes without checking:
| - realtime-service/realtime-data-service.js (BACKEND_EVENT_ENDPOINT config)
| - Any other Node.js services that might depend on internal APIs
|
*/

Route::prefix('api/internal/realtime')->name('internal.realtime.')->group(function () {
    // GET: Realtime service polls this endpoint to fetch events from Laravel
    Route::get('/events', [RealtimeController::class, 'getEvents']);
    
    // POST: Realtime service posts new events to Laravel  
    Route::post('/events', [RealtimeController::class, 'storeEvent']);
});
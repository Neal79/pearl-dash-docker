<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\DeviceProxyController;
use App\Http\Controllers\Api\DeviceStateController;


// Root route - redirect based on authentication
Route::get('/', function () {
    if (auth()->check()) {
        return redirect()->route('dashboard');
    }
    return redirect()->route('login');
})->name('home');

// Protected dashboard route
Route::middleware('auth')->group(function () {
    /*
    |--------------------------------------------------------------------------
    | Pearl Dashboard Layout Routes 
    |--------------------------------------------------------------------------
    |
    | These routes use the PearlDashboard.vue parent layout with different page content.
    | The layout handles navigation, modals, device management, and WebSocket connections.
    |
    | ROUTING ARCHITECTURE (August 2024):
    | - PearlDashboard.vue = Master layout (navigation, device CRUD, WebSocket, authentication)
    | - PearlDeviceGrid.vue = Dashboard page content (device grid, drag-drop, fullscreen)  
    | - PearlDashSettings.vue = Settings page content (blank placeholder for future features)
    |
    | The 'page' parameter determines which content component to render in the layout.
    |
    */
    
    // Main dashboard - shows device grid in the layout
    Route::get('/dashboard', fn() => Inertia::render('PearlDashboard'))
         ->name('dashboard');
    
    // Settings page - shows blank settings content in the same layout
    // NOTE: This route was conflicting with Route::redirect('settings', '/settings/profile') 
    // in routes/settings.php. That redirect has been removed to allow this clean route.
    Route::get('/settings', fn() => Inertia::render('PearlDashboard', ['page' => 'settings']))
         ->name('settings');
    
    // User management routes (password protected)
    Route::get('/add-user', [App\Http\Controllers\UserController::class, 'create'])
         ->name('add-user');
    Route::post('/add-user', [App\Http\Controllers\UserController::class, 'store']);
});

Route::get('/test', fn() => Inertia::render('NewDashboard'))
     ->name('new-dashboard');

// Debug endpoint to check session state (remove in production)
Route::get('/debug-session', function() {
    return response()->json([
        'authenticated' => auth()->check(),
        'user' => auth()->user(),
        'session_id' => session()->getId(),
        'csrf_token' => csrf_token(),
        'all_session_data' => session()->all()
    ]);
});

// Ultra-simple POST test (no auth, no middleware)
Route::post('/simple-post-test', function() {
    \Illuminate\Support\Facades\Log::info("Simple POST test called");
    return response()->json(['status' => 'success', 'timestamp' => now()->toISOString()]);
});


// Note: API routes moved to routes/api.php with Sanctum authentication






require __DIR__.'/settings.php';
require __DIR__.'/auth.php';

<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Real-time Data Configuration
    |--------------------------------------------------------------------------
    |
    | Configuration for the real-time WebSocket data broadcasting system
    |
    */

    // Event storage configuration
    'max_events' => env('REALTIME_MAX_EVENTS', 1000),
    'event_ttl' => env('REALTIME_EVENT_TTL', 300), // 5 minutes in seconds
    'batch_size' => env('REALTIME_BATCH_SIZE', 20), // Reduced for better performance

    // WebSocket service configuration
    'websocket_port' => env('REALTIME_WEBSOCKET_PORT', 3446),
    'status_port' => env('REALTIME_STATUS_PORT', 3447),
    'backend_poll_interval' => env('REALTIME_BACKEND_POLL', 2000), // milliseconds
    'backend_endpoint' => env('REALTIME_BACKEND_ENDPOINT', 'http://localhost:8000/api/realtime/events'),

    // Connection limits
    'max_connections_per_ip' => env('REALTIME_MAX_CONNECTIONS_PER_IP', 25),
    'max_subscriptions_per_client' => env('REALTIME_MAX_SUBSCRIPTIONS', 50),
    'max_queue_size' => env('REALTIME_MAX_QUEUE_SIZE', 100),

    // Cleanup intervals
    'cache_ttl' => env('REALTIME_CACHE_TTL', 300000), // 5 minutes in milliseconds
    'queue_ttl' => env('REALTIME_QUEUE_TTL', 30000), // 30 seconds in milliseconds
    'cleanup_interval' => env('REALTIME_CLEANUP_INTERVAL', 60000), // 1 minute in milliseconds

    // Supported data types
    'data_types' => [
        'publisher_status' => [
            'description' => 'Real-time streaming control status',
            'enabled' => true,
        ],
        'device_health' => [
            'description' => 'Device connectivity and health metrics',
            'enabled' => true,
        ],
        'stream_quality' => [
            'description' => 'Video/audio quality metrics',
            'enabled' => false, // Future feature
        ],
        'recording_status' => [
            'description' => 'Recording state changes',
            'enabled' => false, // Future feature
        ],
    ],

    // Performance monitoring
    'monitoring' => [
        'enabled' => env('REALTIME_MONITORING_ENABLED', true),
        'metrics_retention' => env('REALTIME_METRICS_RETENTION', 3600), // 1 hour in seconds
    ],

];
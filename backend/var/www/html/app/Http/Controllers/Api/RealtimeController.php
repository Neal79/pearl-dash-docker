<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\RealtimeEventStore;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

/**
 * Realtime Data Controller
 * 
 * API endpoints for the WebSocket service to retrieve real-time event data
 * Designed for high-frequency polling from the Node.js WebSocket service
 */
class RealtimeController extends Controller
{
    private RealtimeEventStore $eventStore;

    public function __construct(RealtimeEventStore $eventStore)
    {
        $this->eventStore = $eventStore;
    }

    /**
     * Get recent events for WebSocket service
     * 
     * This endpoint is polled by the Node.js WebSocket service every 2 seconds
     * Returns recent events that need to be pushed to connected clients
     */
    public function getEvents(Request $request): JsonResponse
    {
        try {
            $limit = $request->query('limit', 50);
            $deviceFilter = $request->query('device');
            $channelFilter = $request->query('channel');
            
            // Validate limit
            $limit = max(1, min(100, (int)$limit)); // Between 1-100
            
            if ($deviceFilter) {
                // Get events for specific device/channel
                $events = $this->eventStore->getDeviceEvents(
                    $deviceFilter, 
                    $channelFilter ? (int)$channelFilter : null, 
                    $limit
                );
            } else {
                // Get all recent events
                $events = $this->eventStore->getRecentEvents($limit);
            }
            
            return response()->json($events, 200, [
                'Cache-Control' => 'no-cache, no-store, must-revalidate',
                'Pragma' => 'no-cache',
                'Expires' => '0'
            ]);
            
        } catch (\Exception $e) {
            Log::error('RealtimeController: Failed to get events', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Failed to retrieve events',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get performance statistics
     */
    public function getStats(): JsonResponse
    {
        try {
            $stats = $this->eventStore->getStats();
            
            return response()->json([
                'status' => 'ok',
                'stats' => $stats,
                'timestamp' => now()->toISOString()
            ]);
            
        } catch (\Exception $e) {
            Log::error('RealtimeController: Failed to get stats', [
                'error' => $e->getMessage()
            ]);
            
            return response()->json([
                'error' => 'Failed to retrieve statistics',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Health check endpoint
     */
    public function health(): JsonResponse
    {
        try {
            $stats = $this->eventStore->getStats();
            
            return response()->json([
                'status' => 'healthy',
                'service' => 'realtime-events',
                'version' => '1.0.0',
                'active_events' => $stats['active_events'] ?? 0,
                'timestamp' => now()->toISOString()
            ]);
            
        } catch (\Exception $e) {
            return response()->json([
                'status' => 'unhealthy',
                'error' => $e->getMessage(),
                'timestamp' => now()->toISOString()
            ], 503);
        }
    }

    /**
     * Store an event from external source (like Node.js polling service)
     */
    public function storeEvent(Request $request): JsonResponse
    {
        try {
            $eventData = $request->validate([
                'type' => 'required|string',
                'device' => 'required|string',
                'channel' => 'nullable|integer',
                'publisher_id' => 'nullable|string',
                'data' => 'required|array',
                'timestamp' => 'nullable|string',
                'source' => 'nullable|string'
            ]);

            $success = $this->eventStore->storeEvent($eventData);
            
            if ($success) {
                return response()->json([
                    'status' => 'ok',
                    'message' => 'Event stored successfully'
                ]);
            } else {
                return response()->json([
                    'status' => 'duplicate',
                    'message' => 'Event was deduplicated'
                ]);
            }
            
        } catch (\Exception $e) {
            Log::error('RealtimeController: Failed to store event', [
                'error' => $e->getMessage(),
                'event_data' => $request->all()
            ]);
            
            return response()->json([
                'error' => 'Failed to store event',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Clear all events (admin only)
     */
    public function clearEvents(): JsonResponse
    {
        try {
            $success = $this->eventStore->clearAllEvents();
            
            if ($success) {
                Log::info('RealtimeController: All events cleared by admin');
                return response()->json([
                    'status' => 'ok',
                    'message' => 'All events cleared successfully'
                ]);
            } else {
                return response()->json([
                    'error' => 'Failed to clear events'
                ], 500);
            }
            
        } catch (\Exception $e) {
            Log::error('RealtimeController: Failed to clear events', [
                'error' => $e->getMessage()
            ]);
            
            return response()->json([
                'error' => 'Failed to clear events',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Manual cleanup of expired events
     */
    public function cleanup(): JsonResponse
    {
        try {
            $cleanedCount = $this->eventStore->cleanupExpiredEvents();
            
            return response()->json([
                'status' => 'ok',
                'cleaned_events' => $cleanedCount,
                'message' => "Cleaned up {$cleanedCount} expired events"
            ]);
            
        } catch (\Exception $e) {
            Log::error('RealtimeController: Failed to cleanup events', [
                'error' => $e->getMessage()
            ]);
            
            return response()->json([
                'error' => 'Failed to cleanup events',
                'message' => $e->getMessage()
            ], 500);
        }
    }
}
<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Realtime Event Store
 * 
 * High-performance event storage and retrieval system for real-time WebSocket data
 * Uses Laravel Cache with configurable backends (Redis, Memcached, File)
 * 
 * Features:
 * - Event deduplication and rate limiting
 * - TTL-based automatic cleanup
 * - Efficient event batching and retrieval
 * - Memory-efficient circular buffer implementation
 * - Performance monitoring and metrics
 */
class RealtimeEventStore
{
    private const EVENT_PREFIX = 'realtime_event:';
    private const EVENT_LIST_KEY = 'realtime_events:list';
    private const STATS_KEY = 'realtime_events:stats';
    
    private int $maxEvents;
    private int $eventTTL;
    private int $batchSize;
    
    public function __construct()
    {
        $this->maxEvents = config('realtime.max_events', 1000);
        $this->eventTTL = config('realtime.event_ttl', 300); // 5 minutes
        $this->batchSize = config('realtime.batch_size', 50);
    }

    /**
     * Store a real-time event
     */
    public function storeEvent(array $event): bool
    {
        try {
            $eventId = $this->generateEventId($event);
            $eventKey = self::EVENT_PREFIX . $eventId;
            
            // Check for duplicate events (deduplication)
            if (Cache::has($eventKey)) {
                Log::debug("Realtime event deduplicated: {$eventId}");
                return false;
            }
            
            // Add timestamp if not present
            if (!isset($event['timestamp'])) {
                $event['timestamp'] = now()->toISOString();
            }
            
            // Store the event with TTL
            Cache::put($eventKey, $event, $this->eventTTL);
            
            // Add to the event list (circular buffer)
            $this->addToEventList($eventId);
            
            // Update statistics
            $this->updateStats('events_stored');
            
            Log::debug("Realtime event stored: {$eventId}", [
                'type' => $event['type'] ?? 'unknown',
                'device' => $event['device'] ?? 'unknown'
            ]);
            
            return true;
            
        } catch (\Exception $e) {
            Log::error('Failed to store realtime event', [
                'error' => $e->getMessage(),
                'event' => $event
            ]);
            return false;
        }
    }

    /**
     * Retrieve recent events for WebSocket service
     * FIXED: Now returns only the latest event per device/channel/type to prevent duplicate data conflicts
     */
    public function getRecentEvents(int $limit = null): array
    {
        $limit = $limit ?? $this->batchSize;
        
        try {
            // Get recent event IDs from the list
            $eventIds = Cache::get(self::EVENT_LIST_KEY, []);
            $recentIds = array_slice($eventIds, -($limit * 2)); // Reduced from 3x to 2x for better performance
            
            if (empty($recentIds)) {
                return [];
            }
            
            // Retrieve events in batch
            $eventKeys = array_map(fn($id) => self::EVENT_PREFIX . $id, $recentIds);
            $events = Cache::many($eventKeys);
            
            // Filter out null values and reindex
            $validEvents = array_values(array_filter($events));
            
            // DEDUPLICATION: Keep only the latest event per device/channel/type combination
            $latestEvents = [];
            foreach ($validEvents as $event) {
                $key = ($event['type'] ?? 'unknown') . ':' . 
                       ($event['device'] ?? 'unknown') . ':' . 
                       ($event['channel'] ?? 'all');
                
                $eventTime = $event['timestamp'] ?? 0;
                
                // Convert timestamp to comparable format once (avoid repeated string operations)
                if (is_string($eventTime)) {
                    $eventTime = strtotime($eventTime) ?: 0;
                }
                
                // Only keep if this is the latest event for this key
                $existingTime = $latestEvents[$key]['_timestamp'] ?? 0;
                if ($eventTime > $existingTime) {
                    $event['_timestamp'] = $eventTime; // Cache converted timestamp
                    $latestEvents[$key] = $event;
                }
            }
            
            // Convert back to indexed array and sort by timestamp (most recent first)
            $finalEvents = array_values($latestEvents);
            
            // Clean up cached timestamps and sort
            foreach ($finalEvents as &$event) {
                unset($event['_timestamp']); // Remove internal timestamp cache
            }
            
            usort($finalEvents, function ($a, $b) {
                $aTime = is_string($a['timestamp'] ?? 0) ? strtotime($a['timestamp']) : $a['timestamp'];
                $bTime = is_string($b['timestamp'] ?? 0) ? strtotime($b['timestamp']) : $b['timestamp'];
                return $bTime <=> $aTime; // Faster than strcmp
            });
            
            // Limit to requested count
            $finalEvents = array_slice($finalEvents, 0, $limit);
            
            // Update statistics
            $this->updateStats('events_retrieved', count($finalEvents));
            
            Log::debug("Retrieved {count} deduplicated realtime events (from {total} raw events)", [
                'count' => count($finalEvents),
                'total' => count($validEvents),
                'requested' => $limit
            ]);
            
            return $finalEvents;
            
        } catch (\Exception $e) {
            Log::error('Failed to retrieve realtime events', [
                'error' => $e->getMessage(),
                'limit' => $limit
            ]);
            return [];
        }
    }

    /**
     * Get events for specific device/channel combination
     */
    public function getDeviceEvents(string $device, ?int $channel = null, int $limit = 10): array
    {
        $allEvents = $this->getRecentEvents($limit * 2); // Get more to filter
        
        $filtered = array_filter($allEvents, function ($event) use ($device, $channel) {
            if (($event['device'] ?? '') !== $device) {
                return false;
            }
            
            if ($channel !== null && ($event['channel'] ?? null) !== $channel) {
                return false;
            }
            
            return true;
        });
        
        return array_slice(array_values($filtered), 0, $limit);
    }

    /**
     * Clear expired events (called by maintenance job)
     */
    public function cleanupExpiredEvents(): int
    {
        try {
            $eventIds = Cache::get(self::EVENT_LIST_KEY, []);
            $cleanedCount = 0;
            $validIds = [];
            
            foreach ($eventIds as $eventId) {
                $eventKey = self::EVENT_PREFIX . $eventId;
                if (Cache::has($eventKey)) {
                    $validIds[] = $eventId;
                } else {
                    $cleanedCount++;
                }
            }
            
            // Update the event list with only valid IDs
            Cache::put(self::EVENT_LIST_KEY, $validIds, 3600); // 1 hour TTL for list
            
            // Update statistics
            $this->updateStats('events_cleaned', $cleanedCount);
            
            if ($cleanedCount > 0) {
                Log::info("Cleaned up {$cleanedCount} expired realtime events");
            }
            
            return $cleanedCount;
            
        } catch (\Exception $e) {
            Log::error('Failed to cleanup expired realtime events', [
                'error' => $e->getMessage()
            ]);
            return 0;
        }
    }

    /**
     * Get performance statistics
     */
    public function getStats(): array
    {
        $stats = Cache::get(self::STATS_KEY, [
            'events_stored' => 0,
            'events_retrieved' => 0,
            'events_cleaned' => 0,
            'last_cleanup' => null,
            'started_at' => now()->toISOString()
        ]);
        
        $stats['active_events'] = count(Cache::get(self::EVENT_LIST_KEY, []));
        $stats['cache_hit_ratio'] = $this->calculateCacheHitRatio();
        
        return $stats;
    }

    /**
     * Reset all stored events (admin function)
     */
    public function clearAllEvents(): bool
    {
        try {
            $eventIds = Cache::get(self::EVENT_LIST_KEY, []);
            
            // Delete all event data
            foreach ($eventIds as $eventId) {
                Cache::forget(self::EVENT_PREFIX . $eventId);
            }
            
            // Clear the event list
            Cache::forget(self::EVENT_LIST_KEY);
            
            // Reset statistics
            Cache::forget(self::STATS_KEY);
            
            Log::info("Cleared all realtime events", [
                'cleared_count' => count($eventIds)
            ]);
            
            return true;
            
        } catch (\Exception $e) {
            Log::error('Failed to clear realtime events', [
                'error' => $e->getMessage()
            ]);
            return false;
        }
    }

    /**
     * Generate unique event ID based on content and timestamp
     */
    private function generateEventId(array $event): string
    {
        $key = ($event['type'] ?? 'unknown') . ':' . 
               ($event['device'] ?? 'unknown') . ':' . 
               ($event['channel'] ?? 'all') . ':' . 
               ($event['changeHash'] ?? md5(json_encode($event))) . ':' .
               floor(microtime(true) * 1000); // millisecond precision
        
        return hash('xxh64', $key); // Fast, good distribution hash
    }

    /**
     * Add event ID to circular buffer list
     */
    private function addToEventList(string $eventId): void
    {
        $eventIds = Cache::get(self::EVENT_LIST_KEY, []);
        
        // Add new event ID
        $eventIds[] = $eventId;
        
        // Maintain circular buffer (keep only recent events)
        if (count($eventIds) > $this->maxEvents) {
            $eventIds = array_slice($eventIds, -$this->maxEvents);
        }
        
        // Store updated list
        Cache::put(self::EVENT_LIST_KEY, $eventIds, 3600); // 1 hour TTL
    }

    /**
     * Update performance statistics
     */
    private function updateStats(string $metric, int $increment = 1): void
    {
        $stats = Cache::get(self::STATS_KEY, []);
        
        if (!isset($stats[$metric])) {
            $stats[$metric] = 0;
        }
        
        $stats[$metric] += $increment;
        $stats['last_updated'] = now()->toISOString();
        
        Cache::put(self::STATS_KEY, $stats, 3600); // 1 hour TTL
    }

    /**
     * Calculate cache hit ratio for performance monitoring
     */
    private function calculateCacheHitRatio(): float
    {
        $stats = Cache::get(self::STATS_KEY, []);
        
        $stored = $stats['events_stored'] ?? 0;
        $retrieved = $stats['events_retrieved'] ?? 0;
        
        if ($stored === 0) {
            return 1.0;
        }
        
        return min(1.0, $retrieved / $stored);
    }
}
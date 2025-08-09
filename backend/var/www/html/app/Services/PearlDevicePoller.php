<?php

namespace App\Services;

use App\Models\Device;
use App\Models\DeviceState;
use App\Models\PublisherState;
use App\Events\PublisherStatusChanged;
use App\Events\DeviceHealthChanged;
use App\Services\RealtimeEventStore;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Exception;

/**
 * PEARL DEVICE POLLING SERVICE - ARCHITECTURE GUIDE
 * =================================================
 * 
 * This service is the CORE of the Pearl Dashboard's real-time data system.
 * It bridges Pearl Mini devices (hardware) with the Laravel backend (database)
 * to provide fast, cached data for the Vue.js frontend.
 * 
 * SYSTEM ARCHITECTURE:
 * 
 * Pearl Mini Device (RTSP/HTTP) ←→ PearlDevicePoller ←→ Database (DeviceState/PublisherState) ←→ Frontend APIs ←→ Vue.js UI
 * 
 * KEY RESPONSIBILITIES:
 * 1. POLLING: Fetch real-time data from Pearl devices via HTTP API
 * 2. CACHING: Store device state in database for fast frontend responses  
 * 3. CONTROL: Send start/stop commands to Pearl device publishers
 * 4. HEALTH: Monitor device connectivity and error states
 * 5. INITIALIZATION: Set up new devices for immediate use
 * 
 * POLLING STRATEGIES:
 * 
 * 1. IMMEDIATE POLLING (Device Creation):
 *    - Triggered: When user adds new device
 *    - Method: DeviceController calls this service synchronously
 *    - Timing: ~1-2 seconds response time
 *    - Purpose: Instant UX - user sees channels/publishers immediately
 * 
 * 2. BACKGROUND POLLING (Continuous Updates):
 *    - Triggered: By Laravel scheduler every 30 seconds
 *    - Method: PollDevicesJob → pollDueDevices() → pollDevice()
 *    - Timing: Ongoing background process
 *    - Purpose: Keep data fresh, detect status changes
 * 
 * 3. ON-DEMAND POLLING (Manual Refresh):
 *    - Triggered: Frontend API calls, manual commands
 *    - Method: DeviceStateController → forcePollDevice()
 *    - Timing: Immediate response
 *    - Purpose: User-initiated refresh, troubleshooting
 * 
 * DATABASE SCHEMA:
 * 
 * - devices: Basic device info (IP, credentials, name)
 * - device_states: Cached device data (channels_data JSON, status, timing)
 * - publisher_states: Individual publisher status (per channel/publisher)
 * 
 * FUTURE DEVELOPMENT PATTERNS:
 * 
 * When adding NEW FEATURES (recording, layouts, presets, etc.):
 * 1. Add new Pearl API endpoints to fetchDeviceData()
 * 2. Extend DeviceState.channels_data JSON structure  
 * 3. Create new database tables if needed (following PublisherState pattern)
 * 4. Add corresponding frontend APIs in DeviceStateController
 * 5. Maintain the immediate+background polling pattern for UX
 * 
 * PERFORMANCE NOTES:
 * - All Pearl API calls have 10-15 second timeouts
 * - Database writes are batched for efficiency
 * - Frontend gets cached data (no direct Pearl API calls from browser)
 * - Error states include exponential backoff to avoid hammering failing devices
 */
class PearlDevicePoller
{
    private const CHANNEL_POLL_INTERVAL = 5; // seconds - real-time data
    private const PUBLISHER_POLL_INTERVAL = 3; // seconds - ultra-fast control responsiveness
    private const MAX_ERROR_COUNT = 10;
    private const REQUEST_TIMEOUT = 10; // seconds

    private ?RealtimeEventStore $eventStore;
    private array $previousDeviceStates = []; // For change detection

    public function __construct(?RealtimeEventStore $eventStore = null)
    {
        $this->eventStore = $eventStore;
    }

    /**
     * Poll all devices that are due for polling
     */
    public function pollDueDevices(): array
    {
        $results = [
            'polled' => 0,
            'successful' => 0,
            'failed' => 0,
            'skipped' => 0,
            'errors' => []
        ];

        // Get all device states that should be polled
        $deviceStates = DeviceState::with('device')
            ->where('polling_enabled', true)
            ->where(function ($query) {
                $query->whereNull('next_poll_at')
                      ->orWhere('next_poll_at', '<=', now());
            })
            ->get();

        Log::info("PearlDevicePoller: Found {$deviceStates->count()} devices due for polling");

        foreach ($deviceStates as $deviceState) {
            $results['polled']++;
            
            try {
                if ($this->pollDevice($deviceState->device)) {
                    $results['successful']++;
                } else {
                    $results['failed']++;
                }
            } catch (Exception $e) {
                $results['failed']++;
                $results['errors'][] = [
                    'device_id' => $deviceState->device_id,
                    'device_ip' => $deviceState->device->ip,
                    'error' => $e->getMessage()
                ];
                Log::error("PearlDevicePoller: Error polling device {$deviceState->device->ip}: {$e->getMessage()}");
            }

            // Always set next poll time (with backoff on errors)
            $deviceState->setNextPollTime();
        }

        Log::info("PearlDevicePoller: Polling complete", $results);
        return $results;
    }

    /**
     * Poll a specific device for channels and publisher status
     */
    public function pollDevice(Device $device): bool
    {
        Log::debug("PearlDevicePoller: Polling device {$device->ip}");

        $deviceState = $device->getOrCreateState();

        try {
            // Step 1: Poll channels information
            $channelsData = $this->fetchDeviceChannels($device);
            
            if ($channelsData === null) {
                $deviceState->markError('Failed to fetch channels');
                return false;
            }

            // Step 2: Poll publisher status for each channel with publishers
            $publisherUpdates = [];
            foreach ($channelsData as $channel) {
                if (!empty($channel['publishers'])) {
                    $publisherStatus = $this->fetchChannelPublisherStatus($device, $channel['id']);
                    if ($publisherStatus !== null) {
                        $publisherUpdates[$channel['id']] = $publisherStatus;
                    }
                }
            }

            // Step 3: Update database with latest information
            $this->updateDeviceState($device, $channelsData, $publisherUpdates);
            
            $deviceState->markConnected();
            Log::debug("PearlDevicePoller: Successfully polled device {$device->ip}");
            
            return true;

        } catch (Exception $e) {
            $deviceState->markError($e->getMessage());
            Log::error("PearlDevicePoller: Failed to poll device {$device->ip}: {$e->getMessage()}");
            return false;
        }
    }

    /**
     * Fetch channels information from Pearl device
     */
    private function fetchDeviceChannels(Device $device): ?array
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels";
            $params = [
                'publishers' => 'true',
                'publishers-status' => 'true',
                'publishers-settings' => 'false',
            ];

            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(self::REQUEST_TIMEOUT)
                ->get($url, $params);

            if ($response->successful()) {
                $data = $response->json();
                return $data['result'] ?? [];
            }

            Log::warning("PearlDevicePoller: HTTP error {$response->status()} for device {$device->ip}");
            return null;

        } catch (Exception $e) {
            Log::error("PearlDevicePoller: Exception fetching channels for {$device->ip}: {$e->getMessage()}");
            return null;
        }
    }

    /**
     * Fetch publisher status for a specific channel
     */
    private function fetchChannelPublisherStatus(Device $device, string $channelId): ?array
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channelId}/publishers/status";

            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(self::REQUEST_TIMEOUT)
                ->get($url);

            if ($response->successful()) {
                $data = $response->json();
                return $data['result'] ?? [];
            }

            Log::warning("PearlDevicePoller: HTTP error {$response->status()} for publisher status on {$device->ip}:{$channelId}");
            return null;

        } catch (Exception $e) {
            Log::error("PearlDevicePoller: Exception fetching publisher status for {$device->ip}:{$channelId}: {$e->getMessage()}");
            return null;
        }
    }

    /**
     * Fetch publisher name from Pearl device
     */
    public function fetchPublisherName(Device $device, string $channelId, string $publisherId): ?string
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channelId}/publishers/{$publisherId}/name";

            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(self::REQUEST_TIMEOUT)
                ->get($url);

            if ($response->successful()) {
                $data = $response->json();
                $result = $data['result'] ?? $data['name'] ?? "Publisher {$publisherId}";
                
                // Handle case where result is an array (extract string value)
                if (is_array($result)) {
                    $result = $result['name'] ?? $result[0] ?? "Publisher {$publisherId}";
                }
                
                return is_string($result) ? $result : "Publisher {$publisherId}";
            }

            Log::warning("PearlDevicePoller: Failed to fetch name for publisher {$publisherId} on {$device->ip}:{$channelId}");
            return "Publisher {$publisherId}";

        } catch (Exception $e) {
            Log::error("PearlDevicePoller: Exception fetching publisher name for {$device->ip}:{$channelId}:{$publisherId}: {$e->getMessage()}");
            return "Publisher {$publisherId}";
        }
    }

    /**
     * Update device state and publisher states in database
     */
    private function updateDeviceState(Device $device, array $channelsData, array $publisherUpdates): void
    {
        $deviceState = $device->deviceState;

        // Update channels data only if provided
        if (!empty($channelsData)) {
            $deviceState->update([
                'channels_data' => $channelsData
            ]);
        }

        // Update publisher states and detect changes for real-time events
        foreach ($publisherUpdates as $channelId => $publishers) {
            $changes = [];
            $updatedPublishers = [];
            
            foreach ($publishers as $publisherData) {
                $publisherId = $publisherData['id'];

                // Get or create publisher state with initial data
                $publisherState = PublisherState::firstOrCreate([
                    'device_id' => $device->id,
                    'channel_id' => $channelId,
                    'publisher_id' => $publisherId,
                ], [
                    'name' => $publisherData['name'] ?? "Publisher {$publisherId}",
                    'type' => $publisherData['type'] ?? 'unknown',
                    'is_configured' => $publisherData['status']['is_configured'] ?? false,
                    'started' => $publisherData['status']['started'] ?? false,
                    'state' => $publisherData['status']['state'] ?? 'stopped',
                ]);

                // Store previous state for change detection
                $previousPublisherState = [
                    'started' => $publisherState->started,
                    'state' => $publisherState->state,
                    'is_configured' => $publisherState->is_configured,
                ];

                // Always fetch fresh publisher name from device
                $name = $this->fetchPublisherName($device, $channelId, $publisherId);
                $publisherData['name'] = $name;

                // Update publisher state from API data
                $publisherState->updateFromApiData($publisherData);
                
                // Detect changes for real-time events
                $currentState = [
                    'started' => $publisherState->started,
                    'state' => $publisherState->state,
                    'is_configured' => $publisherState->is_configured,
                ];
                
                if ($previousPublisherState !== $currentState) {
                    $changes[] = [
                        'publisher_id' => $publisherId,
                        'previous' => $previousPublisherState,
                        'current' => $currentState,
                        'changed_fields' => array_keys(array_diff_assoc($currentState, $previousPublisherState))
                    ];
                }
                
                // Build publisher data for event
                $updatedPublishers[] = [
                    'id' => $publisherId,
                    'name' => $name,
                    'type' => $publisherData['type'] ?? 'unknown',
                    'status' => [
                        'is_configured' => $publisherState->is_configured,
                        'started' => $publisherState->started,
                        'state' => $publisherState->state,
                    ]
                ];
            }
            
            // Fire real-time event if there were changes
            if (!empty($changes)) {
                $this->firePublisherStatusEvent($device, (int)$channelId, $updatedPublishers, $changes);
            }
        }

        Log::debug("PearlDevicePoller: Updated state for device {$device->ip}");
    }

    /**
     * Get previous publisher state for change detection
     */
    private function getPreviousPublisherState(int $deviceId, string $channelId): array
    {
        $key = "{$deviceId}:{$channelId}";
        return $this->previousDeviceStates[$key] ?? [];
    }

    /**
     * Fire real-time publisher status event
     */
    private function firePublisherStatusEvent(Device $device, int $channel, array $publishers, array $changes): void
    {
        try {
            // Create and fire Laravel event
            $event = new PublisherStatusChanged($device, $channel, $publishers, $changes);
            event($event);
            
            // PHASE 2: Direct push to WebSocket service for IMMEDIATE delivery (no polling delay!)
            $this->pushEventToWebSocket($event->toArray());
            
            // Store in real-time event store for WebSocket service (if available) - kept as backup
            if ($this->eventStore) {
                $this->eventStore->storeEvent($event->toArray());
            }
            
            Log::debug("PearlDevicePoller: Fired publisher status event with direct push", [
                'device' => $device->ip,
                'channel' => $channel,
                'changes' => count($changes),
                'publishers' => count($publishers),
                'direct_push_enabled' => true,
                'event_store_available' => $this->eventStore !== null
            ]);
            
        } catch (\Exception $e) {
            Log::error('Failed to fire publisher status event', [
                'device' => $device->ip,
                'channel' => $channel,
                'error' => $e->getMessage()
            ]);
        }
    }

    /**
     * PHASE 2: Push event directly to WebSocket service for immediate delivery
     */
    private function pushEventToWebSocket(array $eventData): void
    {
        try {
            // PHASE 2: Direct HTTP push to WebSocket webhook (sub-second delivery!)
            $webhookUrl = 'http://localhost:3447/webhook/event';
            
            $response = Http::timeout(3) // Fast timeout for immediate feedback
                ->post($webhookUrl, $eventData);
            
            if ($response->successful()) {
                Log::debug("PHASE 2: Direct push successful", [
                    'event_type' => $eventData['type'] ?? 'unknown',
                    'device' => $eventData['device'] ?? 'unknown',
                    'status' => $response->status()
                ]);
            } else {
                Log::warning("PHASE 2: Direct push failed, falling back to polling", [
                    'status' => $response->status(),
                    'event_type' => $eventData['type'] ?? 'unknown',
                    'device' => $eventData['device'] ?? 'unknown'
                ]);
            }
            
        } catch (\Exception $e) {
            // Graceful degradation - if direct push fails, polling will handle it
            Log::warning('PHASE 2: Direct push exception, polling will handle event', [
                'error' => $e->getMessage(),
                'event_type' => $eventData['type'] ?? 'unknown',
                'device' => $eventData['device'] ?? 'unknown'
            ]);
        }
    }

    /**
     * Fire device health change event
     */
    private function fireDeviceHealthEvent(Device $device, string $status, ?string $errorMessage = null, int $errorCount = 0): void
    {
        try {
            // Create and fire Laravel event
            $event = new DeviceHealthChanged($device, $status, $errorMessage, $errorCount);
            event($event);
            
            // PHASE 2: Direct push to WebSocket service for IMMEDIATE delivery
            $this->pushEventToWebSocket($event->toArray());
            
            // Store in real-time event store for WebSocket service (if available) - kept as backup
            if ($this->eventStore) {
                $this->eventStore->storeEvent($event->toArray());
            }
            
            Log::debug("PearlDevicePoller: Fired device health event with direct push", [
                'device' => $device->ip,
                'status' => $status,
                'error_count' => $errorCount,
                'direct_push_enabled' => true,
                'event_store_available' => $this->eventStore !== null
            ]);
            
        } catch (\Exception $e) {
            Log::error('Failed to fire device health event', [
                'device' => $device->ip,
                'status' => $status,
                'error' => $e->getMessage()
            ]);
        }
    }

    /**
     * Control publisher streaming (start/stop all publishers on channel)
     */
    public function controlChannelPublishers(Device $device, string $channelId, string $action): bool
    {
        if (!in_array($action, ['start', 'stop'])) {
            throw new \InvalidArgumentException("Invalid action: {$action}");
        }

        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channelId}/publishers/control/{$action}";

            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(15) // Longer timeout for control operations
                ->post($url);

            if ($response->successful()) {
                // Immediately poll this channel to get updated status
                $publisherStatus = $this->fetchChannelPublisherStatus($device, $channelId);
                if ($publisherStatus !== null) {
                    $this->updateDeviceState($device, [], [$channelId => $publisherStatus]);
                }

                Log::info("PearlDevicePoller: Successfully {$action}ed publishers on {$device->ip}:{$channelId}");
                return true;
            }

            Log::warning("PearlDevicePoller: Control operation failed for {$device->ip}:{$channelId} - HTTP {$response->status()}");
            return false;

        } catch (Exception $e) {
            Log::error("PearlDevicePoller: Exception controlling publishers on {$device->ip}:{$channelId}: {$e->getMessage()}");
            return false;
        }
    }

    /**
     * Initialize polling for a device (create initial state)
     * 
     * WHEN TO CALL:
     * - Immediately after device creation (DeviceController::store)
     * - When manually resetting a device's polling state
     * - During system setup/migration
     * 
     * WHAT IT DOES:
     * 1. Creates DeviceState record with polling enabled
     * 2. Sets next_poll_at to now() for immediate polling
     * 3. Initializes error tracking fields
     * 
     * CRITICAL: Always call this before pollDevice() for new devices
     */
    public function initializeDevice(Device $device): DeviceState
    {
        $deviceState = $device->getOrCreateState();
        
        // Set initial poll time to now
        $deviceState->update([
            'next_poll_at' => now()
        ]);

        Log::info("PearlDevicePoller: Initialized polling for device {$device->ip}");
        
        return $deviceState;
    }

    /**
     * Get health status of all devices
     */
    public function getDevicesHealth(): array
    {
        $deviceStates = DeviceState::with('device')->get();
        
        $health = [
            'total_devices' => $deviceStates->count(),
            'connected' => 0,
            'error' => 0,
            'timeout' => 0,
            'unreachable' => 0,
            'devices' => []
        ];

        foreach ($deviceStates as $state) {
            $health[$state->status]++;
            $health['devices'][] = [
                'id' => $state->device_id,
                'ip' => $state->device->ip,
                'name' => $state->device->name,
                'status' => $state->status,
                'last_seen' => $state->last_seen?->toISOString(),
                'error_count' => $state->error_count,
                'error_message' => $state->error_message,
            ];
        }

        return $health;
    }
}
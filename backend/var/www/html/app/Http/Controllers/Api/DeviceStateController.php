<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\DeviceState;
use App\Models\PublisherState;
use App\Services\PearlDevicePoller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class DeviceStateController extends Controller
{
    public function __construct(
        private PearlDevicePoller $poller
    ) {}

    /**
     * Get device state with channels and publishers
     */
    public function getDeviceState(Device $device): JsonResponse
    {
        $deviceState = $device->deviceState;
        
        if (!$deviceState) {
            return response()->json([
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'status' => 'not_initialized',
                'channels' => [],
                'last_updated' => null
            ]);
        }

        // Get publisher states for this device
        $publisherStates = $device->publisherStates()
            ->orderBy('channel_id')
            ->orderBy('publisher_id')
            ->get();

        // Group publishers by channel
        $channelPublishers = $publisherStates->groupBy('channel_id')->map(function ($publishers) {
            return $publishers->map(function ($publisher) {
                return [
                    'id' => $publisher->publisher_id,
                    'name' => $publisher->name ?? "Publisher {$publisher->publisher_id}",
                    'type' => $publisher->type ?? 'unknown',
                    'status' => [
                        'is_configured' => $publisher->is_configured,
                        'started' => $publisher->started,
                        'state' => $publisher->state
                    ]
                ];
            })->values();
        });

        // Transform channels data to include publisher states
        $channels = collect($deviceState->channels_data ?? [])->map(function ($channel) use ($channelPublishers) {
            $channelId = $channel['id'];
            $publishers = $channelPublishers->get($channelId, collect());
            
            return [
                'id' => $channelId,
                'name' => $channel['name'] ?? "Channel {$channelId}",
                'publishers' => $publishers->toArray()
            ];
        });

        return response()->json([
            'device_id' => $device->id,
            'device_ip' => $device->ip,
            'status' => $deviceState->status,
            'last_seen' => $deviceState->last_seen?->toISOString(),
            'error_count' => $deviceState->error_count,
            'error_message' => $deviceState->error_message,
            'channels' => $channels->values(),
            'last_updated' => $deviceState->updated_at->toISOString()
        ]);
    }

    /**
     * Get channel information for a device (replaces old channels endpoint)
     */
    public function getDeviceChannels(Device $device): JsonResponse
    {
        $deviceState = $device->deviceState;
        
        if (!$deviceState || !$deviceState->channels_data) {
            return response()->json([
                'channels' => [],
                'status' => $deviceState?->status ?? 'not_initialized',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'fetched_at' => now()->toISOString()
            ]);
        }

        return response()->json([
            'channels' => $deviceState->channels_data,
            'status' => $deviceState->status === 'connected' ? 'ok' : 'error',
            'device_id' => $device->id,
            'device_ip' => $device->ip,
            'fetched_at' => $deviceState->updated_at->toISOString()
        ]);
    }

    /**
     * Get publisher status for a specific channel (replaces old publisher status endpoint)
     */
    public function getChannelPublisherStatus(Device $device, string $channelId): JsonResponse
    {
        $publishers = PublisherState::forChannel($device->id, $channelId)->get();

        $publisherData = $publishers->map(function ($publisher) {
            return [
                'id' => $publisher->publisher_id,
                'name' => $publisher->name ?? "Publisher {$publisher->publisher_id}",
                'type' => $publisher->type ?? 'unknown',
                'status' => [
                    'is_configured' => $publisher->is_configured,
                    'started' => $publisher->started,
                    'state' => $publisher->state
                ]
            ];
        });

        $deviceState = $device->deviceState;

        return response()->json([
            'publishers' => $publisherData,
            'status' => $deviceState?->status === 'connected' ? 'ok' : 'error',
            'device_id' => $device->id,
            'device_ip' => $device->ip,
            'channel' => (int) $channelId, // Convert to number to match frontend interface
            'fetched_at' => $publishers->max('updated_at')?->toISOString() ?? now()->toISOString()
        ]);
    }

    /**
     * Control channel publishers (start/stop all)
     */
    public function controlChannelPublishers(Device $device, string $channel, Request $request): JsonResponse
    {
        Log::info("DeviceStateController: Method entry", [
            'device_id' => $device->id,
            'channel_id' => $channel,
            'request_data' => $request->all(),
            'device_ip' => $device->ip
        ]);

        try {
            $action = $request->input('action');
            Log::info("DeviceStateController: Action extracted", ['action' => $action]);
            
            if (!in_array($action, ['start', 'stop'])) {
                Log::warning("DeviceStateController: Invalid action", ['action' => $action]);
                return response()->json([
                    'error' => 'Invalid action. Must be "start" or "stop"',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'channel' => (int) $channel
                ], 400);
            }

            Log::info("DeviceStateController: About to call poller", ['action' => $action]);
            $success = $this->poller->controlChannelPublishers($device, $channel, $action);
            Log::info("DeviceStateController: Poller returned", ['success' => $success]);

        } catch (\Throwable $e) {
            Log::error("DeviceStateController: Exception caught", [
                'device_id' => $device->id,
                'channel_id' => $channel,
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => 'Internal server error: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => (int) $channel,
                'debug' => [
                    'file' => $e->getFile(),
                    'line' => $e->getLine()
                ]
            ], 500);
        }

        if ($success) {
            Log::info("DeviceStateController: Returning success response", ['action' => $action]);
            return response()->json([
                'result' => ucfirst($action) . 'ed successfully',
                'status' => 'ok',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => (int) $channel,
                'action' => $action,
                'timestamp' => now()->toISOString()
            ]);
        } else {
            Log::error("DeviceStateController: Returning failure response", ['action' => $action]);
            return response()->json([
                'error' => "Failed to {$action} publishers",
                'status' => 'error',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => (int) $channel,
                'action' => $action,
                'timestamp' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Get publisher name (for compatibility with existing frontend)
     */
    public function getPublisherName(Device $device, string $channelId, string $publisherId): JsonResponse
    {
        $publisher = PublisherState::forChannel($device->id, $channelId)
            ->where('publisher_id', $publisherId)
            ->first();

        if ($publisher && $publisher->name) {
            $name = $publisher->name;
        } else {
            // Fetch name from device if not cached
            $name = $this->poller->fetchPublisherName($device, $channelId, $publisherId);
            
            // Update cache if we got a name
            if ($publisher && $name !== "Publisher {$publisherId}") {
                $publisher->update(['name' => $name]);
            }
        }

        return response()->json([
            'name' => $name,
            'status' => 'ok',
            'device_id' => $device->id,
            'device_ip' => $device->ip,
            'channel' => $channelId,
            'publisher_id' => $publisherId,
            'fetched_at' => now()->toISOString()
        ]);
    }

    /**
     * Get recorder status for device (HTTP fallback for hybrid approach)
     */
    public function getRecorderStatus(Device $device): JsonResponse
    {
        // Get recorder states from database (fast tier updates)
        $recorderStates = $device->recorderStates()
            ->orderBy('recorder_id')
            ->get();

        // Transform database records to match WebSocket format
        $recorders = $recorderStates->map(function ($recorder) {
            return [
                'id' => $recorder->recorder_id,
                'name' => $recorder->name ?? "Recorder {$recorder->recorder_id}",
                'status' => [
                    'state' => $recorder->status ?? 'unknown',
                    'duration' => $recorder->duration,
                    'active' => $recorder->active,
                    'total' => $recorder->total
                ]
            ];
        });

        return response()->json([
            'recorders' => $recorders,
            'status' => 'ok',
            'device_id' => $device->id,
            'device_ip' => $device->ip,
            'fetched_at' => now()->toISOString()
        ]);
    }

    /**
     * Get health overview of all devices
     */
    public function getDevicesHealth(): JsonResponse
    {
        return response()->json($this->poller->getDevicesHealth());
    }

    /**
     * Force poll a specific device
     */
    public function forcePollDevice(Device $device): JsonResponse
    {
        $success = $this->poller->pollDevice($device);

        return response()->json([
            'success' => $success,
            'device_id' => $device->id,
            'device_ip' => $device->ip,
            'timestamp' => now()->toISOString()
        ]);
    }

    /**
     * Enable/disable polling for a device
     */
    public function toggleDevicePolling(Device $device, Request $request): JsonResponse
    {
        $enabled = $request->boolean('enabled');
        
        $deviceState = $device->getOrCreateState();
        $deviceState->update(['polling_enabled' => $enabled]);

        return response()->json([
            'success' => true,
            'polling_enabled' => $enabled,
            'device_id' => $device->id,
            'device_ip' => $device->ip,
            'timestamp' => now()->toISOString()
        ]);
    }
}

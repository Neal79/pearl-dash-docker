<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Response;

class DeviceProxyController extends Controller
{
    /**
     * Get available channels from Pearl Mini device
     */
    public function getChannels(Device $device, Request $request)
    {
        try {
            // Build query parameters for Pearl API
            $params = [
                'publishers' => 'true',
                'publishers-status' => $request->get('status', 'true'),
                'publishers-settings' => $request->get('settings', 'false'),
            ];
            
            // Build the Pearl Mini API URL
            $url = "http://{$device->ip}/api/v2.0/channels?" . http_build_query($params);
            
            // Make the request with basic authentication
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(10)
                ->get($url);
            
            if ($response->successful()) {
                $data = $response->json();
                
                // Transform the response to include metadata
                return response()->json([
                    'channels' => $data['result'] ?? [],
                    'status' => $data['status'] ?? 'unknown',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'fetched_at' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'channels' => [],
                'status' => 'error',
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'fetched_at' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'channels' => [],
                'status' => 'error',
                'error' => 'Failed to fetch channels: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'fetched_at' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Proxy image requests to Pearl Mini devices
     */
    public function getChannelPreview(Device $device, int $channel)
    {
        try {
            // Build the Pearl Mini API URL
            $url = "http://{$device->ip}/api/v2.0/channels/{$channel}/preview";
            
            // Make the request with basic authentication
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(10)
                ->get($url, [
                    'resolution' => 'auto',
                    'keep_aspect_ratio' => 'true',
                    'format' => 'jpg'
                ]);
            
            if ($response->successful()) {
                return response($response->body())
                    ->header('Content-Type', $response->header('Content-Type') ?: 'image/jpeg')
                    ->header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    ->header('Pragma', 'no-cache')
                    ->header('Expires', '0');
            }
            
            return response()->json(['error' => 'Device unreachable'], 503);
            
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch image'], 500);
        }
    }

    /**
     * Get publisher status for a specific channel
     */
    public function getPublisherStatus(Device $device, int $channel)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channel}/publishers/status";
            
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(10)
                ->get($url);
            
            if ($response->successful()) {
                $data = $response->json();
                return response()->json([
                    'publishers' => $data['result'] ?? [],
                    'status' => $data['status'] ?? 'unknown',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'channel' => $channel,
                    'fetched_at' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'publishers' => [],
                'status' => 'error',
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => $channel,
                'fetched_at' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'publishers' => [],
                'status' => 'error',
                'error' => 'Failed to fetch publisher status: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => $channel,
                'fetched_at' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Start all publishers for a specific channel
     */
    public function startPublishers(Device $device, int $channel)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channel}/publishers/control/start";
            
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(15)
                ->post($url);
            
            if ($response->successful()) {
                $data = $response->json();
                return response()->json([
                    'result' => $data['result'] ?? 'Started',
                    'status' => $data['status'] ?? 'ok',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'channel' => $channel,
                    'action' => 'start',
                    'timestamp' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => $channel,
                'action' => 'start',
                'timestamp' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to start publishers: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => $channel,
                'action' => 'start',
                'timestamp' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Stop all publishers for a specific channel
     */
    public function stopPublishers(Device $device, int $channel)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channel}/publishers/control/stop";
            
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(15)
                ->post($url);
            
            if ($response->successful()) {
                $data = $response->json();
                return response()->json([
                    'result' => $data['result'] ?? 'Stopped',
                    'status' => $data['status'] ?? 'ok',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'channel' => $channel,
                    'action' => 'stop',
                    'timestamp' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => $channel,
                'action' => 'stop',
                'timestamp' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to stop publishers: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => $channel,
                'action' => 'stop',
                'timestamp' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Get publisher name for a specific publisher
     */
    public function getPublisherName(Device $device, int $channel, string $publisher)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channel}/publishers/{$publisher}/name";
            
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(10)
                ->get($url);
            
            if ($response->successful()) {
                $data = $response->json();
                return response()->json([
                    'name' => $data['result'] ?? $data['name'] ?? 'Unknown Publisher',
                    'status' => $data['status'] ?? 'ok',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'channel' => $channel,
                    'publisher_id' => $publisher,
                    'fetched_at' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'name' => "Publisher {$publisher}",
                'status' => 'error',
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => $channel,
                'publisher_id' => $publisher,
                'fetched_at' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'name' => "Publisher {$publisher}",
                'status' => 'error',
                'error' => 'Failed to fetch publisher name: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => $channel,
                'publisher_id' => $publisher,
                'fetched_at' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Start individual publisher for a specific channel
     */
    public function startIndividualPublisher(Device $device, string $channel, string $publisher)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channel}/publishers/{$publisher}/control/start";
            
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(15)
                ->post($url);
            
            if ($response->successful()) {
                $data = $response->json();
                return response()->json([
                    'result' => $data['result'] ?? 'Started',
                    'status' => $data['status'] ?? 'ok',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'channel' => (int)$channel,
                    'publisher_id' => $publisher,
                    'action' => 'start',
                    'timestamp' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => (int)$channel,
                'publisher_id' => $publisher,
                'action' => 'start',
                'timestamp' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to start publisher: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => (int)$channel,
                'publisher_id' => $publisher,
                'action' => 'start',
                'timestamp' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Stop individual publisher for a specific channel
     */
    public function stopIndividualPublisher(Device $device, string $channel, string $publisher)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/channels/{$channel}/publishers/{$publisher}/control/stop";
            
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(15)
                ->post($url);
            
            if ($response->successful()) {
                $data = $response->json();
                return response()->json([
                    'result' => $data['result'] ?? 'Stopped',
                    'status' => $data['status'] ?? 'ok',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'channel' => (int)$channel,
                    'publisher_id' => $publisher,
                    'action' => 'stop',
                    'timestamp' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => (int)$channel,
                'publisher_id' => $publisher,
                'action' => 'stop',
                'timestamp' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to stop publisher: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'channel' => (int)$channel,
                'publisher_id' => $publisher,
                'action' => 'stop',
                'timestamp' => now()->toISOString()
            ], 500);
        }
    }
}

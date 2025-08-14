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
     * Proxy HLS stream requests to Pearl Mini devices (Added August 2025)
     * 
     * HLS VIDEO TOGGLE FEATURE:
     * =========================
     * This endpoint enables HLS video streaming as a toggle alternative to static preview images.
     * Users can switch between images and live video with a single click.
     * 
     * PROXY ARCHITECTURE:
     * ==================
     * - Proxies HLS .m3u8 playlist files from Pearl Mini devices through Laravel
     * - Provides authentication layer (devices require Basic Auth)
     * - Handles CORS headers for cross-browser compatibility
     * - Rewrites segment URLs to point back to Laravel proxy (critical for browser access)
     * 
     * URL REWRITING STRATEGY:
     * ======================
     * Pearl devices return playlists with relative segment URLs like "seg_001.ts"
     * These are rewritten to Laravel proxy URLs: "/api/devices/{id}/channels/{channel}/hls/seg_001.ts"
     * This ensures browsers can fetch segments through the same authenticated proxy
     * 
     * BANDWIDTH CONSERVATION:
     * ======================
     * - No caching headers prevent stale streams
     * - Frontend only requests when video mode is active
     * - Streams automatically cleanup when switching back to image mode
     */
    public function getChannelHlsStream(Device $device, int $channel)
    {
        try {
            // HLS OPTIMIZATION: Serve local HLS files generated by audio meter service
            // This eliminates duplicate bandwidth usage - single RTSP stream serves both audio meters AND video
            $hlsFilePath = "/tmp/hls-storage/{$device->ip}/{$channel}/stream.m3u8";
            
            // Check if HLS file exists (generated by audio meter service)
            if (!file_exists($hlsFilePath)) {
                return response()->json([
                    'error' => 'HLS stream not available',
                    'message' => 'Audio meter service must be active to generate HLS streams',
                    'hint' => 'Open audio meters for this device/channel to enable video streaming'
                ], 404);
            }
            
            // Read the HLS playlist file
            $playlist = file_get_contents($hlsFilePath);
            
            if ($playlist === false) {
                return response()->json(['error' => 'Failed to read HLS stream'], 500);
            }
            
            // CRITICAL URL REWRITING: Transform relative segment URLs to Laravel proxy URLs
            // FFmpeg generates relative paths like "seg_001.ts", we need full Laravel proxy paths
            $playlist = preg_replace_callback(
                '/^(.*\.ts)$/m',
                function($matches) use ($device, $channel) {
                    $segment = $matches[1];
                    return "/api/devices/{$device->id}/channels/{$channel}/hls/{$segment}";
                },
                $playlist
            );
            
            return response($playlist)
                ->header('Content-Type', 'application/vnd.apple.mpegurl') // HLS MIME type
                ->header('Cache-Control', 'no-cache, no-store, must-revalidate') // Prevent stale streams
                ->header('Pragma', 'no-cache')
                ->header('Expires', '0')
                ->header('Access-Control-Allow-Origin', '*') // CORS for cross-browser access
                ->header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                ->header('Access-Control-Allow-Headers', 'Range, Content-Range, X-Requested-With');
            
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch HLS stream: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Proxy HLS segment requests to Pearl Mini devices (Added August 2025)
     * 
     * HLS SEGMENT PROXY ARCHITECTURE:
     * ==============================
     * This endpoint proxies individual .ts (MPEG Transport Stream) segment files
     * that make up the actual video content of HLS streams.
     * 
     * SEGMENT WORKFLOW:
     * ================
     * 1. Browser requests playlist from getChannelHlsStream() 
     * 2. Playlist URLs rewritten to point to this Laravel proxy
     * 3. Browser automatically requests each segment via this endpoint
     * 4. Segments proxied from Pearl device with authentication
     * 5. Raw MPEG-TS binary data returned to browser for video playback
     * 
     * CRITICAL ROUTING INTEGRATION:
     * ============================
     * Route definition requires regex constraint: ->where('segment', '.*\.ts')
     * This ensures only .ts files are matched, preventing route conflicts
     * Example URLs: /api/devices/1/channels/0/hls/seg_001.ts
     * 
     * BANDWIDTH OPTIMIZATION:
     * ======================
     * - Shorter timeout (10s vs 30s for playlists) for quick segment delivery
     * - Brief caching (10s max-age) allows browser efficiency without stale data
     * - MPEG-TS content type ensures proper browser video processing
     * - Segments only requested when video is actively playing
     * 
     * SECURITY & CORS:
     * ===============
     * - Authentication handled transparently (browser doesn't see Pearl credentials)
     * - CORS headers enable cross-browser video streaming
     * - Laravel middleware stack provides CSRF protection
     */
    public function getChannelHlsSegment(Device $device, int $channel, string $segment)
    {
        try {
            // HLS OPTIMIZATION: Serve local HLS segment files generated by audio meter service
            // This eliminates duplicate bandwidth usage - segments are generated locally from shared RTSP stream
            $segmentFilePath = "/tmp/hls-storage/{$device->ip}/{$channel}/{$segment}";
            
            // Check if segment file exists (generated by audio meter service)
            if (!file_exists($segmentFilePath)) {
                return response()->json([
                    'error' => 'HLS segment not available',
                    'segment' => $segment,
                    'message' => 'Audio meter service must be active to generate HLS segments'
                ], 404);
            }
            
            // Read the binary segment file
            $segmentData = file_get_contents($segmentFilePath);
            
            if ($segmentData === false) {
                return response()->json(['error' => 'Failed to read HLS segment'], 500);
            }
            
            return response($segmentData)
                ->header('Content-Type', 'video/mp2t') // MPEG-TS content type (binary video data)
                ->header('Cache-Control', 'max-age=10') // Brief cache - balance performance vs freshness
                ->header('Access-Control-Allow-Origin', '*') // CORS for cross-browser compatibility
                ->header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                ->header('Access-Control-Allow-Headers', 'Range, Content-Range, X-Requested-With');
            
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch HLS segment: ' . $e->getMessage()], 500);
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

    /**
     * Get recorder status for all recorders on device
     */
    public function getRecorderStatus(Device $device)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/recorders/status";
            
            $response = Http::withBasicAuth($device->username, $device->password)
                ->timeout(10)
                ->get($url);
            
            if ($response->successful()) {
                $data = $response->json();
                return response()->json([
                    'recorders' => $data['result'] ?? [],
                    'status' => $data['status'] ?? 'unknown',
                    'device_id' => $device->id,
                    'device_ip' => $device->ip,
                    'fetched_at' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'recorders' => [],
                'status' => 'error',
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'fetched_at' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'recorders' => [],
                'status' => 'error',
                'error' => 'Failed to fetch recorder status: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'fetched_at' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Start all recorders on device
     */
    public function startRecorders(Device $device)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/recorders/control/start";
            
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
                    'action' => 'start',
                    'timestamp' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'action' => 'start',
                'timestamp' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to start recorders: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'action' => 'start',
                'timestamp' => now()->toISOString()
            ], 500);
        }
    }

    /**
     * Stop all recorders on device
     */
    public function stopRecorders(Device $device)
    {
        try {
            $url = "http://{$device->ip}/api/v2.0/recorders/control/stop";
            
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
                    'action' => 'stop',
                    'timestamp' => now()->toISOString()
                ]);
            }
            
            return response()->json([
                'error' => 'Device unreachable',
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'action' => 'stop',
                'timestamp' => now()->toISOString()
            ], 503);
            
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Failed to stop recorders: ' . $e->getMessage(),
                'device_id' => $device->id,
                'device_ip' => $device->ip,
                'action' => 'stop',
                'timestamp' => now()->toISOString()
            ], 500);
        }
    }
}

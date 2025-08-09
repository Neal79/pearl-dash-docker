<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Session;
use App\Models\Device;

class DeviceController extends Controller
{
    public function getPreferences(Request $request)
    {
        if (!Session::has('user_id')) {
            Session::put('user_id', uniqid('user_', true));
        }
        $key = 'user_prefs.' . Session::get('user_id');
        return response()->json(Cache::get($key, []));
    }

    public function savePreferences(Request $request)
    {
        if (!Session::has('user_id')) {
            Session::put('user_id', uniqid('user_', true));
        }
        $key = 'user_prefs.' . Session::get('user_id');
        $prefs = $request->validate([
            'selectedChannels' => 'required|array',
            'selectedChannels.*' => 'required|array:deviceId,channel',
        ]);
        
        Cache::forever($key, $prefs);
        return response()->json(['status' => 'success']);
    }

    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        //
        return Device::orderBy('id')->get();
    }

    /**
     * Store a newly created resource in storage.
     * 
     * POLLING ARCHITECTURE FOR FUTURE CLAUDE ITERATIONS:
     * ==================================================
     * 
     * This method implements IMMEDIATE SYNCHRONOUS POLLING for optimal UX.
     * When a user adds a new Pearl device, they expect to see channels and 
     * publishers immediately, not after waiting 30+ seconds for background jobs.
     * 
     * FLOW:
     * 1. Validate and create Device record in database
     * 2. Immediately initialize device state (creates DeviceState record)
     * 3. Immediately poll Pearl device API to get channels/publishers 
     * 4. Store channel/publisher data in database (DeviceState.channels_data, PublisherState records)
     * 5. Return device with polling status for frontend feedback
     * 
     * TIMING:
     * - Total response time: ~1-2 seconds (includes Pearl API call)
     * - Frontend sees data: Immediately after device creation
     * - Fallback: Frontend has aggressive retry/polling if this fails
     * 
     * ERROR HANDLING:
     * - Device creation NEVER fails due to polling issues
     * - Polling errors are logged but don't affect device creation
     * - Frontend will retry if initial polling fails
     * 
     * FUTURE FEATURES:
     * When adding new device types or initialization steps:
     * 1. Add new initialization logic to PearlDevicePoller::initializeDevice()
     * 2. Add new polling logic to PearlDevicePoller::pollDevice()
     * 3. Keep this synchronous pattern for immediate UX
     * 4. Add new fields to response for frontend feedback if needed
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'ip'       => 'required|ip|unique:devices,ip',
            'name'     => 'nullable|string|max:100',
            'username' => 'required|string|max:100',
            'password' => 'required|string|max:100',
        ]);
        
        $device = Device::create($data);
        
        // CRITICAL: Immediate polling for instant UX
        // This makes device creation feel instant to users by populating
        // all channel/publisher data before the API response returns
        try {
            $poller = app(\App\Services\PearlDevicePoller::class);
            
            // Step 1: Initialize device state (creates DeviceState record with polling enabled)
            $poller->initializeDevice($device);
            
            // Step 2: Poll Pearl device immediately to get channels/publishers
            // This populates: DeviceState.channels_data and PublisherState records
            $success = $poller->pollDevice($device);
            
            // Step 3: Add polling feedback to response for frontend
            $device->polling_initialized = true;
            $device->polling_success = $success;
            
        } catch (\Exception $e) {
            // IMPORTANT: Never fail device creation due to polling issues
            // Users can always manually refresh or wait for background polling
            error_log("Failed to initialize polling for device {$device->ip}: " . $e->getMessage());
            $device->polling_initialized = false;
            $device->polling_success = false;
        }
        
        return $device;
    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Device $device)
    {
        $device->delete();
        return response()->noContent();
    }
}

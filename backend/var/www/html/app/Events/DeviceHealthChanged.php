<?php

namespace App\Events;

use App\Models\Device;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Device Health Changed Event
 * 
 * Fired when device connectivity or health status changes
 * Used by the real-time WebSocket service to push device status updates
 */
class DeviceHealthChanged
{
    use Dispatchable, SerializesModels;

    public Device $device;
    public string $status;
    public ?string $errorMessage;
    public int $errorCount;
    public \DateTime $lastSeen;
    public string $changeHash;
    public \DateTime $timestamp;

    public function __construct(Device $device, string $status, ?string $errorMessage = null, int $errorCount = 0, ?\DateTime $lastSeen = null)
    {
        $this->device = $device;
        $this->status = $status;
        $this->errorMessage = $errorMessage;
        $this->errorCount = $errorCount;
        $this->lastSeen = $lastSeen ?? now();
        $this->changeHash = $this->generateChangeHash();
        $this->timestamp = now();
    }

    /**
     * Generate a hash of the device health data for change detection
     */
    private function generateChangeHash(): string
    {
        $healthData = [
            'status' => $this->status,
            'error_count' => $this->errorCount,
            'has_error' => !empty($this->errorMessage),
        ];
        
        return md5(json_encode($healthData, 64)); // JSON_SORT_KEYS = 64
    }

    /**
     * Convert event to array format for WebSocket service
     */
    public function toArray(): array
    {
        return [
            'type' => 'device_health',
            'device' => $this->device->ip,
            'device_id' => $this->device->id,
            'data' => [
                'status' => $this->status,
                'error_message' => $this->errorMessage,
                'error_count' => $this->errorCount,
                'last_seen' => $this->lastSeen->toISOString(),
                'device_id' => $this->device->id,
                'device_ip' => $this->device->ip,
                'device_name' => $this->device->name,
            ],
            'timestamp' => $this->timestamp->toISOString(),
            'changeHash' => $this->changeHash,
        ];
    }
}
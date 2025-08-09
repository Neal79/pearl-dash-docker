<?php

namespace App\Events;

use App\Models\Device;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Publisher Status Changed Event
 * 
 * Fired when publisher streaming status changes (start/stop/error states)
 * Used by the real-time WebSocket service to push immediate updates to clients
 */
class PublisherStatusChanged
{
    use Dispatchable, SerializesModels;

    public Device $device;
    public int $channel;
    public array $publishers;
    public array $changes;
    public string $changeHash;
    public \DateTime $timestamp;

    public function __construct(Device $device, int $channel, array $publishers, array $changes = [])
    {
        $this->device = $device;
        $this->channel = $channel;
        $this->publishers = $publishers;
        $this->changes = $changes;
        $this->changeHash = $this->generateChangeHash($publishers);
        $this->timestamp = now();
    }

    /**
     * Generate a hash of the publisher data for change detection
     */
    private function generateChangeHash(array $publishers): string
    {
        // Only hash the critical status fields to detect meaningful changes
        $statusData = [];
        foreach ($publishers as $publisher) {
            $statusData[] = [
                'id' => $publisher['id'] ?? null,
                'started' => $publisher['status']['started'] ?? false,
                'state' => $publisher['status']['state'] ?? 'unknown',
                'is_configured' => $publisher['status']['is_configured'] ?? false,
            ];
        }
        
        return md5(json_encode($statusData, 64)); // JSON_SORT_KEYS = 64
    }

    /**
     * Convert event to array format for WebSocket service
     */
    public function toArray(): array
    {
        return [
            'type' => 'publisher_status',
            'device' => $this->device->ip,
            'device_id' => $this->device->id,
            'channel' => $this->channel,
            'data' => [
                'publishers' => $this->publishers,
                'changes' => $this->changes,
                'device_id' => $this->device->id,
                'device_ip' => $this->device->ip,
                'channel' => $this->channel,
                'fetched_at' => $this->timestamp->toISOString(),
            ],
            'timestamp' => $this->timestamp->toISOString(),
            'changeHash' => $this->changeHash,
        ];
    }
}
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PublisherState extends Model
{
    protected $fillable = [
        'device_id',
        'channel_id',
        'publisher_id',
        'name',
        'type',
        'is_configured',
        'started',
        'state',
        'last_updated',
    ];

    protected $casts = [
        'is_configured' => 'boolean',
        'started' => 'boolean',
        'last_updated' => 'datetime',
    ];

    /**
     * Get the device that owns this publisher state
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    /**
     * Get the device state for this publisher
     */
    public function deviceState(): BelongsTo
    {
        return $this->belongsTo(DeviceState::class, 'device_id', 'device_id');
    }

    /**
     * Check if publisher is currently streaming
     */
    public function isStreaming(): bool
    {
        return $this->started && $this->state === 'started';
    }

    /**
     * Check if publisher is in a transition state
     */
    public function isTransitioning(): bool
    {
        return in_array($this->state, ['starting', 'stopping']);
    }

    /**
     * Get status color for UI
     */
    public function getStatusColor(): string
    {
        if (!$this->is_configured) {
            return 'grey';
        }
        
        return match($this->state) {
            'started' => 'success',
            'starting', 'stopping' => 'warning',
            'stopped' => $this->is_configured ? 'error' : 'grey',
            default => 'grey'
        };
    }

    /**
     * Get human-readable status text
     */
    public function getStatusText(): string
    {
        return match($this->state) {
            'started' => 'Streaming',
            'starting' => 'Starting...',
            'stopping' => 'Stopping...',
            'stopped' => $this->is_configured ? 'Stopped' : 'Not Configured',
            default => 'Unknown'
        };
    }

    /**
     * Update publisher state from API data
     */
    public function updateFromApiData(array $data): void
    {
        $this->update([
            'name' => $data['name'] ?? $this->name,
            'type' => $data['type'] ?? $this->type,
            'is_configured' => $data['status']['is_configured'] ?? false,
            'started' => $data['status']['started'] ?? false,
            'state' => $data['status']['state'] ?? 'stopped',
            'last_updated' => now(),
        ]);
    }

    /**
     * Scope to get publishers for a specific channel
     */
    public function scopeForChannel($query, int $deviceId, string $channelId)
    {
        return $query->where('device_id', $deviceId)
                    ->where('channel_id', $channelId);
    }

    /**
     * Scope to get only streaming publishers
     */
    public function scopeStreaming($query)
    {
        return $query->where('started', true)
                    ->where('state', 'started');
    }
}

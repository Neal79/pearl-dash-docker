<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeviceState extends Model
{
    protected $fillable = [
        'device_id',
        'last_seen',
        'status',
        'error_count',
        'error_message',
        'channels_data',
        'polling_enabled',
        'next_poll_at',
    ];

    protected $casts = [
        'last_seen' => 'datetime',
        'next_poll_at' => 'datetime',
        'channels_data' => 'array',
        'polling_enabled' => 'boolean',
        'error_count' => 'integer',
    ];

    /**
     * Get the device that owns this state
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    /**
     * Get all publisher states for this device
     */
    public function publisherStates(): HasMany
    {
        return $this->hasMany(PublisherState::class, 'device_id', 'device_id');
    }

    /**
     * Check if the device is currently connected
     */
    public function isConnected(): bool
    {
        return $this->status === 'connected';
    }

    /**
     * Check if the device should be polled now
     */
    public function shouldPoll(): bool
    {
        return $this->polling_enabled && 
               ($this->next_poll_at === null || $this->next_poll_at <= now());
    }

    /**
     * Mark device as connected and reset error count
     */
    public function markConnected(): void
    {
        $this->update([
            'status' => 'connected',
            'last_seen' => now(),
            'error_count' => 0,
            'error_message' => null,
        ]);
    }

    /**
     * Mark device as having an error and increment error count
     */
    public function markError(string $message): void
    {
        $this->increment('error_count');
        $this->update([
            'status' => 'error',
            'error_message' => $message,
        ]);
    }

    /**
     * Set next poll time based on current status and error count
     */
    public function setNextPollTime(): void
    {
        $baseInterval = 30; // 30 seconds base interval
        
        // Exponential backoff for errors (max 5 minutes)
        if ($this->error_count > 0) {
            $backoffMultiplier = min(10, pow(2, $this->error_count - 1));
            $interval = $baseInterval * $backoffMultiplier;
        } else {
            $interval = $baseInterval;
        }
        
        $this->update([
            'next_poll_at' => now()->addSeconds($interval)
        ]);
    }
}

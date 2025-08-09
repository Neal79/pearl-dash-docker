<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Device extends Model
{
    // Allow mass‑assignment of these fields
    protected $fillable = [
        'ip',
        'name',
        'username',
        'password',
    ];

    /**
     * Get the device state for this device
     */
    public function deviceState(): HasOne
    {
        return $this->hasOne(DeviceState::class);
    }

    /**
     * Get all publisher states for this device
     */
    public function publisherStates(): HasMany
    {
        return $this->hasMany(PublisherState::class);
    }

    /**
     * Get or create device state
     */
    public function getOrCreateState(): DeviceState
    {
        return $this->deviceState()->firstOrCreate([
            'device_id' => $this->id
        ]);
    }
}

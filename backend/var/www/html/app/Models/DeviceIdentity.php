<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeviceIdentity extends Model
{
    protected $table = 'device_identity';
    
    protected $fillable = [
        'device_id',
        'name',
        'location', 
        'description',
        'last_updated'
    ];

    protected $casts = [
        'last_updated' => 'datetime',
    ];

    /**
     * Get the device that owns this identity
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}

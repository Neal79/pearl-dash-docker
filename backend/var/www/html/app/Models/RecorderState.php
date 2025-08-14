<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecorderState extends Model
{
    protected $fillable = [
        'device_id',
        'recorder_id', 
        'name',
        'state',
        'description',
        'duration',
        'active',
        'total',
        'multisource',
        'last_updated'
    ];

    protected $casts = [
        'multisource' => 'boolean',
        'duration' => 'integer',
        'last_updated' => 'datetime',
    ];

    /**
     * Get the device that owns this recorder state
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}

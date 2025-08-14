<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SystemStatus extends Model
{
    protected $table = 'system_status';
    
    protected $fillable = [
        'device_id',
        'device_date',
        'uptime',
        'cpuload',
        'cpuload_high', 
        'cputemp',
        'cputemp_threshold',
        'last_updated'
    ];

    protected $casts = [
        'device_date' => 'datetime',
        'uptime' => 'integer',
        'cpuload' => 'integer', 
        'cpuload_high' => 'boolean',
        'cputemp' => 'integer',
        'cputemp_threshold' => 'integer',
        'last_updated' => 'datetime',
    ];

    /**
     * Get the device that owns this system status
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}

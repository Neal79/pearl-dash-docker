<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('system_status', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->onDelete('cascade');
            $table->timestamp('device_date')->nullable(); // Current system time from Pearl device
            $table->integer('uptime')->nullable(); // Time since last reboot in seconds
            $table->integer('cpuload')->nullable(); // Percentage of CPU load (0-100)
            $table->boolean('cpuload_high')->default(false); // Indicator of high CPU load
            $table->integer('cputemp')->nullable(); // CPU temperature in degrees Celsius
            $table->integer('cputemp_threshold')->nullable(); // Temperature threshold for high CPU temp
            $table->timestamp('last_updated')->nullable();
            $table->timestamps();
            
            // Indexes for performance
            $table->index('device_id');
            $table->index('cpuload_high'); // For monitoring high CPU alerts
            $table->index(['device_id', 'created_at']); // For historical data queries
            
            // Note: No unique constraint here since we want historical system status records
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_status');
    }
};

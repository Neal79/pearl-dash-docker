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
        Schema::create('realtime_events_cache', function (Blueprint $table) {
            $table->id();
            $table->string('event_id', 64)->unique()->index();
            $table->string('type', 50)->index(); // publisher_status, device_health, etc.
            $table->string('device', 15)->index(); // IP address
            $table->integer('channel')->nullable()->index();
            $table->string('publisher_id', 50)->nullable()->index();
            $table->json('data'); // Event data payload
            $table->string('change_hash', 32)->index(); // For deduplication
            $table->timestamp('event_timestamp'); // When the event occurred
            $table->timestamp('created_at'); // When stored in cache
            
            // Composite indexes for efficient queries
            $table->index(['type', 'device']);
            $table->index(['device', 'channel']);
            $table->index(['type', 'device', 'channel']);
            $table->index(['event_timestamp', 'type']);
            $table->index(['created_at']); // For cleanup queries
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('realtime_events_cache');
    }
};
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
        Schema::create('device_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->onDelete('cascade');
            $table->timestamp('last_seen')->nullable();
            $table->enum('status', ['connected', 'error', 'timeout', 'unreachable'])->default('unreachable');
            $table->integer('error_count')->default(0);
            $table->text('error_message')->nullable();
            $table->json('channels_data')->nullable();
            $table->boolean('polling_enabled')->default(true);
            $table->timestamp('next_poll_at')->nullable();
            $table->timestamps();
            
            // Indexes for performance
            $table->index('device_id');
            $table->index('status');
            $table->index('next_poll_at');
            
            // Unique constraint - one state per device
            $table->unique('device_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('device_states');
    }
};

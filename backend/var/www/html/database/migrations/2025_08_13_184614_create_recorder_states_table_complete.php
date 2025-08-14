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
        Schema::create('recorder_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->onDelete('cascade');
            $table->string('recorder_id'); // Pearl API recorder ID (e.g., "1", "2", "3")
            $table->string('name')->nullable(); // Human-readable recorder name
            $table->enum('state', ['disabled', 'starting', 'started', 'stopped', 'error'])->default('stopped');
            $table->text('description')->nullable(); // Error description if state is 'error'
            $table->integer('duration')->nullable(); // Recording duration in seconds
            $table->string('active')->nullable(); // Number of active recordings
            $table->string('total')->nullable(); // Total number of recordings
            $table->boolean('multisource')->default(false); // Whether recorder supports multi-source
            $table->timestamp('last_updated')->nullable();
            $table->timestamps();
            
            // Indexes for performance
            $table->index(['device_id', 'recorder_id']);
            $table->index('state');
            
            // Unique constraint - one state per device/recorder combination
            $table->unique(['device_id', 'recorder_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('recorder_states');
    }
};

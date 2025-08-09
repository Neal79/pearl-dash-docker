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
        Schema::create('publisher_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->onDelete('cascade');
            $table->string('channel_id');
            $table->string('publisher_id');
            $table->string('name')->nullable();
            $table->string('type')->nullable();
            $table->boolean('is_configured')->default(false);
            $table->boolean('started')->default(false);
            $table->enum('state', ['stopped', 'starting', 'started', 'stopping'])->default('stopped');
            $table->timestamp('last_updated')->nullable();
            $table->timestamps();
            
            // Indexes for performance  
            $table->index(['device_id', 'channel_id']);
            $table->index(['device_id', 'channel_id', 'publisher_id']);
            $table->index('state');
            
            // Unique constraint - one state per device/channel/publisher combination
            $table->unique(['device_id', 'channel_id', 'publisher_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('publisher_states');
    }
};

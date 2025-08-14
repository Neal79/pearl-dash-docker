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
        Schema::create('device_identity', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->onDelete('cascade');
            $table->string('name', 50)->nullable(); // Device name (max 50 chars per API spec)
            $table->string('location', 50)->nullable(); // Device location (max 50 chars per API spec)
            $table->string('description', 50)->nullable(); // Device description (max 50 chars per API spec)
            $table->timestamp('last_updated')->nullable();
            $table->timestamps();
            
            // Indexes for performance
            $table->index('device_id');
            
            // Unique constraint - one identity per device
            $table->unique('device_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('device_identity');
    }
};

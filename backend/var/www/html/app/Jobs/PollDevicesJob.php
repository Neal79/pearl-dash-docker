<?php

namespace App\Jobs;

use App\Services\PearlDevicePoller;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class PollDevicesJob implements ShouldQueue
{
    use Queueable;

    /**
     * The number of times the job may be attempted.
     */
    public int $tries = 3;

    /**
     * The maximum number of unhandled exceptions to allow before failing.
     */
    public int $maxExceptions = 1;

    /**
     * The number of seconds the job can run before timing out.
     */
    public int $timeout = 300; // 5 minutes

    /**
     * Create a new job instance.
     */
    public function __construct()
    {
        // Set queue priority
        $this->onQueue('polling');
    }

    /**
     * Execute the job.
     */
    public function handle(PearlDevicePoller $poller): void
    {
        Log::info('PollDevicesJob: Starting device polling cycle');
        
        try {
            $results = $poller->pollDueDevices();
            
            Log::info('PollDevicesJob: Polling cycle completed', $results);
            
            // Schedule next polling cycle using configurable interval
            $pollInterval = (int) config('app.pearl_poll_interval', 3);
            dispatch(new PollDevicesJob())->delay(now()->addSeconds($pollInterval));
            
        } catch (\Exception $e) {
            Log::error('PollDevicesJob: Critical error during polling cycle: ' . $e->getMessage());
            
            // Still schedule next cycle to maintain continuous polling
            dispatch(new PollDevicesJob())->delay(now()->addMinutes(1));
            
            throw $e; // Re-throw to mark job as failed
        }
    }

    /**
     * Handle a job failure.
     */
    public function failed(\Throwable $exception): void
    {
        Log::error('PollDevicesJob: Job failed permanently: ' . $exception->getMessage());
        
        // Schedule recovery job after longer delay
        dispatch(new PollDevicesJob())->delay(now()->addMinutes(5));
    }
}

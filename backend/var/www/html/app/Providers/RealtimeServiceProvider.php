<?php

namespace App\Providers;

use App\Services\RealtimeEventStore;
use App\Services\PearlDevicePoller;
use Illuminate\Support\ServiceProvider;

class RealtimeServiceProvider extends ServiceProvider
{
    /**
     * Register services.
     */
    public function register(): void
    {
        // Register RealtimeEventStore as singleton
        $this->app->singleton(RealtimeEventStore::class, function ($app) {
            return new RealtimeEventStore();
        });

        // Register PearlDevicePoller with RealtimeEventStore dependency
        $this->app->bind(PearlDevicePoller::class, function ($app) {
            return new PearlDevicePoller($app->make(RealtimeEventStore::class));
        });
    }

    /**
     * Bootstrap services.
     */
    public function boot(): void
    {
        //
    }
}

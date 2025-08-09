<?php

namespace App\Console\Commands;

use App\Jobs\PollDevicesJob;
use App\Models\Device;
use App\Services\PearlDevicePoller;
use Illuminate\Console\Command;

class PollDevicesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'devices:poll 
                           {--once : Run polling once instead of starting continuous polling}
                           {--device= : Poll specific device ID only}
                           {--init : Initialize polling for all devices}
                           {--status : Show device polling status}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Poll Pearl Mini devices for channel and publisher status';

    /**
     * Execute the console command.
     */
    public function handle(PearlDevicePoller $poller): int
    {
        if ($this->option('status')) {
            return $this->showStatus($poller);
        }

        if ($this->option('init')) {
            return $this->initializeDevices($poller);
        }

        if ($this->option('device')) {
            return $this->pollSpecificDevice($poller, (int) $this->option('device'));
        }

        if ($this->option('once')) {
            return $this->pollOnce($poller);
        }

        return $this->startContinuousPolling();
    }

    /**
     * Show device polling status
     */
    private function showStatus(PearlDevicePoller $poller): int
    {
        $this->info('Device Polling Status');
        $this->line('=====================');

        $health = $poller->getDevicesHealth();

        $this->table([
            'Total', 'Connected', 'Error', 'Timeout', 'Unreachable'
        ], [[
            $health['total_devices'],
            $health['connected'],
            $health['error'], 
            $health['timeout'],
            $health['unreachable']
        ]]);

        if (!empty($health['devices'])) {
            $this->line('');
            $this->info('Device Details:');
            
            $deviceRows = [];
            foreach ($health['devices'] as $device) {
                $deviceRows[] = [
                    $device['id'],
                    $device['ip'],
                    $device['name'] ?: 'N/A',
                    $device['status'],
                    $device['last_seen'] ? \Carbon\Carbon::parse($device['last_seen'])->diffForHumans() : 'Never',
                    $device['error_count'],
                    substr($device['error_message'] ?? '', 0, 50)
                ];
            }

            $this->table([
                'ID', 'IP', 'Name', 'Status', 'Last Seen', 'Errors', 'Last Error'
            ], $deviceRows);
        }

        return 0;
    }

    /**
     * Initialize polling for all devices
     */
    private function initializeDevices(PearlDevicePoller $poller): int
    {
        $devices = Device::all();
        
        $this->info("Initializing polling for {$devices->count()} devices...");
        
        $bar = $this->output->createProgressBar($devices->count());
        $bar->start();

        foreach ($devices as $device) {
            $poller->initializeDevice($device);
            $bar->advance();
        }

        $bar->finish();
        $this->line('');
        $this->info('All devices initialized for polling');

        return 0;
    }

    /**
     * Poll a specific device
     */
    private function pollSpecificDevice(PearlDevicePoller $poller, int $deviceId): int
    {
        $device = Device::find($deviceId);
        
        if (!$device) {
            $this->error("Device with ID {$deviceId} not found");
            return 1;
        }

        $this->info("Polling device {$device->ip} ({$device->name})...");

        if ($poller->pollDevice($device)) {
            $this->info('Device polled successfully');
            return 0;
        } else {
            $this->error('Failed to poll device');
            return 1;
        }
    }

    /**
     * Run polling once for all due devices
     */
    private function pollOnce(PearlDevicePoller $poller): int
    {
        $this->info('Running device polling cycle...');

        $results = $poller->pollDueDevices();

        $this->table([
            'Polled', 'Successful', 'Failed', 'Skipped'
        ], [[
            $results['polled'],
            $results['successful'], 
            $results['failed'],
            $results['skipped']
        ]]);

        if (!empty($results['errors'])) {
            $this->line('');
            $this->error('Errors encountered:');
            foreach ($results['errors'] as $error) {
                $this->line("Device {$error['device_ip']}: {$error['error']}");
            }
        }

        return $results['failed'] > 0 ? 1 : 0;
    }

    /**
     * Start continuous polling using queue system
     */
    private function startContinuousPolling(): int
    {
        $this->info('Starting continuous device polling...');
        $this->line('This will dispatch background jobs to poll devices every 5 seconds for ultra-fast real-time data.');
        $this->line('Make sure your queue worker is running: php artisan queue:work');

        // Dispatch initial job
        dispatch(new PollDevicesJob());

        $this->info('Polling job dispatched. Monitor with: php artisan queue:monitor');
        
        return 0;
    }
}

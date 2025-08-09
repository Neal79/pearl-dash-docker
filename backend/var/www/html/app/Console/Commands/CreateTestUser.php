<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class CreateTestUser extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'create:test-user';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Create production users with specific passwords for Docker environment';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        // Define specific users with their passwords
        $users = [
            [
                'name' => 'Neal',
                'email' => 'neal@nealslab.com',
                'password' => 'password123'  // Change this to your preferred password
            ],
            [
                'name' => 'Ves',
                'email' => 'ves@example.com',
                'password' => 'vespass456'   // Change this to your preferred password
            ],
            [
                'name' => 'Pearl Admin',
                'email' => 'admin@pearl-dashboard.com',
                'password' => 'admin789' // Change this to your preferred password
            ]
        ];

        $this->info("Creating specific users...");

        foreach ($users as $userData) {
            // Delete existing user if exists
            User::where('email', $userData['email'])->delete();
            
            // Create user with specific password
            $user = User::create([
                'name' => $userData['name'],
                'email' => $userData['email'],
                'password' => Hash::make($userData['password']),
                'email_verified_at' => now(),
            ]);

            $this->info("✅ Created user: {$userData['email']} / {$userData['password']}");
        }

        $this->info("\n🎉 All users created successfully!");
        $this->warn("📝 Login credentials:");
        foreach ($users as $userData) {
            $this->line("   • {$userData['email']} / {$userData['password']}");
        }
        
        return 0;
    }
}

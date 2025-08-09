<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class FixUserPasswords extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'user:fix-passwords';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Fix password hashes for existing users in Docker environment';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $users = User::all();
        
        $this->info("Found {$users->count()} users to fix...");
        
        foreach ($users as $user) {
            // Skip the test user we just created
            if ($user->email === 'admin@pearl-dashboard.com') {
                $this->line("Skipping test user: {$user->email}");
                continue;
            }
            
            // Set a default password for migrated users (you can customize this)
            $defaultPassword = 'password123'; // Change this to whatever you prefer
            
            $user->password = Hash::make($defaultPassword);
            $user->save();
            
            $this->info("Fixed password for user: {$user->email} (password: {$defaultPassword})");
        }
        
        $this->info("All user passwords have been fixed!");
        $this->warn("Default password set to: password123");
        $this->warn("Make sure to change passwords after first login!");
        
        return 0;
    }
}

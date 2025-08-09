<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Demo Users for Pearl Dashboard
        User::factory()->create([
            'name' => 'Neal',
            'email' => 'neal@nealslab.com',
            'password' => bcrypt('ds75019'),
        ]);

        User::factory()->create([
            'name' => 'Ves',
            'email' => 'ves@example.com', 
            'password' => bcrypt('ds75019'),
        ]);
    }
}

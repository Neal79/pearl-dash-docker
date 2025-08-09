<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;
use Inertia\Inertia;

class UserController extends Controller
{
    /**
     * Show the add user form.
     */
    public function create()
    {
        return Inertia::render('AddUser');
    }

    /**
     * Handle a user creation request.
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|lowercase|email|max:255|unique:'.User::class,
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        try {
            $user = User::create([
                'name' => $request->name,
                'email' => $request->email,
                'password' => Hash::make($request->password),
            ]);

            return back()->with('success', 'User created successfully!');
            
        } catch (\Exception $e) {
            \Log::error('User creation failed: ' . $e->getMessage());
            
            return back()->withErrors([
                'general' => 'Failed to create user. Please try again.'
            ])->withInput($request->except('password', 'password_confirmation'));
        }
    }
}
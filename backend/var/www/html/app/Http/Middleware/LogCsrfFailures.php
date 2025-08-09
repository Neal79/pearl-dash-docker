<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Illuminate\Session\TokenMismatchException;

class LogCsrfFailures
{
    /**
     * Handle an incoming request and log CSRF failures.
     */
    public function handle(Request $request, Closure $next): Response
    {
        try {
            return $next($request);
        } catch (TokenMismatchException $e) {
            // Log detailed CSRF failure information
            \Log::error('CSRF Token Mismatch', [
                'url' => $request->fullUrl(),
                'method' => $request->method(),
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'session_token' => $request->session()->token(),
                'form_token' => $request->input('_token'),
                'header_token' => $request->header('X-CSRF-TOKEN'),
                'session_id' => $request->session()->getId(),
                'headers' => $request->headers->all(),
            ]);
            
            throw $e;
        }
    }
}
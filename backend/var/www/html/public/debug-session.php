<?php

// Simple test file to debug session and cookies
$sessionId = session_id();
$sessionData = session()->all();
$cookies = $_COOKIE;
$headers = getallheaders();

header('Content-Type: application/json');
echo json_encode([
    'session_id' => $sessionId,
    'session_data' => $sessionData,
    'cookies_received' => array_keys($cookies),
    'auth_header' => $headers['Authorization'] ?? 'not_present',
    'csrf_header' => $headers['X-CSRF-TOKEN'] ?? 'not_present',
    'user_authenticated' => auth()->check(),
    'user_id' => auth()->id(),
    'timestamp' => date('Y-m-d H:i:s')
], JSON_PRETTY_PRINT);

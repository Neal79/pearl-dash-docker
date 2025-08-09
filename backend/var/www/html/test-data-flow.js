#!/usr/bin/env node

// Test script to verify complete data flow from Node.js polling → Laravel → WebSocket → Frontend
// This script will monitor all components simultaneously

import WebSocket from 'ws';
import https from 'https';
import fs from 'fs';

// Configuration
const WEBSOCKET_URL = 'wss://192.168.43.5/ws/realtime';  // Through nginx proxy at /ws/realtime
const LARAVEL_EVENTS_URL = 'https://192.168.43.5/api/internal/realtime/events';

// Test function to monitor WebSocket connection
function monitorWebSocket() {
    console.log('🔌 Connecting to WebSocket service...');
    
    const ws = new WebSocket(WEBSOCKET_URL, {
        rejectUnauthorized: false // Accept self-signed certificates
    });

    ws.on('open', function open() {
        console.log('✅ Connected to WebSocket service');
        
        // Send authentication if needed
        const authMessage = {
            type: 'auth',
            token: 'test-token' // We'll see what happens
        };
        ws.send(JSON.stringify(authMessage));
    });

    ws.on('message', function message(data) {
        console.log('📦 WebSocket received:', data.toString());
        
        try {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === 'device_update' || parsed.type === 'publisher_update') {
                console.log('🎯 REALTIME UPDATE RECEIVED!', parsed);
            }
        } catch (e) {
            console.log('📝 WebSocket raw message:', data.toString());
        }
    });

    ws.on('error', function error(err) {
        console.log('❌ WebSocket error:', err.message);
    });

    ws.on('close', function close() {
        console.log('🔌 WebSocket connection closed');
    });

    return ws;
}

// Test function to send a fake event to Laravel
function sendTestEvent() {
    const postData = JSON.stringify({
        device: '309',           // Laravel expects 'device' not 'device_id'
        type: 'device_health',
        data: {
            status: 'online',
            timestamp: Date.now(),
            test: true
        },
        source: 'test-script'
    });

    const options = {
        hostname: '192.168.43.5',
        port: 443,
        path: '/api/internal/realtime/events',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        },
        rejectUnauthorized: false
    };

    console.log('📤 Sending test event to Laravel...');
    
    const req = https.request(options, (res) => {
        console.log(`📥 Laravel responded: ${res.statusCode}`);
        
        let responseData = '';
        res.on('data', (chunk) => {
            responseData += chunk;
        });
        
        res.on('end', () => {
            console.log('📄 Laravel response:', responseData);
        });
    });

    req.on('error', (e) => {
        console.error('❌ Error sending to Laravel:', e.message);
    });

    req.write(postData);
    req.end();
}

// Main test sequence
console.log('🚀 Starting end-to-end data flow test...');
console.log('📊 This will monitor:');
console.log('   1. WebSocket connection to realtime service');
console.log('   2. Send test event to Laravel');
console.log('   3. Watch for realtime broadcast to frontend');
console.log('');

// Start monitoring
const ws = monitorWebSocket();

// After 2 seconds, send a test event
setTimeout(() => {
    sendTestEvent();
}, 2000);

// After 5 seconds, send another test event
setTimeout(() => {
    console.log('📤 Sending second test event...');
    sendTestEvent();
}, 5000);

// Keep running for 15 seconds
setTimeout(() => {
    console.log('⏰ Test complete. Closing connection...');
    ws.close();
    process.exit(0);
}, 15000);

console.log('⏳ Monitoring for 15 seconds...');

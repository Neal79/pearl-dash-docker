// Debug script to show exactly what endpoint the realtime service is trying to call
import { URL } from 'url';
import http from 'http';
import https from 'https';

console.log('=== REALTIME SERVICE ENDPOINT DEBUG ===');
console.log('Environment Variables:');
console.log('REALTIME_BACKEND_ENDPOINT:', process.env.REALTIME_BACKEND_ENDPOINT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('REALTIME_SERVICE_KEY:', process.env.REALTIME_SERVICE_KEY);

// Simulate the exact same logic as the service
const BACKEND_EVENT_ENDPOINT = process.env.REALTIME_BACKEND_ENDPOINT || 'https://localhost/api/internal/realtime/events';

console.log('\n=== ENDPOINT RESOLUTION ===');
console.log('Final endpoint to be used:', BACKEND_EVENT_ENDPOINT);

try {
    const url = new URL(BACKEND_EVENT_ENDPOINT);
    console.log('Parsed URL components:');
    console.log('  Protocol:', url.protocol);
    console.log('  Hostname:', url.hostname);
    console.log('  Port:', url.port || (url.protocol === 'https:' ? 443 : 80));
    console.log('  Path:', url.pathname + url.search);
    
    // Test what client will be used
    const client = url.protocol === 'https:' ? https : http;
    console.log('  Client type:', url.protocol === 'https:' ? 'HTTPS' : 'HTTP');
    
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'RealTimeDataService/2.0 (Performance-Optimized)',
            'Connection': 'keep-alive',
            'X-Service-Key': process.env.REALTIME_SERVICE_KEY || 'default-service-key'
        },
        timeout: 8000,
        rejectUnauthorized: url.hostname !== 'localhost' && url.hostname !== '127.0.0.1'
    };
    
    console.log('\n=== REQUEST OPTIONS ===');
    console.log('Full request options:', JSON.stringify(options, null, 2));
    
    console.log('\n=== MAKING TEST REQUEST ===');
    const startTime = Date.now();
    
    const req = client.request(options, (res) => {
        const responseTime = Date.now() - startTime;
        console.log(`Response Status: ${res.statusCode} ${res.statusMessage} (${responseTime}ms)`);
        console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
        
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log('Response Body:', data);
            console.log('Response Length:', data.length);
            console.log('\n✅ TEST COMPLETED SUCCESSFULLY');
            process.exit(0);
        });
    });
    
    req.on('error', (err) => {
        console.log('\n❌ REQUEST ERROR:');
        console.log('Error code:', err.code);
        console.log('Error message:', err.message);
        console.log('Error stack:', err.stack);
        process.exit(1);
    });
    
    req.on('timeout', () => {
        console.log('\n⏱️ REQUEST TIMEOUT');
        req.destroy();
        process.exit(1);
    });
    
    req.end();
    
} catch (error) {
    console.log('\n❌ URL PARSING ERROR:');
    console.log('Error:', error.message);
    process.exit(1);
}

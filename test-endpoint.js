const http = require('http');

console.log('Testing endpoint: http://nginx/api/internal/realtime/events');

const req = http.get('http://nginx/api/internal/realtime/events', (res) => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Response body:', data);
        console.log('Response length:', data.length);
        process.exit(0);
    });
});

req.on('error', (err) => {
    console.log('Error:', err.message);
    process.exit(1);
});

req.setTimeout(10000, () => {
    console.log('Request timed out');
    req.destroy();
    process.exit(1);
});

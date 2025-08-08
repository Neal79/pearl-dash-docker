const http = require('http');

// Test data to store an event
const testEvent = {
    type: 'audio_level',
    device: 'test-device',
    channel: 1,
    publisher_id: 'test-publisher',
    data: {
        level: 75,
        status: 'active'
    },
    source: 'test'
};

console.log('Testing store event endpoint...');

// Create POST request
const postData = JSON.stringify(testEvent);
const options = {
    hostname: 'nginx',
    path: '/api/internal/realtime/store',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
    }
};

const req = http.request(options, (res) => {
    console.log('Store Status:', res.statusCode);
    console.log('Store Headers:', JSON.stringify(res.headers, null, 2));
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Store Response:', data);
        
        // Now test retrieving events
        console.log('\nTesting retrieve events endpoint...');
        
        const getReq = http.get('http://nginx/api/internal/realtime/events', (getRes) => {
            console.log('Get Status:', getRes.statusCode);
            
            let getData = '';
            getRes.on('data', chunk => getData += chunk);
            getRes.on('end', () => {
                console.log('Get Response:', getData);
                console.log('Get Response length:', getData.length);
                process.exit(0);
            });
        });
        
        getReq.on('error', (err) => {
            console.log('Get Error:', err.message);
            process.exit(1);
        });
        
        getReq.setTimeout(5000, () => {
            console.log('Get request timed out');
            getReq.destroy();
            process.exit(1);
        });
    });
});

req.on('error', (err) => {
    console.log('Store Error:', err.message);
    process.exit(1);
});

req.setTimeout(5000, () => {
    console.log('Store request timed out');
    req.destroy();
    process.exit(1);
});

// Write data and send request
req.write(postData);
req.end();

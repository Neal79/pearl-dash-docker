#!/bin/bash

# Nginx entrypoint script for Pearl Dashboard
# Ensures SSL certificates exist and nginx starts properly

echo "🔧 Starting Pearl Dashboard Nginx..."

# Check if SSL certificates exist
if [ ! -f "/etc/nginx/ssl/nginx.crt" ] || [ ! -f "/etc/nginx/ssl/nginx.key" ]; then
    echo "❌ SSL certificates not found at /etc/nginx/ssl/"
    echo "💡 Make sure SSL certificates are mounted as volumes:"
    echo "   - ./docker/nginx/ssl/nginx.crt:/etc/nginx/ssl/nginx.crt:ro"
    echo "   - ./docker/nginx/ssl/nginx.key:/etc/nginx/ssl/nginx.key:ro"
    exit 1
fi

# Verify certificate validity
echo "🔍 Verifying SSL certificate..."
if openssl x509 -in /etc/nginx/ssl/nginx.crt -noout -checkend 86400 > /dev/null 2>&1; then
    echo "✅ SSL certificate is valid"
else
    echo "⚠️  SSL certificate expires within 24 hours or is invalid"
fi

# Test nginx configuration
echo "🔍 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid"
    echo "🚀 Starting Nginx..."
    
    # Start nginx in the foreground
    exec nginx -g "daemon off;"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

#!/bin/bash

# Pearl Dashboard - SSL Deployment Script
# Ensures SSL certificates exist and starts the application with proper configuration

echo "🔐 Pearl Dashboard SSL Deployment"
echo "=================================="

# Check if SSL certificates exist
if [ ! -f "docker/nginx/ssl/nginx.crt" ] || [ ! -f "docker/nginx/ssl/nginx.key" ]; then
    echo "❌ SSL certificates not found!"
    echo "🔧 Generating SSL certificates..."
    
    # Generate SSL certificates
    bash docker/nginx/ssl/generate-ssl.sh
    
    if [ $? -eq 0 ]; then
        echo "✅ SSL certificates generated successfully"
    else
        echo "❌ Failed to generate SSL certificates"
        exit 1
    fi
else
    echo "✅ SSL certificates found"
fi

# Check certificate validity (warn if expiring within 7 days)
echo "🔍 Checking certificate validity..."
if openssl x509 -in docker/nginx/ssl/nginx.crt -noout -checkend 604800 > /dev/null 2>&1; then
    echo "✅ SSL certificate is valid (expires in >7 days)"
else
    echo "⚠️  SSL certificate expires within 7 days - consider regenerating"
fi

# Show certificate details
echo ""
echo "📋 Certificate Subject Alternative Names:"
openssl x509 -in docker/nginx/ssl/nginx.crt -text -noout | grep -A 1 "Subject Alternative Name:" | tail -1 | sed 's/^[[:space:]]*/   /'

# Choose compose file
echo ""
echo "🚀 Starting Pearl Dashboard..."
if [ "$1" == "dev" ]; then
    echo "📦 Using development configuration (compose.dev.yaml)"
    docker compose -f compose.dev.yaml down
    docker compose -f compose.dev.yaml up --build -d
elif [ "$1" == "prod" ]; then
    echo "📦 Using production configuration (docker-compose.yml)"
    docker compose down
    docker compose up --build -d
else
    echo "📦 Usage: $0 [dev|prod]"
    echo "   dev  - Use compose.dev.yaml (development with volume mounts)"
    echo "   prod - Use docker-compose.yml (production configuration)"
    exit 1
fi

echo ""
echo "🎉 Pearl Dashboard is starting up!"
echo "🌐 HTTP:  http://localhost"
echo "🔒 HTTPS: https://localhost"
echo ""
echo "📊 Service Status:"
echo "   - Nginx (Web/SSL): https://localhost"
echo "   - Audio Meter WS:  ws://localhost/ws/audio-meter"
echo "   - Realtime WS:     ws://localhost/ws/realtime"
echo "   - phpMyAdmin:      http://localhost:8080"
echo ""
echo "🔧 To check logs: docker compose logs -f [service-name]"
echo "🛑 To stop: docker compose down"

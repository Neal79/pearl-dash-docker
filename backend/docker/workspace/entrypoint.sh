#!/bin/bash

echo "🧑‍💻 Starting Laravel Workspace Container..."

# Fix ownership of mounted volume for www-data user
echo "🔐 Fixing file ownership for mounted volumes..."
sudo chown -R www-data:www-data /var/www/html 2>/dev/null || true

# Fix node_modules binary permissions if they exist
echo "🔧 Fixing node_modules binary permissions..."
if [ -d "node_modules/.bin" ]; then
    sudo chmod +x node_modules/.bin/* 2>/dev/null || true
fi

# Skip database check for now - just proceed with setup
echo "⏩ Skipping database connection check - proceeding with initialization..."

# Fix .env file for Docker environment (clean up old LEMP stack settings)
echo "🔧 Updating .env file for Docker environment..."
if [ -f ".env" ]; then
    # Update APP_URL to work with Docker setup
    sed -i 's|^APP_URL=.*|APP_URL=http://localhost|g' .env
    sed -i 's|^VITE_APP_URL=.*|VITE_APP_URL=http://localhost|g' .env
    
    # Ensure database connection is correct
    sed -i 's|^DB_HOST=.*|DB_HOST=db|g' .env
    
    # Update session settings for HTTP (not HTTPS)
    sed -i 's|^SESSION_SECURE_COOKIE=.*|SESSION_SECURE_COOKIE=false|g' .env
    sed -i 's|^SESSION_DOMAIN=.*|SESSION_DOMAIN=localhost|g' .env
    
    # Update WebSocket URL if present
    sed -i 's|^VITE_WEBSOCKET_URL=.*|VITE_WEBSOCKET_URL=ws://localhost/ws|g' .env
    
    echo "✅ .env file updated for Docker environment"
else
    echo "⚠️ No .env file found"
fi

# Install/update Composer dependencies
if [ ! -d "vendor" ] || [ "composer.lock" -nt "vendor/autoload.php" ]; then
    echo "📦 Installing/updating Composer dependencies..."
    composer install --no-interaction --optimize-autoloader
else
    echo "✅ Composer dependencies are up to date"
fi

# Set proper permissions (ignore failures due to volume mounting)
echo "🔐 Setting proper permissions..."
chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true
chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache 2>/dev/null || true

# Clear bootstrap cache to remove any old LEMP stack paths
echo "🧹 Clearing Laravel bootstrap cache..."
rm -f /var/www/html/bootstrap/cache/config.php
rm -f /var/www/html/bootstrap/cache/routes.php  
rm -f /var/www/html/bootstrap/cache/services.php
rm -f /var/www/html/bootstrap/cache/packages.php

# Try a simple Laravel command first
echo "🔧 Testing Laravel configuration..."
php artisan --version || echo "❌ Laravel artisan command failed"

# Run migrations (skip if they fail)
if [[ "${SKIP_MIGRATIONS}" != "true" ]]; then
    echo "🗄️ Attempting to run database migrations..."
    php artisan migrate --force || echo "❌ Migrations failed - continuing anyway"
    
    # Run database seeders to create demo users
    echo "🌱 Running database seeders to create demo users..."
    php artisan db:seed --force || echo "❌ Seeders failed - continuing anyway"
else
    echo "⏩ Skipping migrations and seeders (SKIP_MIGRATIONS=true)"
fi

echo "✅ Laravel Workspace initialization complete!"

# Keep container running for manual commands
echo "💤 Workspace ready - keeping container alive for manual commands..."
sleep infinity

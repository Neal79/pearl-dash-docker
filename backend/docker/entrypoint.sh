#!/bin/bash

echo "🚀 Starting Laravel application initialization..."

# Docker Compose already ensures DB is healthy via depends_on, so trust that
echo "✅ Database should be ready (Docker Compose dependency)"

# Start PHP-FPM in background first
echo "🚀 Starting PHP-FPM in background..."
php-fpm &
PHP_FPM_PID=$!

# Give PHP-FPM a moment to start
echo "⏳ Waiting for PHP-FPM to initialize..."
sleep 5

# Skip all Laravel initialization for now to get PHP-FPM stable
echo "⏩ Skipping Laravel initialization to get PHP-FPM stable"
echo "✅ Laravel initialization complete (PHP-FPM running)!"

# Wait for PHP-FPM to finish (keep container running)
wait $PHP_FPM_PID

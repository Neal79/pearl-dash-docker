#!/bin/bash

# Pearl Dashboard Log Rotation Setup Script
# Run this script with sudo to set up system log rotation

set -e

PROJECT_DIR="/var/www/html/pearl-dash"
LOGROTATE_CONFIG="/etc/logrotate.d/pearl-dash"

echo "🔄 Setting up log rotation for Pearl Dashboard..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

# Create logrotate configuration
echo "📋 Installing logrotate configuration..."
cp "$PROJECT_DIR/logrotate.conf" "$LOGROTATE_CONFIG"
chmod 644 "$LOGROTATE_CONFIG"

# Test the logrotate configuration
echo "🧪 Testing logrotate configuration..."
if logrotate -d "$LOGROTATE_CONFIG"; then
    echo "✅ Logrotate configuration is valid"
else
    echo "❌ Logrotate configuration has errors"
    exit 1
fi

# Create media-proxy logs directory if it doesn't exist
MEDIA_PROXY_LOGS_DIR="$PROJECT_DIR/media-proxy/logs"
if [ ! -d "$MEDIA_PROXY_LOGS_DIR" ]; then
    echo "📁 Creating media-proxy logs directory..."
    mkdir -p "$MEDIA_PROXY_LOGS_DIR"
    chown neal:neal "$MEDIA_PROXY_LOGS_DIR"
    chmod 755 "$MEDIA_PROXY_LOGS_DIR"
fi

# Ensure Laravel logs directory has correct permissions
LARAVEL_LOGS_DIR="$PROJECT_DIR/storage/logs"
echo "🔐 Setting Laravel logs directory permissions..."
chown -R www-data:www-data "$LARAVEL_LOGS_DIR"
chmod -R 664 "$LARAVEL_LOGS_DIR"/*.log 2>/dev/null || true
chmod 775 "$LARAVEL_LOGS_DIR"

# Force an initial rotation to test (dry run)
echo "🔄 Testing log rotation (dry run)..."
logrotate -f -v "$LOGROTATE_CONFIG"

echo "✅ Log rotation setup completed successfully!"
echo ""
echo "📋 Configuration installed to: $LOGROTATE_CONFIG"
echo "🔄 Logs will be rotated daily by the system cron job"
echo "📁 Laravel logs: $LARAVEL_LOGS_DIR"
echo "📁 Media-proxy logs: $MEDIA_PROXY_LOGS_DIR"
echo ""
echo "🔍 To manually test log rotation, run:"
echo "   sudo logrotate -f $LOGROTATE_CONFIG"
echo ""
echo "📊 To check logrotate status:"
echo "   sudo cat /var/lib/logrotate/status | grep pearl-dash"
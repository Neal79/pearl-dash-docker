#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Pearl Dashboard Testing Build...${NC}"

# Wait for database to be ready
echo -e "${YELLOW}Waiting for database connection...${NC}"
while ! mysqladmin ping -h"$DB_HOST" --silent; do
    echo "Waiting for database..."
    sleep 2
done
echo -e "${GREEN}Database connection established!${NC}"

# Navigate to Laravel directory
cd /var/www/html

# Generate application key if not set
if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "base64:PLACEHOLDER" ]; then
    echo -e "${YELLOW}Generating application key...${NC}"
    php artisan key:generate --force
fi

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
php artisan migrate --force

# Seed the database with initial data if needed
echo -e "${YELLOW}Seeding database...${NC}"
php artisan db:seed --force || echo "Seeding skipped (no seeds found or already exists)"

# Clear all caches for fresh start
echo -e "${YELLOW}Clearing application caches...${NC}"
php artisan config:clear
php artisan cache:clear
php artisan route:clear
php artisan view:clear

# Cache configurations for production
echo -e "${YELLOW}Caching configurations for production...${NC}"
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Create test users automatically
echo -e "${YELLOW}Creating test users...${NC}"
php artisan create:test-user || echo "Test user creation completed or skipped"

# Set proper permissions
echo -e "${YELLOW}Setting file permissions...${NC}"
chown -R www-data:www-data /var/www/html/storage
chown -R www-data:www-data /var/www/html/bootstrap/cache
chmod -R 775 /var/www/html/storage
chmod -R 775 /var/www/html/bootstrap/cache

echo -e "${GREEN}Pearl Dashboard Testing Build Ready!${NC}"
echo -e "${GREEN}Available users:${NC}"
echo -e "  - neal@nealslab.com (password: password123)"
echo -e "  - ves@example.com (password: vespass456)"
echo -e "  - admin@pearl-dashboard.com (password: admin789)"
echo -e "${GREEN}Access the dashboard at: https://localhost${NC}"

# Start supervisor to manage both PHP-FPM and any background processes
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

#!/bin/bash

# Pearl Dashboard Database Restore Script
# Usage: ./restore-db.sh backup_file.sql.gz

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo "Available backups:"
    ls -la ./backups/pearl_dash_backup_*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "⚠️  WARNING: This will replace all data in the pearl_dash database!"
read -p "Are you sure you want to continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 1
fi

echo "Restoring database from: $BACKUP_FILE"

# Decompress and restore
if [[ $BACKUP_FILE == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | docker-compose exec -T db mysql -u pearldashuser -pLaneChicago1997! pearl_dash
else
    docker-compose exec -T db mysql -u pearldashuser -pLaneChicago1997! pearl_dash < "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
    echo "✅ Database restored successfully!"
    echo "🔄 You may want to run: docker-compose exec app php artisan migrate"
else
    echo "❌ Database restore failed!"
    exit 1
fi

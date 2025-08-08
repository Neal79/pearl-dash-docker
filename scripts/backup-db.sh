#!/bin/bash

# Pearl Dashboard Database Backup Script
# Usage: ./backup-db.sh

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
BACKUP_FILE="pearl_dash_backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

echo "Creating database backup..."

# Create backup using docker-compose
docker-compose exec -T db mysqldump -u pearldashuser -pLaneChicago1997! pearl_dash > "${BACKUP_DIR}/${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    echo "✅ Backup created successfully: ${BACKUP_DIR}/${BACKUP_FILE}"
    
    # Compress the backup
    gzip "${BACKUP_DIR}/${BACKUP_FILE}"
    echo "✅ Backup compressed: ${BACKUP_DIR}/${BACKUP_FILE}.gz"
    
    # Keep only last 10 backups
    cd ${BACKUP_DIR}
    ls -t pearl_dash_backup_*.sql.gz | tail -n +11 | xargs -r rm
    echo "✅ Old backups cleaned up"
else
    echo "❌ Backup failed!"
    exit 1
fi

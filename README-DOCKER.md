# Pearl Dashboard - Docker Setup

This is a Dockerized Laravel 12 application with Vue.js frontend, WebSocket support, and MySQL database.

## Prerequisites

- Docker Desktop for Windows
- Git

## Quick Start

1. **Clone and navigate to the project:**
   ```bash
   cd "c:\Users\nealf\Docker Dash"
   ```

2. **Copy environment file:**
   ```bash
   copy backend\.env.example backend\.env
   ```

3. **Build and start services:**
   ```bash
   docker-compose up --build -d
   ```

4. **Run initial Laravel setup:**
   ```bash
   docker-compose exec app php artisan key:generate
   docker-compose exec app php artisan migrate
   docker-compose exec app php artisan db:seed
   ```

5. **Access the application:**
   - Laravel API: http://localhost
   - Frontend (Vite): http://localhost:5173
   - Database: localhost:3306

## Docker Services

- **app**: Laravel 12 PHP-FPM application
- **nginx**: Web server for Laravel
- **db**: MySQL 8 database
- **frontend**: Vue.js with Vite dev server
- **websocket**: WebSocket server for real-time features
- **poller**: Polling service

## Common Commands

Using PowerShell:

```powershell
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f app

# Access Laravel container
docker-compose exec app bash

# Run artisan commands
docker-compose exec app php artisan migrate
docker-compose exec app php artisan tinker

# Install composer dependencies
docker-compose exec app composer install

# Access database
docker-compose exec db mysql -u pearldashuser -p pearl_dash
```

If you have `make` installed (via Chocolatey or WSL), you can use the Makefile:

```bash
make help       # Show available commands
make setup      # Initial setup
make up         # Start services
make down       # Stop services
make shell      # Access app container
make migrate    # Run migrations
```

## Configuration

### Environment Variables

Key environment variables in `backend/.env`:

- `APP_URL=https://192.168.43.5` - Your application URL
- `DB_HOST=db` - Database host (Docker service name)
- `DB_DATABASE=pearl_dash` - Database name
- `DB_USERNAME=pearldashuser` - Database user
- `DB_PASSWORD=LaneChicago1997!` - Database password

### Networking

The application uses a custom Docker network `pearlnet` for service communication.

### Volumes

- `./backend/var/www/html:/var/www/html` - Laravel application code
- `./frontend:/app` - Vue.js frontend code
- `db_data:/var/lib/mysql` - Persistent database storage

## Development Workflow

1. **Code changes**: Edit files in `backend/var/www/html/` or `frontend/`
2. **Laravel changes**: No restart needed (volume mounted)
3. **Frontend changes**: Vite will hot-reload automatically
4. **Composer changes**: Run `docker-compose exec app composer install`
5. **Database changes**: Run `docker-compose exec app php artisan migrate`

## Troubleshooting

### Permission Issues
```bash
docker-compose exec app chown -R www-data:www-data /var/www/html/storage
docker-compose exec app chmod -R 775 /var/www/html/storage
```

### Clear Caches
```bash
docker-compose exec app php artisan cache:clear
docker-compose exec app php artisan config:clear
docker-compose exec app php artisan route:clear
```

### Rebuild Containers
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Issues
Make sure the database service is healthy:
```bash
docker-compose logs db
docker-compose exec db mysql -u root -p
```

## Production Deployment

For production, you'll want to:

1. Set `APP_ENV=production` in your `.env`
2. Set `APP_DEBUG=false`
3. Use proper SSL certificates
4. Configure nginx for production
5. Set up proper logging and monitoring
6. Use optimized Docker images

## WebSocket Configuration

The WebSocket service runs on port 3444 and is proxied through nginx at `/ws`. Make sure your WebSocket client connects to the correct URL as defined in `VITE_WEBSOCKET_URL`.

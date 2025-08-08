#!/bin/bash

echo "🚀 Pearl Dash - New Host Setup Script"
echo "======================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first:"
    echo "   sudo apt update && sudo apt install docker.io docker-compose-plugin"
    echo "   sudo usermod -aG docker \$USER"
    echo "   Then logout/login and run this script again."
    exit 1
fi

# Check if user is in docker group
if ! groups | grep -q docker; then
    echo "❌ User not in docker group. Please run:"
    echo "   sudo usermod -aG docker \$USER"
    echo "   Then logout/login and run this script again."
    exit 1
fi

echo "✅ Docker installation verified"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create .env with your configuration."
    exit 1
fi

echo "✅ Environment file found"

# Build all containers
echo "🏗️  Building Docker containers (this may take several minutes)..."
sudo docker compose build

if [ $? -ne 0 ]; then
    echo "❌ Container build failed!"
    exit 1
fi

echo "✅ Containers built successfully"

# Start services
echo "🚀 Starting services..."
sudo docker compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 30

# Install npm dependencies
echo "📦 Installing npm dependencies..."
make workspace-npm cmd="install --include=dev"

if [ $? -ne 0 ]; then
    echo "❌ npm install failed!"
    exit 1
fi

# Build frontend assets
echo "🎨 Building frontend assets..."
make workspace-npm cmd="run build"

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed!"
    exit 1
fi

# Run database migrations
echo "🗄️  Running database migrations..."
make workspace-artisan cmd="migrate --force"

# Run database seeders
echo "🌱 Running database seeders..."
make workspace-artisan cmd="db:seed --force"

# Show status
echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Your Pearl Dash application is now running:"
echo "  🌐 Web: http://localhost"
echo "  🗄️  Database: localhost:3306"
echo ""
echo "Useful commands:"
echo "  make workspace                    # Access workspace shell"
echo "  make workspace-artisan cmd=\"..\"   # Run artisan commands"
echo "  make workspace-npm cmd=\"..\"       # Run npm commands"
echo "  sudo docker compose logs -f      # View logs"
echo "  sudo docker compose down         # Stop services"
echo "  sudo docker compose up -d        # Start services"
echo ""

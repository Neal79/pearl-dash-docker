#!/bin/bash
# Pearl Dashboard Testing Build Deployment Script
# This script creates a complete, ready-to-use Pearl Dashboard deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
SSL_DIR="$PROJECT_ROOT/docker/nginx/ssl"

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE} Pearl Dashboard Testing Deployment ${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Function to check if Docker is running
check_docker() {
    if ! sudo docker info >/dev/null 2>&1; then
        echo -e "${RED}Error: Docker is not running. Please start Docker first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker is running${NC}"
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if ! sudo docker compose version >/dev/null 2>&1; then
        echo -e "${RED}Error: docker compose is not available.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker Compose is available${NC}"
}

# Function to generate SSL certificates
generate_ssl_certificates() {
    echo -e "${YELLOW}Generating SSL certificates...${NC}"
    
    # Create SSL directory if it doesn't exist
    mkdir -p "$SSL_DIR"
    
    # Generate SSL certificates with wildcard and IP support
    cd "$SSL_DIR"
    
    # Create OpenSSL config for certificate with Subject Alternative Names
    cat > openssl.conf << EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = Pearl Dashboard
OU = IT Department
CN = pearl-dashboard.local

[v3_req]
keyUsage = keyEncipherment, dataEncipherment, digitalSignature
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = pearl-dashboard.local
DNS.2 = *.pearl-dashboard.local
DNS.3 = localhost
DNS.4 = *.localhost
IP.1 = 127.0.0.1
IP.2 = 192.168.1.1
IP.3 = 192.168.1.10
IP.4 = 192.168.1.100
IP.5 = 192.168.43.1
IP.6 = 192.168.43.10
IP.7 = 192.168.43.100
IP.8 = 10.0.0.1
IP.9 = 10.0.0.10
IP.10 = 10.0.0.100
IP.11 = 172.16.0.1
IP.12 = 172.16.0.10
IP.13 = 172.16.0.100
EOF

    # Generate private key and certificate
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx.key \
        -out nginx.crt \
        -config openssl.conf \
        -extensions v3_req
    
    # Set proper permissions
    chmod 600 nginx.key
    chmod 644 nginx.crt
    
    echo -e "${GREEN}✓ SSL certificates generated${NC}"
}

# Function to build and start services
deploy_services() {
    echo -e "${YELLOW}Building and starting Pearl Dashboard services...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Stop any existing containers
    sudo docker compose -f docker-compose.testing.yml down >/dev/null 2>&1 || true
    
    # Build and start services
    sudo docker compose -f docker-compose.testing.yml up --build -d
    
    echo -e "${GREEN}✓ Services started${NC}"
}

# Function to wait for services to be ready
wait_for_services() {
    echo -e "${YELLOW}Waiting for services to be ready...${NC}"
    
    # Wait for database
    echo -n "Database: "
    while ! sudo docker compose -f docker-compose.testing.yml exec -T db mysqladmin ping -h localhost --silent >/dev/null 2>&1; do
        echo -n "."
        sleep 2
    done
    echo -e " ${GREEN}✓${NC}"
    
    # Wait for Laravel app
    echo -n "Laravel App: "
    sleep 10  # Give Laravel time to initialize
    while ! sudo docker compose -f docker-compose.testing.yml exec -T app php artisan --version >/dev/null 2>&1; do
        echo -n "."
        sleep 3
    done
    echo -e " ${GREEN}✓${NC}"
    
    # Wait for nginx
    echo -n "Web Server: "
    while ! curl -k -s https://localhost >/dev/null 2>&1; do
        echo -n "."
        sleep 2
    done
    echo -e " ${GREEN}✓${NC}"
    
    echo -e "${GREEN}✓ All services are ready${NC}"
}

# Function to display access information
show_access_info() {
    echo ""
    echo -e "${BLUE}=====================================${NC}"
    echo -e "${BLUE}   PEARL DASHBOARD IS READY! 🎉     ${NC}"
    echo -e "${BLUE}=====================================${NC}"
    echo ""
    
    # Get the actual IP address
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    
    echo -e "${GREEN}Access URLs:${NC}"
    echo -e "  🌐 HTTPS: ${YELLOW}https://localhost${NC}"
    echo -e "  🌐 HTTP:  ${YELLOW}http://localhost${NC}"
    echo -e "  🌐 Local Network: ${YELLOW}https://$LOCAL_IP${NC}"
    echo ""
    
    echo -e "${GREEN}Test User Accounts:${NC}"
    echo -e "  👤 ${YELLOW}neal@nealslab.com${NC} / password123"
    echo -e "  👤 ${YELLOW}ves@example.com${NC} / vespass456"
    echo -e "  👤 ${YELLOW}admin@pearl-dashboard.com${NC} / admin789"
    echo ""
    
    echo -e "${GREEN}WebSocket Services:${NC}"
    echo -e "  📊 Realtime Data: ${YELLOW}wss://localhost/ws/realtime${NC}"
    echo -e "  🎵 Audio Meter: ${YELLOW}wss://localhost/ws/audio-meter${NC}"
    echo ""
    
    echo -e "${GREEN}Management Commands:${NC}"
    echo -e "  📋 View Logs: ${YELLOW}sudo docker compose -f docker-compose.testing.yml logs -f${NC}"
    echo -e "  🛑 Stop Services: ${YELLOW}sudo docker compose -f docker-compose.testing.yml down${NC}"
    echo -e "  🔄 Restart: ${YELLOW}bash deploy-testing.sh${NC}"
    echo ""
    
    echo -e "${BLUE}Note: Accept the SSL certificate warning in your browser${NC}"
    echo -e "${BLUE}for the self-signed certificate to work properly.${NC}"
}

# Main deployment process
main() {
    echo -e "${YELLOW}Checking system requirements...${NC}"
    check_docker
    check_docker_compose
    echo ""
    
    echo -e "${YELLOW}Setting up SSL certificates...${NC}"
    generate_ssl_certificates
    echo ""
    
    echo -e "${YELLOW}Deploying Pearl Dashboard...${NC}"
    deploy_services
    echo ""
    
    echo -e "${YELLOW}Initializing services...${NC}"
    wait_for_services
    echo ""
    
    show_access_info
}

# Handle script interruption
trap 'echo -e "\n${RED}Deployment interrupted!${NC}"; exit 1' INT TERM

# Run main function
main

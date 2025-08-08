# Pearl Dashboard - Testing Build Quick Start

## 🚀 One-Command Deployment

For **non-technical users** who just want to get Pearl Dashboard running quickly:

```bash
bash deploy-testing.sh
```

That's it! The script will:
- ✅ Check Docker requirements
- ✅ Generate SSL certificates for any IP address
- ✅ Build all services (database, backend, frontend, WebSocket services)
- ✅ Set up test users automatically
- ✅ Start everything and provide access information

## 📋 Requirements

- **Docker** and **Docker Compose** installed
- **Linux/Mac/WSL** environment
- **8GB+ RAM** recommended
- **Ports available**: 80, 443, 3306, 3444, 3446, 3448

## 🎯 After Deployment

### Access the Dashboard
- **Primary URL**: https://localhost
- **Accept SSL warning** (self-signed certificate)

### Test Users (Ready to Use)
| Email | Password | Role |
|-------|----------|------|
| `neal@nealslab.com` | `password123` | Admin |
| `ves@example.com` | `vespass456` | User |
| `admin@pearl-dashboard.com` | `admin789` | Super Admin |

### WebSocket Services
- **Realtime Data**: `wss://localhost/ws/realtime`
- **Audio Meter**: `wss://localhost/ws/audio-meter`

## 🔧 Management Commands

```bash
# View all service logs
sudo docker compose -f docker-compose.testing.yml logs -f

# Stop all services
sudo docker compose -f docker-compose.testing.yml down

# Restart everything
bash deploy-testing.sh

# Check service status
sudo docker compose -f docker-compose.testing.yml ps
```

## 🌐 Network Access

The deployment automatically works with:
- **Localhost**: `https://localhost`
- **LAN Access**: `https://YOUR_IP_ADDRESS`
- **VLAN/Hotel Networks**: SSL certificates support common IP ranges
- **Dynamic IPs**: No hardcoded addresses, adapts automatically

## 📦 What's Included

This testing build includes:
- **Laravel 12** backend with JWT authentication
- **Vue 3** frontend with production assets
- **MySQL 8** database with automatic setup
- **nginx** with SSL and WebSocket proxying
- **Node.js microservices** for audio and realtime data
- **Automatic user creation** and database migration
- **SSL certificates** for secure connections

## 🐛 Troubleshooting

### Services won't start
```bash
# Check Docker is running
sudo docker info

# View detailed logs
sudo docker compose -f docker-compose.testing.yml logs
```

### Can't access via HTTPS
- Accept the SSL certificate warning in your browser
- Try HTTP first: `http://localhost`

### Database issues
```bash
# Reset everything and redeploy
sudo docker compose -f docker-compose.testing.yml down -v
bash deploy-testing.sh
```

## 🎨 For Developers

If you want to make code changes, use the development environment instead:

```bash
# Development with hot-reload
docker-compose up -d
```

---

**Need Help?** This testing build is designed to "just work" out of the box. If you encounter issues, the deployment script provides detailed status information and error messages.

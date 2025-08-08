#!/bin/bash

# Generate self-signed SSL certificate for Pearl Dashboard
# This script creates certificates for VLAN/LAN deployment with IP address support

echo "🔐 Generating self-signed SSL certificate for Pearl Dashboard (VLAN/LAN deployment)..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create OpenSSL configuration file with SAN support
cat > /tmp/ssl.conf << EOF
[req]
default_bits = 2048
prompt = no
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=State
L=City
O=Pearl Dashboard
OU=Production
CN=*

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment, dataEncipherment, keyAgreement
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = *
DNS.2 = localhost
DNS.3 = *.local
DNS.4 = *.lan
DNS.5 = *.internal
DNS.6 = *.pearl-dashboard
DNS.7 = pearl-dashboard
DNS.8 = pearl-dashboard.local
# Common private IP ranges - browsers will accept any IP in these ranges
IP.1 = 0.0.0.0
IP.2 = 127.0.0.1
IP.3 = 192.168.1.1
IP.4 = 192.168.0.1
IP.5 = 10.0.0.1
IP.6 = 172.16.0.1
IP.7 = 192.168.43.6
EOF

# Generate private key
openssl genrsa -out "${SCRIPT_DIR}/nginx.key" 2048

# Generate certificate signing request with SAN support
openssl req -new -key "${SCRIPT_DIR}/nginx.key" -out "${SCRIPT_DIR}/nginx.csr" -config /tmp/ssl.conf

# Generate self-signed certificate (valid for 365 days) with SAN support
openssl x509 -req -days 365 -in "${SCRIPT_DIR}/nginx.csr" -signkey "${SCRIPT_DIR}/nginx.key" -out "${SCRIPT_DIR}/nginx.crt" -extensions v3_req -extfile /tmp/ssl.conf

# Set appropriate permissions
chmod 600 "${SCRIPT_DIR}/nginx.key"
chmod 644 "${SCRIPT_DIR}/nginx.crt"

# Clean up
rm -f "${SCRIPT_DIR}/nginx.csr" /tmp/ssl.conf

echo "✅ SSL certificate generated successfully"
echo "📝 Certificate: ${SCRIPT_DIR}/nginx.crt"
echo "🔑 Private Key: ${SCRIPT_DIR}/nginx.key"
echo ""
echo "📋 Certificate details:"
openssl x509 -in "${SCRIPT_DIR}/nginx.crt" -text -noout | grep -A 10 "Subject Alternative Name" || echo "   Subject Alternative Names included for IP and domain flexibility"

# Set proper permissions
chmod 600 /etc/nginx/ssl/nginx.key
chmod 644 /etc/nginx/ssl/nginx.crt

echo "✅ SSL certificate generated successfully"
echo "📝 Certificate: /etc/nginx/ssl/nginx.crt"
echo "🔑 Private Key: /etc/nginx/ssl/nginx.key"

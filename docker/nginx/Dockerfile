# Nginx with SSL support for Pearl Dashboard
FROM nginx:alpine

# Install OpenSSL for certificate verification
RUN apk add --no-cache openssl

# Create SSL directory for mounted certificates
RUN mkdir -p /etc/nginx/ssl

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY sites-available /etc/nginx/sites-available
COPY sites-enabled /etc/nginx/sites-enabled

# Expose both HTTP and HTTPS
EXPOSE 80 443

# Use default nginx entrypoint for now
CMD ["nginx", "-g", "daemon off;"]

# Preview Image Service Dockerfile
FROM node:18-alpine

# Install dependencies for sharp (image processing)
RUN apk add --no-cache \
    libc6-compat \
    vips-dev \
    build-base \
    python3 \
    make \
    g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for nodemon)
RUN npm install

# Copy source code to /app (will be overridden by volume in development)
COPY . .

# Create directories for image storage
RUN mkdir -p /app/storage/images

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of storage directory and app directory
RUN chown -R nodejs:nodejs /app/storage /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3449 3450

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3450/health || exit 1

# Start the service - use nodemon in development mode
CMD if [ "$NODE_ENV" = "development" ]; then \
      echo "Starting in development mode with nodemon..."; \
      npx nodemon preview-image-service.js; \
    else \
      echo "Starting in production mode..."; \
      npm start; \
    fi
FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production

WORKDIR /app

# Copy package files from root and workspaces
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install dependencies optimized for production
RUN npm ci --omit=dev

# Copy entire project
COPY . .

# Build frontend for production
RUN npm run build:frontend

# Expose only the backend port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Start the application - always listen on all interfaces on port 5000
# NOTE: For Docker monitoring to work, mount the Docker socket:
#   docker run -v /var/run/docker.sock:/var/run/docker.sock ...
CMD ["node", "backend/src/server.js"]
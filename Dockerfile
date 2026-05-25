FROM node:20

WORKDIR /app

# Copy package files from root and workspaces
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install root dependencies and workspace dependencies
RUN npm install

# Copy entire project
COPY . .

# Build frontend for production
RUN npm run build:frontend

# Build backend (if needed)
RUN npm run build:backend

# Expose backend port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application
# NOTE: For Docker monitoring to work, mount the Docker socket:
#   docker run -v /var/run/docker.sock:/var/run/docker.sock ...
# See DOCKER_MONITORING_SETUP.md for details
CMD ["npm", "start"]
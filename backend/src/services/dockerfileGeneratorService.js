import fs from "fs/promises";
import path from "path";
import {
  TECH_STACKS,
  getBaseImage,
  getBuildCommand,
  getStartCommand,
} from "./techStackDetectorService.js";

/**
 * Dockerfile Generator Service
 * Automatically generates optimized Dockerfiles for different tech stacks
 */

function generateNodeDockerfile(detection, repoPath, containerPort) {
  const buildCmd = getBuildCommand(detection);
  const startCmd = getStartCommand(detection);
  const isNextJs = detection.primaryStack === TECH_STACKS.NEXTJS;
  const isReact = detection.primaryStack === TECH_STACKS.REACT;

  let dockerfile = `# Multi-stage Dockerfile for Node.js project
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build application
${buildCmd === "npm install" ? "# Application doesn't require build step" : `RUN ${buildCmd}`}

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy built application from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app . .

# Set environment
ENV NODE_ENV=production
ENV PORT=${containerPort}

# Expose port
EXPOSE ${containerPort}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:${containerPort}', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["sh", "-c", "${startCmd}"]
`;

  return dockerfile;
}

function generatePythonDockerfile(detection, repoPath, containerPort) {
  const baseImage = detection.primaryStack === TECH_STACKS.FLASK ? "python:3.11-slim" : "python:3.11-slim";
  const startCmd = getStartCommand(detection);

  let dockerfile = `# Dockerfile for Python project
FROM ${baseImage}

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Set environment
ENV PYTHONUNBUFFERED=1
ENV PORT=${containerPort}

# Expose port
EXPOSE ${containerPort}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${containerPort}/health || exit 1

# Start application
CMD ["sh", "-c", "${startCmd}"]
`;

  return dockerfile;
}

function generateStaticDockerfile(detection, repoPath, containerPort) {
  return `# Dockerfile for Static Website
FROM nginx:alpine

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy static files
COPY . /usr/share/nginx/html/

# Create nginx config
RUN cat > /etc/nginx/conf.d/default.conf << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /usr/share/nginx/html;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css text/javascript application/json application/javascript;
}
EOF

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --quiet --tries=1 --spider http://localhost/index.html || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
`;
}

function generateGoDockerfile(detection, repoPath, containerPort) {
  return `# Multi-stage Dockerfile for Go project
FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/main .

EXPOSE ${containerPort}

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --quiet --tries=1 --spider http://localhost:${containerPort}/ || exit 1

CMD ["./main"]
`;
}

function generateJavaDockerfile(detection, repoPath, containerPort) {
  return `# Multi-stage Dockerfile for Java project
FROM maven:3.8.1-openjdk-17-slim AS builder

WORKDIR /app

COPY pom.xml .
RUN mvn dependency:go-offline

COPY . .
RUN mvn clean package -DskipTests

# Runtime stage
FROM openjdk:17-jdk-slim

WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

EXPOSE ${containerPort}

ENV JAVA_OPTS="-Xmx256m -Xms128m"

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${containerPort}/health || exit 1

ENTRYPOINT ["sh", "-c", "java \${JAVA_OPTS} -jar app.jar"]
`;
}

function generateRubyDockerfile(detection, repoPath, containerPort) {
  return `# Dockerfile for Ruby on Rails
FROM ruby:3.2-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache build-base postgresql-dev nodejs npm

# Install gems
COPY Gemfile Gemfile.lock ./
RUN bundle install

# Copy application
COPY . .

# Precompile assets
RUN bundle exec rake assets:precompile || true

EXPOSE ${containerPort}

ENV RAILS_ENV=production
ENV PORT=${containerPort}

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${containerPort}/ || exit 1

CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
`;
}

/**
 * Generate Dockerfile based on detected tech stack
 */
export async function generateDockerfile(detection, repoPath, containerPort = 3000) {
  try {
    let dockerfile;

    switch (detection.primaryStack) {
      case TECH_STACKS.NODE_JS:
      case TECH_STACKS.NEXTJS:
      case TECH_STACKS.REACT:
      case TECH_STACKS.MERN:
        dockerfile = generateNodeDockerfile(detection, repoPath, containerPort);
        break;
      case TECH_STACKS.PYTHON:
      case TECH_STACKS.DJANGO:
      case TECH_STACKS.FASTAPI:
      case TECH_STACKS.FLASK:
        dockerfile = generatePythonDockerfile(detection, repoPath, containerPort);
        break;
      case TECH_STACKS.STATIC:
        dockerfile = generateStaticDockerfile(detection, repoPath, containerPort);
        break;
      case TECH_STACKS.GO:
        dockerfile = generateGoDockerfile(detection, repoPath, containerPort);
        break;
      case TECH_STACKS.JAVA:
        dockerfile = generateJavaDockerfile(detection, repoPath, containerPort);
        break;
      case TECH_STACKS.RUBY:
        dockerfile = generateRubyDockerfile(detection, repoPath, containerPort);
        break;
      default:
        dockerfile = generateNodeDockerfile(detection, repoPath, containerPort);
    }

    // Write Dockerfile to repository
    const dockerfilePath = path.join(repoPath, "Dockerfile");
    await fs.writeFile(dockerfilePath, dockerfile, "utf-8");

    return {
      success: true,
      path: dockerfilePath,
      dockerfile,
    };
  } catch (error) {
    console.error("Error generating Dockerfile:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate .dockerignore file
 */
export async function generateDockerignore(repoPath) {
  try {
    const dockerignore = `node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.DS_Store
dist
build
.next
out
.venv
__pycache__
*.pyc
.pytest_cache
.coverage
htmlcov
.idea
.vscode
*.swp
*.swo
*~
.cache
.pytest_cache
.mypy_cache
.dmypy.json
dmypy.json
.pyre
.env.example
.eslintcache
.stylelintcache
coverage
`;

    const dockerignorePath = path.join(repoPath, ".dockerignore");
    await fs.writeFile(dockerignorePath, dockerignore, "utf-8");

    return {
      success: true,
      path: dockerignorePath,
    };
  } catch (error) {
    console.error("Error generating .dockerignore:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

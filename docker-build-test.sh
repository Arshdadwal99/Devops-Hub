#!/bin/bash
# Docker Build and Test Script for DevOps Hub
# Usage: bash docker-build-test.sh [command]
#   clean    - Remove all devops-hub images and containers
#   build    - Build production image
#   run      - Build and run container
#   test     - Test running container
#   push     - Push image to registry
#   inspect  - Show image details and layer sizes
#   help     - Show this help

set -e

# Configuration
IMAGE_NAME="devops-hub"
IMAGE_TAG="latest"
REGISTRY=""  # Set to "docker.io/username" to push
CONTAINER_NAME="devops-hub"
PORT=5000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
  echo ""
  echo -e "${BLUE}===================================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}===================================================${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_info() {
  echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Clean command
cmd_clean() {
  print_header "Cleaning Docker Images and Containers"
  
  # Stop running container
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping container: ${CONTAINER_NAME}"
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
    print_success "Container removed"
  fi
  
  # Remove images
  if docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "${IMAGE_NAME}"; then
    echo "Removing images: ${IMAGE_NAME}"
    docker rmi -f $(docker images --format '{{.Repository}}:{{.Tag}}' | grep "${IMAGE_NAME}") 2>/dev/null || true
    print_success "Images removed"
  fi
  
  # Prune unused layers
  docker system prune -f > /dev/null
  print_success "System pruned"
}

# Build command
cmd_build() {
  print_header "Building Docker Image: ${IMAGE_NAME}:${IMAGE_TAG}"
  
  # Enable BuildKit for better caching
  export DOCKER_BUILDKIT=1
  
  if docker build \
    --progress=plain \
    --tag "${IMAGE_NAME}:${IMAGE_TAG}" \
    --tag "${IMAGE_NAME}:latest" \
    .; then
    print_success "Image built successfully: ${IMAGE_NAME}:${IMAGE_TAG}"
    
    # Show image info
    echo ""
    echo "Image Details:"
    docker images ${IMAGE_NAME}
  else
    print_error "Build failed"
    return 1
  fi
}

# Run command
cmd_run() {
  print_header "Building and Running Container"
  
  # Build first
  cmd_build
  
  # Stop existing container
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    print_info "Stopping existing container..."
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
  fi
  
  # Run container
  echo ""
  echo "Starting container: ${CONTAINER_NAME}"
  docker run -d \
    --name ${CONTAINER_NAME} \
    --restart unless-stopped \
    -p ${PORT}:${PORT} \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -e NODE_ENV=production \
    -e PORT=${PORT} \
    ${IMAGE_NAME}:${IMAGE_TAG}
  
  print_success "Container started: ${CONTAINER_NAME}"
  print_info "Port: http://localhost:${PORT}"
  
  # Wait for container to be healthy
  echo ""
  echo "Waiting for container to be healthy..."
  sleep 2
  
  for i in {1..30}; do
    if docker exec ${CONTAINER_NAME} curl -s http://localhost:${PORT}/api/health > /dev/null 2>&1; then
      print_success "Container is healthy!"
      break
    fi
    echo -n "."
    sleep 1
  done
  
  echo ""
}

# Test command
cmd_test() {
  print_header "Testing Container"
  
  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    print_error "Container not running: ${CONTAINER_NAME}"
    echo "Start it with: bash docker-build-test.sh run"
    return 1
  fi
  
  echo "Running tests..."
  echo ""
  
  # Test 1: Health endpoint
  echo -n "1. Testing health endpoint... "
  if HEALTH=$(docker exec ${CONTAINER_NAME} curl -s http://localhost:${PORT}/api/health); then
    if echo "$HEALTH" | grep -q '"ok":true'; then
      print_success "Health OK"
      echo "   Response: $HEALTH"
    else
      print_error "Invalid response: $HEALTH"
    fi
  else
    print_error "Failed"
  fi
  
  # Test 2: Frontend endpoint
  echo ""
  echo -n "2. Testing frontend endpoint... "
  if docker exec ${CONTAINER_NAME} curl -s http://localhost:${PORT}/ | grep -q "<!DOCTYPE\|<html"; then
    print_success "Frontend loads"
  else
    print_error "Frontend not loading"
  fi
  
  # Test 3: API endpoint
  echo ""
  echo -n "3. Testing API endpoint... "
  if TEST=$(docker exec ${CONTAINER_NAME} curl -s -X POST http://localhost:${PORT}/api/test \
    -H "Content-Type: application/json" \
    -d '{"test":"data"}'); then
    if echo "$TEST" | grep -q '"ok":true'; then
      print_success "API works"
    else
      print_error "API error: $TEST"
    fi
  else
    print_error "Failed"
  fi
  
  # Test 4: Check logs
  echo ""
  echo "4. Checking logs for errors..."
  if docker logs ${CONTAINER_NAME} | grep -i "error\|failed" | head -3; then
    print_error "Errors found in logs"
  else
    print_success "No errors in logs"
  fi
  
  # Test 5: Container health status
  echo ""
  echo -n "5. Checking container health status... "
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME} 2>/dev/null || echo "none")
  if [ "$STATUS" = "healthy" ]; then
    print_success "Container is healthy"
  else
    print_info "Health status: $STATUS"
  fi
  
  echo ""
  echo "Test Summary:"
  echo "  Frontend: http://localhost:${PORT}"
  echo "  API: http://localhost:${PORT}/api/health"
  echo "  Logs: docker logs -f ${CONTAINER_NAME}"
}

# Inspect command
cmd_inspect() {
  print_header "Inspecting Docker Image"
  
  if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "${IMAGE_NAME}"; then
    print_error "Image not found: ${IMAGE_NAME}"
    echo "Build it with: bash docker-build-test.sh build"
    return 1
  fi
  
  echo "Image Information:"
  docker images ${IMAGE_NAME}
  
  echo ""
  echo "Layer Sizes (largest first):"
  docker history ${IMAGE_NAME}:${IMAGE_TAG} --no-trunc | awk 'NR>1' | sort -k2 -h -r | head -15
  
  echo ""
  echo "Total Image Size:"
  docker inspect ${IMAGE_NAME}:${IMAGE_TAG} --format='{{.Size}}' | awk '{printf "%.2f MB\n", $1/1024/1024}'
}

# Push command
cmd_push() {
  if [ -z "$REGISTRY" ]; then
    print_error "Registry not configured"
    echo "Set REGISTRY variable in script or provide as argument"
    echo "Example: REGISTRY=docker.io/username bash docker-build-test.sh push"
    return 1
  fi
  
  print_header "Pushing Image to Registry: $REGISTRY"
  
  # Tag image
  docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
  
  # Push
  if docker push ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}; then
    print_success "Image pushed successfully"
    echo "Pull with: docker pull ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
  else
    print_error "Push failed"
    return 1
  fi
}

# Help command
cmd_help() {
  cat << EOF

${BLUE}DevOps Hub - Docker Build and Test Script${NC}

Usage: bash docker-build-test.sh [command]

Commands:
  build    Build production Docker image
  run      Build and run container
  test     Test running container
  clean    Clean up images and containers
  inspect  Show image details and layer sizes
  push     Push image to registry (requires REGISTRY env var)
  help     Show this help message

Examples:
  # Build image
  bash docker-build-test.sh build

  # Build and run container
  bash docker-build-test.sh run

  # Test the running container
  bash docker-build-test.sh test

  # Clean up everything
  bash docker-build-test.sh clean

  # Push to Docker Hub
  REGISTRY=docker.io/username bash docker-build-test.sh push

Environment Variables:
  IMAGE_NAME   Docker image name (default: devops-hub)
  IMAGE_TAG    Image tag (default: latest)
  REGISTRY     Docker registry URL (for push command)
  CONTAINER_NAME Container name (default: devops-hub)
  PORT         Expose port (default: 5000)

${YELLOW}Quick Start:${NC}
  1. bash docker-build-test.sh build
  2. bash docker-build-test.sh run
  3. bash docker-build-test.sh test

EOF
}

# Main
if [ $# -eq 0 ]; then
  cmd_help
  exit 0
fi

case "$1" in
  build)
    cmd_build
    ;;
  run)
    cmd_run
    ;;
  test)
    cmd_test
    ;;
  clean)
    cmd_clean
    ;;
  inspect)
    cmd_inspect
    ;;
  push)
    cmd_push
    ;;
  help)
    cmd_help
    ;;
  *)
    print_error "Unknown command: $1"
    cmd_help
    exit 1
    ;;
esac

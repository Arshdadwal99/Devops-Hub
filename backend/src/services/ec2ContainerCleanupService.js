/**
 * EC2 Container Cleanup Service
 * 
 * Provides idempotent container cleanup for EC2 deployments via SSM
 * Handles:
 * - Logging existing containers and ports before cleanup
 * - Gracefully stopping running containers
 * - Force removing containers
 * - Verifying ports are freed
 * - Comprehensive logging for debugging
 * 
 * Features:
 * ✅ Idempotent - safe to run multiple times
 * ✅ No manual SSH required - uses SSM
 * ✅ Graceful shutdown - respects 30s timeout
 * ✅ Port verification - ensures port is free before deployment
 * ✅ Comprehensive logging - all cleanup steps logged
 * ✅ Force cleanup - removes stuck containers
 */

import { logger } from "../utils/logger.js";

class Ec2ContainerCleanupService {
  /**
   * Generate bash script for idempotent container cleanup
   * @param {string} containerName - Name of container to cleanup
   * @param {number} publicPort - Port that should be freed (default 80)
   * @returns {string} Bash script for cleanup
   */
  static generateCleanupScript(containerName, publicPort = 80) {
    return `
# ============================================================================
# EC2 CONTAINER CLEANUP - IDEMPOTENT & SSM-COMPATIBLE
# ============================================================================
# Requirements:
# - Container name: ${containerName}
# - Port to free: ${publicPort}
# - Graceful stop timeout: 30 seconds
# ============================================================================

echo "[DevOpsHub][Cleanup] start - Preparing container cleanup"
echo "[DevOpsHub][Cleanup] container_name=${containerName}"
echo "[DevOpsHub][Cleanup] public_port=${publicPort}"

# ============================================================================
# STEP 1: LOG EXISTING CONTAINERS & PORT STATUS
# ============================================================================
echo "[DevOpsHub][Existing Containers] Running containers BEFORE cleanup:"
docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" || true

echo "[DevOpsHub][Existing Containers] All containers (including stopped):"
docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" || true

echo "[DevOpsHub][Port Check] Checking port ${publicPort} status BEFORE cleanup"
PORTS_IN_USE=\$(netstat -tuln 2>/dev/null | grep ":${publicPort}" || echo "")
if [ -n "\$PORTS_IN_USE" ]; then
  echo "[DevOpsHub][Port Check] Port ${publicPort} is currently IN USE:"
  echo "\$PORTS_IN_USE"
else
  echo "[DevOpsHub][Port Check] Port ${publicPort} is currently FREE"
fi

# ============================================================================
# STEP 2: STOP EXISTING CONTAINER GRACEFULLY
# ============================================================================
if docker ps -a --format '{{.Names}}' | grep -q "^${containerName}\$"; then
  echo "[DevOpsHub][Container Stop] Found existing container: ${containerName}"
  
  if docker ps --format '{{.Names}}' | grep -q "^${containerName}\$"; then
    echo "[DevOpsHub][Container Stop] Container is RUNNING, stopping gracefully with 30s timeout"
    docker stop ${containerName} --time 30 2>&1 | sed 's/^/[DevOpsHub][Container Stop] /'
    sleep 2
    echo "[DevOpsHub][Container Stop] Graceful stop completed"
  else
    echo "[DevOpsHub][Container Stop] Container is already STOPPED"
  fi
else
  echo "[DevOpsHub][Container Stop] No container found with name: ${containerName} (skipping stop)"
fi

# ============================================================================
# STEP 3: FORCEFULLY REMOVE CONTAINER
# ============================================================================
echo "[DevOpsHub][Container Remove] Attempting to remove container: ${containerName}"
if docker ps -a --format '{{.Names}}' | grep -q "^${containerName}\$"; then
  docker rm -f ${containerName} 2>&1 | sed 's/^/[DevOpsHub][Container Remove] /'
  sleep 1
  if docker ps -a --format '{{.Names}}' | grep -q "^${containerName}\$"; then
    echo "[DevOpsHub][Container Remove] WARNING: Container still exists after force remove"
  else
    echo "[DevOpsHub][Container Remove] Container successfully removed"
  fi
else
  echo "[DevOpsHub][Container Remove] Container does not exist (skipping remove)"
fi

# ============================================================================
# STEP 4: FORCE REMOVE CONTAINERS STUCK ON PORT
# ============================================================================
echo "[DevOpsHub][Port Force Clean] Force cleaning any containers on port ${publicPort}"
STUCK_CONTAINERS=\$(docker ps -a --filter "expose=${publicPort}" --format "{{.ID}} {{.Names}}" 2>/dev/null || echo "")
if [ -n "\$STUCK_CONTAINERS" ]; then
  echo "[DevOpsHub][Port Force Clean] Found stuck containers, removing them:"
  printf '%s\n' "\$STUCK_CONTAINERS" | while read -r CONTAINER_ID CONTAINER_NAME_VAR; do
    if [ -n "\$CONTAINER_ID" ]; then
      # Skip if it's the container we want to deploy
      if [ "\$CONTAINER_NAME_VAR" != "${containerName}" ]; then
        echo "[DevOpsHub][Port Force Clean] Force removing: \$CONTAINER_NAME_VAR (ID: \$CONTAINER_ID)"
        docker rm -f "\$CONTAINER_ID" 2>&1 | sed 's/^/[DevOpsHub][Port Force Clean] /'
      fi
    fi
  done
  sleep 1
else
  echo "[DevOpsHub][Port Force Clean] No stuck containers found on port ${publicPort}"
fi

# ============================================================================
# STEP 5: VERIFY PORT IS FREE (WITH RETRY)
# ============================================================================
echo "[DevOpsHub][Port Verify] Verifying port ${publicPort} is free"
MAX_WAIT_SECONDS=30
ELAPSED_SECONDS=0
while [ \$ELAPSED_SECONDS -lt \$MAX_WAIT_SECONDS ]; do
  PORTS_IN_USE=\$(netstat -tuln 2>/dev/null | grep ":${publicPort}" || echo "")
  if [ -z "\$PORTS_IN_USE" ]; then
    echo "[DevOpsHub][Port Verify] ✅ SUCCESS: Port ${publicPort} is now FREE"
    echo "[DevOpsHub][Cleanup] complete - Port verified free and ready for deployment"
    exit 0
  else
    echo "[DevOpsHub][Port Verify] Waiting for port to free... (\$ELAPSED_SECONDS/\$MAX_WAIT_SECONDS seconds)"
    sleep 1
    ELAPSED_SECONDS=\$((ELAPSED_SECONDS + 1))
  fi
done

# ============================================================================
# STEP 6: PORT STILL IN USE - DIAGNOSTIC & FINAL ATTEMPT
# ============================================================================
echo "[DevOpsHub][Port Verify] ⚠️  WARNING: Port ${publicPort} still in use after \$MAX_WAIT_SECONDS seconds"
echo "[DevOpsHub][Port Verify] Attempting diagnostic to identify process:"
lsof -i :\${publicPort} 2>/dev/null || netstat -tuln 2>/dev/null | grep ":${publicPort}" || true

echo "[DevOpsHub][Port Verify] Attempting one final force-kill of process on port ${publicPort}:"
fuser -k \${publicPort}/tcp 2>/dev/null || echo "[DevOpsHub][Port Verify] Could not kill process (may not exist)"

# Final wait and verify
sleep 2
if netstat -tuln 2>/dev/null | grep -q ":${publicPort}"; then
  echo "[DevOpsHub][Port Verify] ❌ FAILED: Port ${publicPort} is still in use"
  echo "[DevOpsHub][Cleanup] complete - WARNING: Port not freed, deployment may fail"
  exit 1
else
  echo "[DevOpsHub][Port Verify] ✅ SUCCESS: Port ${publicPort} finally freed"
  echo "[DevOpsHub][Cleanup] complete - Port verified free and ready for deployment"
  exit 0
fi
`;
  }

  /**
   * Generate full deployment script with cleanup
   * @param {string} containerName - Container name
   * @param {string} imageRef - Docker image reference (username/repo:tag)
   * @param {string} dockerCredentialsCommand - Command to login to Docker
   * @param {number} appPort - Application port
   * @param {number} publicPort - Public port (default 80)
   * @returns {string} Complete deployment bash script
   */
  static generateFullDeploymentScript({
    containerName,
    imageRef,
    dockerCredentialsCommand,
    publicPort = 80,
    instanceId = "unknown",
  }) {
    return `
#!/usr/bin/env bash
set -eu

echo "[DevOpsHub][Deploy] Starting EC2 deployment"
echo "[DevOpsHub][Deploy] instance_id=${instanceId}"
echo "[DevOpsHub][Deploy] image=${imageRef}"
echo "[DevOpsHub][Deploy] container=to-do-list"

LOCK_DIR="/tmp/devopshub-to-do-list-deploy.lock"
LOCK_INFO_FILE="$LOCK_DIR/lock"
REPOSITORY_NAME="to-do-list"
IMAGE_REF="${imageRef}"
CONTAINER_NAME="to-do-list"

log_cmd() {
  echo "[DevOpsHub][Command] $*"
}

run_cmd() {
  log_cmd "$@"
  "$@"
}

run_shell() {
  log_cmd "$*"
  bash -o pipefail -c "$*"
}

write_deploy_lock_info() {
  {
    echo "pid=$$"
    echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "repository=$REPOSITORY_NAME"
  } > "$LOCK_INFO_FILE"
}

release_deploy_lock() {
  echo "[DevOpsHub][Deploy Lock] Releasing"
  rm -rf "$LOCK_DIR"
}

if mkdir "$LOCK_DIR" 2>/dev/null; then
  write_deploy_lock_info
  echo "[DevOpsHub][Deploy Lock] Acquired"
else
  LOCK_PID=""
  if [ -f "$LOCK_INFO_FILE" ]; then
    LOCK_PID=$(sed -n 's/^pid=//p' "$LOCK_INFO_FILE" | head -1)
  fi
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[DevOpsHub][Deploy Lock] Existing deployment still active: $LOCK_DIR (pid=$LOCK_PID)"
    exit 1
  fi
  echo "[DevOpsHub][Deploy Lock] Removing stale lock: $LOCK_DIR"
  rm -rf "$LOCK_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "[DevOpsHub][Deploy Lock] Existing deployment still active: $LOCK_DIR"
    exit 1
  fi
  write_deploy_lock_info
  echo "[DevOpsHub][Deploy Lock] Acquired"
fi
trap release_deploy_lock EXIT
trap 'trap - EXIT; release_deploy_lock; exit 130' INT
trap 'trap - EXIT; release_deploy_lock; exit 143' TERM

echo "[DevOpsHub][Required Cleanup] Running mandatory cleanup before docker compose deployment"
run_shell "docker rm -f to-do-list 2>/dev/null || true"
run_shell "docker ps -aq --filter \\"name=to-do-list\\" | xargs -r docker rm -f"
run_shell "sudo fuser -k ${publicPort}/tcp 2>/dev/null || true"
run_shell "docker container prune -f || true"
run_shell "docker network prune -f || true"
run_cmd sleep 5

echo "[DevOpsHub][Docker Login] Starting"
${dockerCredentialsCommand}
echo "[DevOpsHub][Docker Login] success"

echo "[DevOpsHub][Git] Cloning hotel-booking repository if missing"
run_shell "git clone https://github.com/Arshdadwal99/hotel-booking.git /opt/hotel-booking || true"

echo "[DevOpsHub][Git] Entering repository"
run_cmd cd /opt/hotel-booking

echo "[DevOpsHub][Git] Fetching latest code"
run_cmd git fetch origin

echo "[DevOpsHub][Git] Resetting to origin/master"
run_cmd git reset --hard origin/master

echo "[DevOpsHub][Docker Compose] down"
run_shell "docker compose down || true"

echo "[DevOpsHub][Docker Compose] pull"
run_shell "docker compose pull || true"

echo "[DevOpsHub][Docker Compose] up"
run_cmd docker compose up -d --build

echo "[DevOpsHub][Docker Compose] ps"
run_cmd docker compose ps

echo "[DevOpsHub][Health Check] Frontend http://localhost:3034"
run_cmd curl -f http://localhost:3034

echo "[DevOpsHub][Health Check] Admin panel http://localhost:3033"
run_cmd curl -f http://localhost:3033

echo "[DevOpsHub][Health Check] Backend http://localhost:3035"
run_cmd curl -f http://localhost:3035

echo "[DevOpsHub][Final Verification] Deployment completed successfully"
`;
  }

  /**
   * Log cleanup operation details
   */
  static logCleanupOperation(operationDetails) {
    logger.info("[EC2-CLEANUP] Container cleanup operation", {
      containerName: operationDetails.containerName,
      publicPort: operationDetails.publicPort,
      instanceId: operationDetails.instanceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Parse cleanup logs from SSM output
   */
  static parseCleanupLogs(ssmOutput) {
    const lines = ssmOutput.split('\n');
    const cleanupInfo = {
      existingContainers: [],
      portStatus: { beforeCleanup: null, afterCleanup: null },
      containersStopped: [],
      containersRemoved: [],
      warnings: [],
    };

    lines.forEach(line => {
      if (line.includes('[DevOpsHub][Existing Containers]')) {
        cleanupInfo.existingContainers.push(line.trim());
      }
      if (line.includes('[DevOpsHub][Port Check]')) {
        cleanupInfo.portStatus.beforeCleanup = line.trim();
      }
      if (line.includes('[DevOpsHub][Port Verify]')) {
        cleanupInfo.portStatus.afterCleanup = line.trim();
      }
      if (line.includes('[DevOpsHub][Container Stop]') && line.includes('stopped')) {
        cleanupInfo.containersStopped.push(line.trim());
      }
      if (line.includes('[DevOpsHub][Container Remove]') && line.includes('removed')) {
        cleanupInfo.containersRemoved.push(line.trim());
      }
      if (line.includes('[DevOpsHub][Port Verify]') && line.includes('WARNING')) {
        cleanupInfo.warnings.push(line.trim());
      }
    });

    return cleanupInfo;
  }
}

export { Ec2ContainerCleanupService };

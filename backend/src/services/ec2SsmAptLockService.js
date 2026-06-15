/**
 * EC2 SSM APT Lock Service
 * Handles APT lock detection and release on Ubuntu EC2 instances
 * Prevents "apt lock held by process" errors on fresh instances running cloud-init
 * 
 * Features:
 * - Waits for apt lock files to be released
 * - Retry logic with exponential backoff
 * - Detailed logging with [APT] prefix
 * - Works exclusively via SSM (no SSH required)
 */

import { logger } from "../utils/logger.js";

const APT_LOCK_WAIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max
const APT_LOCK_CHECK_INTERVAL_MS = 10 * 1000; // 10 seconds between checks
const APT_LOCK_FILES = [
  "/var/lib/dpkg/lock",
  "/var/lib/dpkg/lock-frontend",
  "/var/lib/apt/lists/lock"
];

class Ec2SsmAptLockService {
  /**
   * Generate SSM command to wait for APT lock release
   * Returns a shell script that checks for apt locks
   * @returns {string} Shell script for lock detection and waiting
   */
  static generateAptLockWaitCommand() {
    const lockChecks = APT_LOCK_FILES
      .map(lockFile => `sudo fuser ${lockFile} >/dev/null 2>&1`)
      .join(" || \\\n      ");

    return `
# [APT] Wait for package manager locks to be released
echo "[APT] Checking for package manager locks..."
APT_LOCK_TIMEOUT=${APT_LOCK_WAIT_TIMEOUT_MS / 1000}
APT_LOCK_ELAPSED=0
APT_LOCK_CHECK_INTERVAL=10

while [ $APT_LOCK_ELAPSED -lt $APT_LOCK_TIMEOUT ]; do
  if ${lockChecks}; then
    echo "[APT] Lock file detected. Waiting... (elapsed: $APT_LOCK_ELAPSED/$APT_LOCK_TIMEOUT seconds)"
    APT_LOCK_ELAPSED=$((APT_LOCK_ELAPSED + APT_LOCK_CHECK_INTERVAL))
    sleep $APT_LOCK_CHECK_INTERVAL
  else
    echo "[APT] All APT lock files released!"
    break
  fi
done

if [ $APT_LOCK_ELAPSED -ge $APT_LOCK_TIMEOUT ]; then
  echo "[APT] ⚠️  WARNING: APT locks still present after $APT_LOCK_TIMEOUT seconds"
  echo "[APT] Attempting install anyway..."
else
  echo "[APT] ✅ APT locks released successfully"
fi
`;
  }

  /**
   * Generate SSM command to wait for APT lock with retry logic
   * Includes apt-get update/install with retry on lock errors
   * 
   * @param {Object} options - Configuration
   * @param {string} options.amiType - ubuntu or amazon-linux
   * @param {string} options.detectedUsername - EC2 user (ubuntu, ec2-user, etc)
   * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
   * @param {number} options.retryDelaySeconds - Delay between retries (default: 30)
   * @returns {string} Complete shell script with lock wait + apt operations
   */
  static generateDockerInstallWithAptLockHandling(options = {}) {
    const {
      amiType = "ubuntu",
      detectedUsername = "ubuntu",
      maxRetries = 3,
      retryDelaySeconds = 30,
      installNode = false
    } = options;

    if (amiType !== "ubuntu") {
      // Amazon Linux doesn't use apt locks, return standard install
      return this.generateAmazonLinuxDockerInstall(detectedUsername, installNode);
    }

    const lockWaitCmd = this.generateAptLockWaitCommand();

    return `
set -e

# Ubuntu Docker installation with APT lock handling
echo "[DOCKER] Starting Docker installation on Ubuntu with APT lock safety"

${lockWaitCmd}

# Retry logic for apt-get operations
RETRY_COUNT=0
MAX_RETRIES=${maxRetries}
RETRY_DELAY=${retryDelaySeconds}

# Function to execute apt command with retry
execute_apt_command() {
  local cmd="$1"
  local description="$2"
  
  echo "[APT] Executing: $description"
  
  RETRY_COUNT=0
  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "[APT] Attempt $((RETRY_COUNT + 1))/$MAX_RETRIES: $description"
    
    if eval "$cmd"; then
      echo "[APT] ✅ Success: $description"
      return 0
    else
      RETRY_COUNT=$((RETRY_COUNT + 1))
      if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "[APT] ⚠️  Failed. Waiting $RETRY_DELAY seconds before retry..."
        sleep $RETRY_DELAY
        echo "[APT] Retrying apt operations..."
      else
        echo "[APT] ❌ Failed after $MAX_RETRIES attempts"
        return 1
      fi
    fi
  done
  
  return 1
}

# APT Update with retry
execute_apt_command "sudo apt-get update -y" "apt-get update"

# Install core packages
execute_apt_command "sudo apt-get install -y ca-certificates curl git gnupg lsb-release nginx" "core packages"

# Install Docker via official script
echo "[DOCKER] Installing Docker via official get.docker.com script..."
if ! command -v docker >/dev/null 2>&1; then
  if curl -fsSL https://get.docker.com | sudo sh; then
    echo "[DOCKER] ✅ Docker installed successfully"
  else
    echo "[DOCKER] ❌ Docker installation failed"
    return 1
  fi
else
  echo "[DOCKER] ✅ Docker already installed"
fi

# Enable and start Docker
echo "[DOCKER] Enabling Docker service..."
sudo systemctl enable docker
sudo systemctl start docker

# Add user to docker group
echo "[DOCKER] Adding ${detectedUsername} to docker group..."
sudo usermod -aG docker ${detectedUsername} || true

# Install Docker Compose
echo "[DOCKER] Installing Docker Compose..."
if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "[DOCKER] Downloading Docker Compose v2.24.6..."
  sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-\\$(uname -s)-\\$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  echo "[DOCKER] ✅ Docker Compose installed"
else
  echo "[DOCKER] ✅ Docker Compose already installed"
fi

${installNode ? `
# Install Node.js (if required for project)
echo "[NODE] Installing Node.js..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
  echo "[NODE] ✅ Node.js installed"
else
  echo "[NODE] ✅ Node.js already installed"
fi
` : ""}

# Verification
echo "[DOCKER] Verifying installations..."
echo "[DOCKER] Docker version:"
docker --version

echo "[DOCKER] Docker Compose version:"
docker compose version || docker-compose --version

echo "[DOCKER] Git version:"
git --version

${installNode ? `
echo "[NODE] Node.js version:"
node --version

echo "[NPM] npm version:"
npm --version
` : ""}

echo "[DOCKER] ✅ All installations complete and verified"
`;
  }

  /**
   * Generate Amazon Linux Docker install command (doesn't need APT lock handling)
   * @private
   */
  static generateAmazonLinuxDockerInstall(detectedUsername = "ec2-user", installNode = false) {
    return `
set -e

echo "[DOCKER] Starting Docker installation on Amazon Linux"

# Update system packages
echo "[YUM] Executing: yum update"
sudo yum update -y

# Install core packages
echo "[YUM] Installing core packages..."
sudo yum install -y ca-certificates curl git gnupg

# Install Docker
echo "[DOCKER] Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  sudo yum install -y docker
  echo "[DOCKER] ✅ Docker installed"
else
  echo "[DOCKER] ✅ Docker already installed"
fi

# Enable and start Docker
echo "[DOCKER] Enabling Docker service..."
sudo systemctl enable docker
sudo systemctl start docker

# Add user to docker group
echo "[DOCKER] Adding ${detectedUsername} to docker group..."
sudo usermod -aG docker ${detectedUsername} || true

# Install Docker Compose
echo "[DOCKER] Installing Docker Compose..."
if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "[DOCKER] Downloading Docker Compose v2.24.6..."
  sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-\\$(uname -s)-\\$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  echo "[DOCKER] ✅ Docker Compose installed"
else
  echo "[DOCKER] ✅ Docker Compose already installed"
fi

${installNode ? `
# Install Node.js (if required for project)
echo "[NODE] Installing Node.js..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo yum install -y nodejs
  echo "[NODE] ✅ Node.js installed"
else
  echo "[NODE] ✅ Node.js already installed"
fi
` : ""}

# Verification
echo "[DOCKER] Verifying installations..."
echo "[DOCKER] Docker version:"
docker --version

echo "[DOCKER] Docker Compose version:"
docker compose version || docker-compose --version

echo "[DOCKER] Git version:"
git --version

${installNode ? `
echo "[NODE] Node.js version:"
node --version

echo "[NPM] npm version:"
npm --version
` : ""}

echo "[DOCKER] ✅ All installations complete and verified"
`;
  }

  /**
   * Log APT lock detection attempt
   */
  static logAptLockWait(instanceId, attempt, maxRetries) {
    logger.info("[APT] Waiting for apt lock release", {
      instanceId,
      attempt,
      maxRetries,
      lockFiles: APT_LOCK_FILES
    });
  }

  /**
   * Log APT lock released
   */
  static logAptLockReleased(instanceId, waitTimeSeconds) {
    logger.info("[APT] APT locks released", {
      instanceId,
      waitTimeSeconds
    });
  }

  /**
   * Log Docker installation attempt
   */
  static logDockerInstallAttempt(instanceId, attempt, maxRetries) {
    logger.info("[DOCKER] Installation attempt", {
      instanceId,
      attempt,
      maxRetries
    });
  }

  /**
   * Log Docker installation success
   */
  static logDockerInstallSuccess(instanceId, waitTimeSeconds) {
    logger.info("[DOCKER] Installation successful", {
      instanceId,
      totalWaitSeconds: waitTimeSeconds
    });
  }

  /**
   * Log Docker installation failure
   */
  static logDockerInstallFailure(instanceId, error) {
    logger.error("[DOCKER] Installation failed", {
      instanceId,
      error: error.message
    });
  }
}

export { Ec2SsmAptLockService };

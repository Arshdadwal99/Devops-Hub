/**
 * EC2 AMI Detection Service
 * Automatically detects Linux AMI type and provides correct SSH username
 * Supports: Ubuntu, Amazon Linux
 */

const AMI_PATTERNS = {
  ubuntu: {
    pattern: /ubuntu/i,
    username: "ubuntu",
    updateCommand: "apt-get update",
    installCommand: "apt-get install -y",
    dockerInstall: "apt-get install -y docker.io",
  },
  "amazon-linux": {
    pattern: /amazon linux|amzn/i,
    username: "ec2-user",
    updateCommand: "yum update -y",
    installCommand: "yum install -y",
    dockerInstall: "yum install -y docker",
  },
  debian: {
    pattern: /debian/i,
    username: "admin",
    updateCommand: "apt-get update",
    installCommand: "apt-get install -y",
    dockerInstall: "apt-get install -y docker.io",
  },
};

/**
 * Detect Linux AMI type from OS identifier
 */
export function detectAmiType(osIdentifier) {
  if (!osIdentifier) return "ubuntu"; // Default to Ubuntu

  const identifier = String(osIdentifier).toLowerCase();

  for (const [amiType, config] of Object.entries(AMI_PATTERNS)) {
    if (config.pattern.test(identifier)) {
      return amiType;
    }
  }

  return "ubuntu"; // Fallback to Ubuntu
}

/**
 * Get SSH username for AMI type
 */
export function getAmiUsername(osIdentifier) {
  const amiType = detectAmiType(osIdentifier);
  return AMI_PATTERNS[amiType]?.username || "ubuntu";
}

/**
 * Get update command for AMI type
 */
export function getUpdateCommand(osIdentifier) {
  const amiType = detectAmiType(osIdentifier);
  return AMI_PATTERNS[amiType]?.updateCommand || "apt-get update";
}

/**
 * Get install command for AMI type
 */
export function getInstallCommand(osIdentifier) {
  const amiType = detectAmiType(osIdentifier);
  return AMI_PATTERNS[amiType]?.installCommand || "apt-get install -y";
}

/**
 * Get Docker install command for AMI type
 */
export function getDockerInstallCommand(osIdentifier) {
  const amiType = detectAmiType(osIdentifier);
  return AMI_PATTERNS[amiType]?.dockerInstall || "apt-get install -y docker.io";
}

/**
 * Get full AMI configuration
 */
export function getAmiConfig(osIdentifier) {
  const amiType = detectAmiType(osIdentifier);
  return {
    amiType,
    ...AMI_PATTERNS[amiType],
  };
}

/**
 * Validate operating system identifier
 */
export function validateOsIdentifier(osIdentifier) {
  if (!osIdentifier) {
    return {
      valid: false,
      error: "Operating system identifier is required",
    };
  }

  const amiType = detectAmiType(osIdentifier);
  if (!amiType) {
    return {
      valid: false,
      error: `Unsupported operating system: ${osIdentifier}`,
      supportedOs: Object.keys(AMI_PATTERNS),
    };
  }

  return {
    valid: true,
    amiType,
    username: AMI_PATTERNS[amiType].username,
  };
}

/**
 * Get Docker verification command
 * Returns a command that verifies Docker is installed and running
 */
export function getDockerVerificationCommand(osIdentifier) {
  return "docker info >/dev/null 2>&1 && echo 'Docker is installed and running' && docker --version && (docker compose version || docker-compose --version)";
}

/**
 * Get Docker installation verification command
 * Returns a command that returns error if Docker is not installed
 */
export function getDockerInstallationCheckCommand(osIdentifier) {
  return "command -v docker >/dev/null 2>&1 || { echo 'Docker not installed'; exit 1; }";
}

export default {
  detectAmiType,
  getAmiUsername,
  getUpdateCommand,
  getInstallCommand,
  getDockerInstallCommand,
  getAmiConfig,
  validateOsIdentifier,
  getDockerVerificationCommand,
  getDockerInstallationCheckCommand,
};

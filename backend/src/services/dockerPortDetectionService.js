import { execSync } from "child_process";
import { logger } from "../utils/logger.js";

/**
 * Docker Port Detection Service
 * Detects exposed ports from Docker images using docker image inspect
 * Supports automatic port configuration for any application
 */

class DockerPortDetectionService {
  /**
   * Detect the exposed port from a Docker image
   * @param {string} imageRef - Docker image reference (e.g., "arshdadwal99/to-do-list:latest")
   * @param {number} defaultPort - Default port if detection fails (default: 3000)
   * @returns {Promise<{port: number, protocol: string, source: string, allPorts: Array}>}
   */
  static async detectExposedPort(imageRef, defaultPort = 3000) {
    try {
      logger.info("[PORT-DETECTION] Starting port detection", {
        imageRef,
        defaultPort,
      });

      // Try to inspect the image
      let imageInspectOutput;
      try {
        imageInspectOutput = execSync(`docker image inspect ${imageRef}`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error) {
        logger.warn("[PORT-DETECTION] Image not found locally, attempting to pull", {
          imageRef,
          error: error.message,
        });
        // Try to pull the image first
        try {
          execSync(`docker pull ${imageRef}`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          imageInspectOutput = execSync(`docker image inspect ${imageRef}`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch (pullError) {
          logger.warn("[PORT-DETECTION] Could not pull image, using default port", {
            imageRef,
            error: pullError.message,
          });
          return {
            port: defaultPort,
            protocol: "tcp",
            source: "default",
            allPorts: [],
            reason: "Image inspection failed, using default port",
          };
        }
      }

      // Parse the JSON output
      const imageData = JSON.parse(imageInspectOutput)[0];
      
      if (!imageData) {
        throw new Error("No image data returned from inspection");
      }

      // Extract exposed ports from Config.ExposedPorts
      const exposedPorts = imageData.Config?.ExposedPorts || {};
      const portEntries = Object.keys(exposedPorts);

      logger.info("[PORT-DETECTION] Found exposed ports", {
        imageRef,
        exposedPorts: portEntries,
      });

      if (portEntries.length === 0) {
        logger.warn("[PORT-DETECTION] No exposed ports found, using default", {
          imageRef,
          defaultPort,
        });
        return {
          port: defaultPort,
          protocol: "tcp",
          source: "default",
          allPorts: [],
          reason: "No exposed ports in image, using default port",
        };
      }

      // Parse port entries (format: "port/protocol", e.g., "3000/tcp", "5000/udp")
      const tcpPorts = [];
      const allPorts = [];

      for (const portEntry of portEntries) {
        const [port, protocol] = portEntry.split("/");
        const portNum = parseInt(port, 10);

        allPorts.push({
          port: portNum,
          protocol: protocol || "tcp",
          entry: portEntry,
        });

        // Prefer TCP ports
        if (protocol === "tcp" || !protocol) {
          tcpPorts.push(portNum);
        }
      }

      // Select the port to use
      let selectedPort = defaultPort;
      let source = "default";

      if (tcpPorts.length > 0) {
        // Use the first exposed TCP port
        selectedPort = tcpPorts[0];
        source = "exposed";
      } else if (allPorts.length > 0) {
        // Fallback to first available port (even if UDP)
        selectedPort = allPorts[0].port;
        source = "exposed";
      }

      logger.info("[PORT-DETECTION] Port detection successful", {
        imageRef,
        detectedPort: selectedPort,
        allExposedPorts: allPorts,
        source,
      });

      return {
        port: selectedPort,
        protocol: "tcp",
        source,
        allPorts,
        exposedPortsFromImage: portEntries,
      };
    } catch (error) {
      logger.error("[PORT-DETECTION] Port detection failed", {
        imageRef,
        error: error.message,
        stack: error.stack,
      });

      // Return default port on any error
      return {
        port: defaultPort,
        protocol: "tcp",
        source: "default",
        allPorts: [],
        error: error.message,
        reason: "Port detection error, using default port",
      };
    }
  }

  /**
   * Detect port from image and log comprehensive info
   * @param {string} imageRef - Docker image reference
   * @param {number} defaultPort - Default port fallback
   * @returns {Promise<number>} The detected or default port
   */
  static async getApplicationPort(imageRef, defaultPort = 3000) {
    const detection = await this.detectExposedPort(imageRef, defaultPort);
    
    console.log("[PORT-DETECTION] Port detection result:", {
      imageRef,
      detectedPort: detection.port,
      source: detection.source,
      exposedPorts: detection.exposedPortsFromImage,
    });

    return detection.port;
  }

  /**
   * Validate that a port is available for use
   * @param {number} port - Port number to validate
   * @returns {boolean} True if port is valid
   */
  static validatePort(port) {
    const portNum = Number(port);
    return (
      Number.isInteger(portNum) &&
      portNum > 0 &&
      portNum < 65536 &&
      portNum !== 22 && // SSH
      portNum !== 80 && // Host port (we use this for mapping)
      portNum !== 443 // HTTPS
    );
  }

  /**
   * Get port with validation
   * @param {string} imageRef - Docker image reference
   * @param {number} defaultPort - Default port
   * @returns {Promise<number>} Validated port number
   */
  static async getValidatedPort(imageRef, defaultPort = 3000) {
    const port = await this.getApplicationPort(imageRef, defaultPort);
    
    if (!this.validatePort(port)) {
      logger.warn("[PORT-DETECTION] Invalid port detected, using default", {
        detectedPort: port,
        defaultPort,
      });
      return defaultPort;
    }

    return port;
  }
}

export { DockerPortDetectionService };

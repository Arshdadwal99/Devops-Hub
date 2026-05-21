import fs from "fs/promises";
import path from "path";
import { TECH_STACKS } from "./techStackDetectorService.js";

/**
 * Docker Compose Generator Service
 * Generates optimized docker-compose.yml files
 */

function generateNodeComposeService(detection, containerName, containerPort) {
  return {
    image: `${containerName}:latest`,
    ports: [`${containerPort}:${containerPort}`],
    environment: {
      NODE_ENV: "production",
      PORT: containerPort,
    },
    restart: "unless-stopped",
    healthcheck: {
      test: [
        "CMD",
        "node",
        "-e",
        `require('http').get('http://localhost:${containerPort}', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})`,
      ],
      interval: "30s",
      timeout: "10s",
      retries: 3,
      start_period: "5s",
    },
    networks: ["app-network"],
    volumes: [".env:/app/.env"],
  };
}

function generatePythonComposeService(detection, containerName, containerPort) {
  return {
    image: `${containerName}:latest`,
    ports: [`${containerPort}:${containerPort}`],
    environment: {
      PYTHONUNBUFFERED: "1",
      PORT: containerPort,
    },
    restart: "unless-stopped",
    healthcheck: {
      test: ["CMD", "curl", "-f", `http://localhost:${containerPort}/health`],
      interval: "30s",
      timeout: "10s",
      retries: 3,
      start_period: "10s",
    },
    networks: ["app-network"],
    volumes: [".env:/app/.env"],
  };
}

function generateStaticComposeService(detection, containerName, containerPort) {
  return {
    image: `${containerName}:latest`,
    ports: ["80:80", "443:443"],
    restart: "unless-stopped",
    healthcheck: {
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/"],
      interval: "30s",
      timeout: "10s",
      retries: 3,
      start_period: "5s",
    },
    networks: ["app-network"],
  };
}

/**
 * Generate docker-compose.yml based on detection
 */
export async function generateDockerCompose(detection, containerName, containerPort = 3000) {
  try {
    const compose = {
      version: "3.9",
      services: {
        app: {},
      },
      networks: {
        "app-network": {
          driver: "bridge",
        },
      },
    };

    // Set up service based on tech stack
    switch (detection.primaryStack) {
      case TECH_STACKS.NODE_JS:
      case TECH_STACKS.NEXTJS:
      case TECH_STACKS.REACT:
      case TECH_STACKS.MERN:
        compose.services.app = generateNodeComposeService(detection, containerName, containerPort);
        break;
      case TECH_STACKS.PYTHON:
      case TECH_STACKS.DJANGO:
      case TECH_STACKS.FASTAPI:
      case TECH_STACKS.FLASK:
        compose.services.app = generatePythonComposeService(detection, containerName, containerPort);
        break;
      case TECH_STACKS.STATIC:
        compose.services.app = generateStaticComposeService(detection, containerName, containerPort);
        break;
      default:
        compose.services.app = generateNodeComposeService(detection, containerName, containerPort);
    }

    // Add optional MongoDB if it's a MERN stack
    if (detection.primaryStack === TECH_STACKS.MERN) {
      compose.services.mongodb = {
        image: "mongo:7-alpine",
        restart: "unless-stopped",
        environment: {
          MONGO_INITDB_DATABASE: "devops_hub",
        },
        volumes: ["mongodb_data:/data/db"],
        networks: ["app-network"],
        healthcheck: {
          test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"],
          interval: "10s",
          timeout: "5s",
          retries: 5,
        },
      };

      compose.volumes = {
        mongodb_data: {},
      };

      // Update app service to link to MongoDB
      compose.services.app.depends_on = {
        mongodb: {
          condition: "service_healthy",
        },
      };
      compose.services.app.environment.MONGODB_URI = "mongodb://mongodb:27017/devops_hub";
    }

    // Convert to YAML format (since we can't use yaml library, we'll generate string)
    const yaml = generateYamlString(compose);

    return {
      success: true,
      yaml,
      compose,
    };
  } catch (error) {
    console.error("Error generating docker-compose:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Write docker-compose.yml to file
 */
export async function writeDockerCompose(repoPath, yaml) {
  try {
    const composePath = path.join(repoPath, "docker-compose.yml");
    await fs.writeFile(composePath, yaml, "utf-8");

    return {
      success: true,
      path: composePath,
    };
  } catch (error) {
    console.error("Error writing docker-compose.yml:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Convert compose object to YAML string
 * Simple YAML generator without external dependencies
 */
function generateYamlString(obj, indent = 0) {
  const spaces = "  ".repeat(indent);
  let yaml = "";

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      yaml += `${spaces}${key}: ${JSON.stringify(value)}\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        yaml += `${spaces}${key}: []\n`;
      } else if (value.every((item) => typeof item === "string")) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          yaml += `${spaces}  - ${JSON.stringify(item)}\n`;
        }
      } else {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === "object") {
            yaml += generateYamlString(item, indent + 1);
          } else {
            yaml += `${spaces}  - ${JSON.stringify(item)}\n`;
          }
        }
      }
    } else if (typeof value === "object") {
      yaml += `${spaces}${key}:\n`;
      yaml += generateYamlString(value, indent + 1);
    }
  }

  return yaml;
}

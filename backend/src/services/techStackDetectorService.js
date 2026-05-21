import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

/**
 * Tech Stack Detector Service
 * Automatically detects project type and technology stack
 */

export const TECH_STACKS = {
  REACT: "react",
  NODE_JS: "nodejs",
  PYTHON: "python",
  NEXTJS: "nextjs",
  MERN: "mern",
  STATIC: "static",
  VUE: "vue",
  ANGULAR: "angular",
  DJANGO: "django",
  FASTAPI: "fastapi",
  FLASK: "flask",
  RUBY: "ruby",
  JAVA: "java",
  GO: "go",
  PHP: "php",
};

/**
 * Detect tech stack by analyzing repository files
 */
export async function detectTechStack(repoPath) {
  try {
    const packageJsonPath = path.join(repoPath, "package.json");
    const pySetupPath = path.join(repoPath, "setup.py");
    const pyTomlPath = path.join(repoPath, "pyproject.toml");
    const requirementsPath = path.join(repoPath, "requirements.txt");
    const gemfilePath = path.join(repoPath, "Gemfile");
    const goModPath = path.join(repoPath, "go.mod");
    const pomPath = path.join(repoPath, "pom.xml");
    const dockerfilePath = path.join(repoPath, "Dockerfile");
    const composePath = path.join(repoPath, "docker-compose.yml");

    const detection = {
      primaryStack: null,
      technologies: [],
      frameworks: [],
      packageManager: null,
      hasDocker: false,
      hasCompose: false,
      ports: [],
      buildScript: null,
      startScript: null,
      dependencies: {},
    };

    // Check for Docker files
    if (existsSync(dockerfilePath)) {
      detection.hasDocker = true;
    }
    if (existsSync(composePath)) {
      detection.hasCompose = true;
    }

    // Detect Node.js projects
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, "utf-8")
        );
        detection.dependencies = packageJson.dependencies || {};
        detection.devDependencies = packageJson.devDependencies || {};

        // Detect specific frameworks
        const deps = Object.keys(detection.dependencies);
        const devDeps = Object.keys(detection.devDependencies);
        const allDeps = [...deps, ...devDeps];

        if (allDeps.includes("next")) {
          detection.primaryStack = TECH_STACKS.NEXTJS;
          detection.technologies = ["nodejs", "nextjs", "react"];
          detection.frameworks = ["next.js"];
          detection.ports = [3000];
          detection.packageManager = "npm";
        } else if (allDeps.includes("react") || allDeps.includes("react-dom")) {
          if (allDeps.includes("express")) {
            detection.primaryStack = TECH_STACKS.MERN;
            detection.technologies = ["nodejs", "react", "mongodb"];
            detection.frameworks = ["express", "react"];
            detection.ports = [3000, 5000];
            detection.packageManager = "npm";
          } else {
            detection.primaryStack = TECH_STACKS.REACT;
            detection.technologies = ["nodejs", "react"];
            detection.frameworks = ["react"];
            detection.ports = [3000];
            detection.packageManager = "npm";
          }
        } else if (allDeps.includes("express") || allDeps.includes("fastify")) {
          detection.primaryStack = TECH_STACKS.NODE_JS;
          detection.technologies = ["nodejs"];
          detection.frameworks = allDeps.includes("express")
            ? ["express"]
            : allDeps.includes("fastify")
            ? ["fastify"]
            : [];
          detection.ports = [3000, 5000, 8000];
          detection.packageManager = "npm";
        } else {
          detection.primaryStack = TECH_STACKS.NODE_JS;
          detection.technologies = ["nodejs"];
          detection.packageManager = "npm";
          detection.ports = [3000];
        }

        detection.buildScript = packageJson.scripts?.build;
        detection.startScript =
          packageJson.scripts?.start || packageJson.scripts?.dev;
      } catch (error) {
        console.error("Error parsing package.json:", error.message);
      }
    }

    // Detect Python projects
    if (
      existsSync(pySetupPath) ||
      existsSync(pyTomlPath) ||
      existsSync(requirementsPath)
    ) {
      if (!detection.primaryStack) {
        detection.technologies = ["python"];
        detection.packageManager = "pip";
        detection.ports = [8000];

        if (existsSync(requirementsPath)) {
          try {
            const requirements = await fs.readFile(requirementsPath, "utf-8");
            if (requirements.includes("django")) {
              detection.primaryStack = TECH_STACKS.DJANGO;
              detection.frameworks = ["django"];
            } else if (
              requirements.includes("fastapi") ||
              requirements.includes("starlette")
            ) {
              detection.primaryStack = TECH_STACKS.FASTAPI;
              detection.frameworks = ["fastapi"];
            } else if (requirements.includes("flask")) {
              detection.primaryStack = TECH_STACKS.FLASK;
              detection.frameworks = ["flask"];
            } else {
              detection.primaryStack = TECH_STACKS.PYTHON;
            }
          } catch (error) {
            detection.primaryStack = TECH_STACKS.PYTHON;
          }
        } else {
          detection.primaryStack = TECH_STACKS.PYTHON;
        }
      }
    }

    // Detect Ruby projects
    if (existsSync(gemfilePath)) {
      if (!detection.primaryStack) {
        detection.primaryStack = TECH_STACKS.RUBY;
        detection.technologies = ["ruby"];
        detection.packageManager = "bundler";
        detection.ports = [3000];
      }
    }

    // Detect Go projects
    if (existsSync(goModPath)) {
      if (!detection.primaryStack) {
        detection.primaryStack = TECH_STACKS.GO;
        detection.technologies = ["go"];
        detection.ports = [8080];
      }
    }

    // Detect Java projects
    if (existsSync(pomPath)) {
      if (!detection.primaryStack) {
        detection.primaryStack = TECH_STACKS.JAVA;
        detection.technologies = ["java"];
        detection.packageManager = "maven";
        detection.ports = [8080];
      }
    }

    // Check for static HTML/CSS/JS only
    const filesInRoot = await fs.readdir(repoPath);
    const htmlFiles = filesInRoot.filter((f) =>
      [".html", ".htm"].some((ext) => f.endsWith(ext))
    );

    if (!detection.primaryStack && (htmlFiles.length > 0 || filesInRoot.includes("index.html"))) {
      detection.primaryStack = TECH_STACKS.STATIC;
      detection.technologies = ["html", "css", "javascript"];
      detection.ports = [80];
    }

    // Default to Node.js if nothing detected
    if (!detection.primaryStack) {
      detection.primaryStack = TECH_STACKS.NODE_JS;
      detection.technologies = ["nodejs"];
      detection.packageManager = "npm";
      detection.ports = [3000];
    }

    // Extract port from environment files if present
    const envPath = path.join(repoPath, ".env");
    if (existsSync(envPath)) {
      try {
        const envContent = await fs.readFile(envPath, "utf-8");
        const portMatch = envContent.match(/PORT\s*=\s*(\d+)/);
        if (portMatch) {
          const port = parseInt(portMatch[1]);
          if (!detection.ports.includes(port)) {
            detection.ports.unshift(port);
          }
        }
      } catch (error) {
        // Ignore env file errors
      }
    }

    return {
      success: true,
      detection,
    };
  } catch (error) {
    console.error("Error detecting tech stack:", error.message);
    return {
      success: false,
      error: error.message,
      detection: null,
    };
  }
}

/**
 * Get recommended port for detected stack
 */
export function getRecommendedPort(techStack) {
  const portMap = {
    [TECH_STACKS.REACT]: 3000,
    [TECH_STACKS.NODE_JS]: 3000,
    [TECH_STACKS.NEXTJS]: 3000,
    [TECH_STACKS.MERN]: 3000,
    [TECH_STACKS.PYTHON]: 8000,
    [TECH_STACKS.DJANGO]: 8000,
    [TECH_STACKS.FASTAPI]: 8000,
    [TECH_STACKS.FLASK]: 5000,
    [TECH_STACKS.RUBY]: 3000,
    [TECH_STACKS.STATIC]: 80,
    [TECH_STACKS.JAVA]: 8080,
    [TECH_STACKS.GO]: 8080,
    [TECH_STACKS.VUE]: 3000,
    [TECH_STACKS.ANGULAR]: 4200,
    [TECH_STACKS.PHP]: 80,
  };

  return portMap[techStack] || 3000;
}

/**
 * Get build command for detected stack
 */
export function getBuildCommand(detection) {
  if (detection.buildScript) {
    return "npm run build";
  }

  switch (detection.primaryStack) {
    case TECH_STACKS.NEXTJS:
      return "npm run build";
    case TECH_STACKS.REACT:
      return "npm run build";
    case TECH_STACKS.NODE_JS:
      return "npm install";
    case TECH_STACKS.DJANGO:
      return "python manage.py collectstatic --noinput";
    case TECH_STACKS.FASTAPI:
      return "pip install -r requirements.txt";
    case TECH_STACKS.PYTHON:
      return "pip install -r requirements.txt";
    case TECH_STACKS.STATIC:
      return "echo 'Static site'";
    default:
      return "npm install";
  }
}

/**
 * Get start command for detected stack
 */
export function getStartCommand(detection) {
  if (detection.startScript) {
    return `npm start`;
  }

  switch (detection.primaryStack) {
    case TECH_STACKS.NEXTJS:
      return "npm start";
    case TECH_STACKS.REACT:
      return "npm start";
    case TECH_STACKS.NODE_JS:
      return "node index.js || npm start || node server.js";
    case TECH_STACKS.DJANGO:
      return "python manage.py runserver 0.0.0.0:8000";
    case TECH_STACKS.FASTAPI:
      return "uvicorn main:app --host 0.0.0.0 --port 8000";
    case TECH_STACKS.FLASK:
      return "python app.py";
    case TECH_STACKS.PYTHON:
      return "python main.py";
    case TECH_STACKS.STATIC:
      return "python -m http.server 80";
    case TECH_STACKS.RUBY:
      return "rails server -b 0.0.0.0";
    default:
      return "npm start";
  }
}

/**
 * Get base image for detected stack
 */
export function getBaseImage(detection) {
  switch (detection.primaryStack) {
    case TECH_STACKS.NODE_JS:
    case TECH_STACKS.NEXTJS:
    case TECH_STACKS.REACT:
    case TECH_STACKS.MERN:
      return "node:18-alpine";
    case TECH_STACKS.PYTHON:
    case TECH_STACKS.DJANGO:
    case TECH_STACKS.FASTAPI:
    case TECH_STACKS.FLASK:
      return "python:3.11-slim";
    case TECH_STACKS.RUBY:
      return "ruby:3.2-alpine";
    case TECH_STACKS.JAVA:
      return "openjdk:17-jdk-alpine";
    case TECH_STACKS.GO:
      return "golang:1.21-alpine";
    case TECH_STACKS.STATIC:
      return "nginx:alpine";
    default:
      return "node:18-alpine";
  }
}

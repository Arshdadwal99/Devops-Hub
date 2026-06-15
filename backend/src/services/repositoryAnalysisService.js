import axios from "axios";
import { User } from "../models/User.js";

const GITHUB_API_BASE = "https://api.github.com";

async function getGitHubAccessToken(userId) {
  const user = await User.findById(userId).select("+githubAccessToken");

  if (!user || !user.githubAccessToken) {
    throw new Error("GitHub not connected");
  }

  return user.githubAccessToken;
}

function createGitHubClient(accessToken) {
  return axios.create({
    baseURL: GITHUB_API_BASE,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function fetchRootContents(client, owner, repo) {
  const response = await client.get(`/repos/${owner}/${repo}/contents/`);
  return Array.isArray(response.data) ? response.data : [];
}

async function fetchFileContent(client, owner, repo, filePath) {
  try {
    const response = await client.get(`/repos/${owner}/${repo}/contents/${filePath}`);

    if (response.data?.encoding === "base64" && response.data?.content) {
      return Buffer.from(response.data.content, "base64").toString("utf-8");
    }

    return response.data?.content || "";
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }

    throw error;
  }
}

async function githubPathExists(client, owner, repo, filePath) {
  try {
    await client.get(`/repos/${owner}/${repo}/contents/${filePath}`);
    return true;
  } catch (error) {
    if (error.response?.status === 404) {
      return false;
    }

    throw error;
  }
}

function addUnique(items, value) {
  if (value && !items.includes(value)) {
    items.push(value);
  }
}

function getPackageJsonDetection(content) {
  const detection = {
    stack: [],
    buildCommand: null,
    startCommand: null,
    recommendedPort: 3000,
  };

  try {
    const packageJson = JSON.parse(content);
    const dependencies = Object.keys(packageJson.dependencies || {});
    const devDependencies = Object.keys(packageJson.devDependencies || {});
    const allDependencies = new Set([...dependencies, ...devDependencies]);
    const scripts = packageJson.scripts || {};

    addUnique(detection.stack, "Node.js");

    if (allDependencies.has("next")) {
      addUnique(detection.stack, "Next.js");
      addUnique(detection.stack, "React");
      detection.recommendedPort = 3000;
    }

    if (allDependencies.has("react") || allDependencies.has("react-dom")) {
      addUnique(detection.stack, "React");
    }

    if (allDependencies.has("vite") || scripts.dev?.includes("vite") || scripts.build?.includes("vite")) {
      addUnique(detection.stack, "Vite");
      detection.recommendedPort = 5173;
    }

    if (allDependencies.has("express")) {
      addUnique(detection.stack, "Express");
      detection.recommendedPort = 3000;
    }

    detection.buildCommand = scripts.build ? "npm run build" : null;
    detection.startCommand = scripts.start
      ? "npm start"
      : scripts.dev
      ? "npm run dev"
      : null;
  } catch (error) {
    console.warn("[Repository Analysis] Could not parse package.json:", error.message);
  }

  return detection;
}

function getRequirementsDetection(content) {
  const detection = {
    stack: ["Python"],
    buildCommand: "pip install -r requirements.txt",
    startCommand: "python app.py",
    recommendedPort: 8000,
  };

  const lowerContent = content.toLowerCase();

  if (lowerContent.includes("django")) {
    addUnique(detection.stack, "Django");
    detection.startCommand = "python manage.py runserver 0.0.0.0:8000";
    detection.recommendedPort = 8000;
  }

  if (lowerContent.includes("flask")) {
    addUnique(detection.stack, "Flask");
    detection.startCommand = "flask run --host=0.0.0.0";
    detection.recommendedPort = 5000;
  }

  return detection;
}

function getPomDetection(content) {
  const detection = {
    stack: ["Java"],
    buildCommand: "mvn clean package",
    startCommand: "java -jar target/*.jar",
    recommendedPort: 8080,
  };

  if (content.toLowerCase().includes("spring-boot")) {
    addUnique(detection.stack, "Spring Boot");
    detection.startCommand = "mvn spring-boot:run";
  }

  return detection;
}

function scoreReport(report) {
  let score = 35;

  if (report.stack.length > 0) score += 15;
  if (report.dockerfileExists) score += 20;
  if (report.dockerComposeExists) score += 5;
  if (report.jenkinsfileExists || report.githubActionsExists) score += 15;
  if (report.buildCommand) score += 5;
  if (report.startCommand) score += 5;
  if (report.environmentExampleExists) score += 5;

  return Math.min(score, 100);
}

function buildRecommendations(report) {
  const recommendations = [];

  if (!report.dockerfileExists) {
    recommendations.push("Dockerfile missing");
  }

  if (!report.jenkinsfileExists) {
    recommendations.push("Jenkinsfile missing");
  }

  if (!report.environmentExampleExists) {
    recommendations.push("Environment variables may be required");
  }

  if (!report.buildCommand) {
    recommendations.push("Build command could not be detected");
  }

  if (!report.startCommand) {
    recommendations.push("Start command could not be detected");
  }

  return recommendations;
}

function toLegacyAnalysis(report, detectedFiles) {
  return {
    ...report,
    technologies: report.stack,
    frameworks: report.stack.filter((item) =>
      ["React", "Vite", "Next.js", "Express", "Django", "Flask", "Spring Boot"].includes(item)
    ),
    hasDocker: report.dockerfileExists,
    hasDockerCompose: report.dockerComposeExists,
    hasJenkinsfile: report.jenkinsfileExists,
    hasGitHubActions: report.githubActionsExists,
    hasEnvironmentExample: report.environmentExampleExists,
    deploymentReadinessScore: report.deploymentScore,
    detectedFiles,
    analyzedAt: new Date().toISOString(),
  };
}

export async function analyzeRepository(userId, owner, repo) {
  try {
    const accessToken = await getGitHubAccessToken(userId);
    const client = createGitHubClient(accessToken);
    const rootContents = await fetchRootContents(client, owner, repo);
    const rootNames = new Set(rootContents.map((item) => item.name));
    const detectedFiles = [];

    const report = {
      stack: [],
      dockerfileExists: rootNames.has("Dockerfile"),
      dockerComposeExists: rootNames.has("docker-compose.yml") || rootNames.has("docker-compose.yaml"),
      jenkinsfileExists: rootNames.has("Jenkinsfile"),
      githubActionsExists: false,
      environmentExampleExists:
        rootNames.has(".env.example") || rootNames.has(".env.local") || rootNames.has(".env"),
      buildCommand: null,
      startCommand: null,
      recommendedPort: 3000,
      deploymentScore: 0,
      recommendations: [],
    };

    if (report.dockerfileExists) detectedFiles.push("Dockerfile");
    if (report.dockerComposeExists) detectedFiles.push("docker-compose.yml");
    if (report.jenkinsfileExists) detectedFiles.push("Jenkinsfile");
    if (report.environmentExampleExists) detectedFiles.push(".env.example");

    report.githubActionsExists = rootNames.has(".github")
      ? await githubPathExists(client, owner, repo, ".github/workflows")
      : false;

    if (report.githubActionsExists) {
      detectedFiles.push(".github/workflows");
    }

    if (rootNames.has("package.json")) {
      const packageJsonContent = await fetchFileContent(client, owner, repo, "package.json");

      if (packageJsonContent) {
        const packageDetection = getPackageJsonDetection(packageJsonContent);
        packageDetection.stack.forEach((tech) => addUnique(report.stack, tech));
        report.buildCommand = packageDetection.buildCommand || report.buildCommand;
        report.startCommand = packageDetection.startCommand || report.startCommand;
        report.recommendedPort = packageDetection.recommendedPort || report.recommendedPort;
        detectedFiles.push("package.json");
      }
    }

    if (rootNames.has("requirements.txt")) {
      const requirementsContent = await fetchFileContent(client, owner, repo, "requirements.txt");

      if (requirementsContent) {
        const pythonDetection = getRequirementsDetection(requirementsContent);
        pythonDetection.stack.forEach((tech) => addUnique(report.stack, tech));
        report.buildCommand = report.buildCommand || pythonDetection.buildCommand;
        report.startCommand = report.startCommand || pythonDetection.startCommand;
        report.recommendedPort = pythonDetection.recommendedPort;
        detectedFiles.push("requirements.txt");
      }
    }

    if (rootNames.has("pom.xml")) {
      const pomContent = await fetchFileContent(client, owner, repo, "pom.xml");
      const javaDetection = getPomDetection(pomContent || "");
      javaDetection.stack.forEach((tech) => addUnique(report.stack, tech));
      report.buildCommand = report.buildCommand || javaDetection.buildCommand;
      report.startCommand = report.startCommand || javaDetection.startCommand;
      report.recommendedPort = javaDetection.recommendedPort;
      detectedFiles.push("pom.xml");
    }

    if (report.stack.length === 0) {
      addUnique(report.stack, "Unknown");
    }

    report.deploymentScore = scoreReport(report);
    report.recommendations = buildRecommendations(report);

    return {
      success: true,
      ...report,
      data: toLegacyAnalysis(report, detectedFiles),
    };
  } catch (error) {
    const githubMessage = error.response?.data?.message;
    throw new Error(`Repository analysis failed: ${githubMessage || error.message}`);
  }
}

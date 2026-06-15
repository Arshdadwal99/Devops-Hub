import axios from "axios";
import { Pipeline } from "../models/Pipeline.js";
import { createGitHubWriteClient, getGitHubAccessToken } from "./githubService.js";
import { isDbConnected, localDB } from "../db.js";
import { buildGitHubActionsWorkflow } from "../templates/githubActionsWorkflowTemplates.js";

const GITHUB_API_BASE = "https://api.github.com";
const WORKFLOW_PATH = ".github/workflows/deploy.yml";

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

async function fetchFile(client, owner, repo, filePath, branch) {
  try {
    const response = await client.get(`/repos/${owner}/${repo}/contents/${filePath}`, {
      params: branch ? { ref: branch } : {},
    });

    if (response.data?.encoding === "base64" && response.data?.content) {
      return {
        content: Buffer.from(response.data.content, "base64").toString("utf-8"),
        sha: response.data.sha,
      };
    }

    return { content: "", sha: response.data?.sha };
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

function readPackageJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function hasScript(packageJson, scriptName) {
  return Boolean(packageJson.scripts?.[scriptName]);
}

function getNodeCommands(packageJson, hasPackageLock) {
  const installCommand = hasPackageLock ? "npm ci" : "npm install";
  const testCommand = hasScript(packageJson, "test") ? "npm test -- --watch=false" : "echo \"No test script configured\"";
  const buildCommand = hasScript(packageJson, "build") ? "npm run build" : "echo \"No build script configured\"";

  return { installCommand, testCommand, buildCommand };
}

function getPythonCommands(files) {
  const installCommand = files.requirements
    ? "python -m pip install --upgrade pip && pip install -r requirements.txt"
    : "python -m pip install --upgrade pip && pip install -e .";
  const testCommand = /pytest/i.test(files.requirements || "") ? "pytest" : "python -m unittest discover";
  const buildCommand = "python -m compileall .";

  return { installCommand, testCommand, buildCommand };
}

function getJavaCommands(files) {
  if (files.gradle) {
    return {
      installCommand: "chmod +x ./gradlew || true",
      testCommand: "./gradlew test",
      buildCommand: "./gradlew build",
    };
  }

  return {
    installCommand: "echo \"Maven dependencies resolved during build\"",
    testCommand: "mvn test",
    buildCommand: "mvn -B package --file pom.xml",
  };
}

function detectFromFiles(files) {
  const packageJson = files.packageJson ? readPackageJson(files.packageJson) : null;
  const deps = packageJson
    ? new Set([
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {}),
      ])
    : new Set();

  if (packageJson && deps.has("next")) {
    return {
      projectType: "Next.js",
      runtime: "node",
      setupAction: "actions/setup-node@v4",
      version: "20",
      appPort: 3000,
      ...getNodeCommands(packageJson, files.packageLock),
    };
  }

  if (packageJson && (deps.has("react") || deps.has("react-dom"))) {
    return {
      projectType: "React",
      runtime: "node",
      setupAction: "actions/setup-node@v4",
      version: "20",
      appPort: deps.has("vite") ? 5173 : 3000,
      ...getNodeCommands(packageJson, files.packageLock),
    };
  }

  if (packageJson) {
    return {
      projectType: "Node.js",
      runtime: "node",
      setupAction: "actions/setup-node@v4",
      version: "20",
      appPort: 3000,
      ...getNodeCommands(packageJson, files.packageLock),
    };
  }

  if (files.requirements || files.pyproject || files.setupPy) {
    return {
      projectType: "Python",
      runtime: "python",
      setupAction: "actions/setup-python@v5",
      version: "3.11",
      appPort: /flask/i.test(files.requirements || "") ? 5000 : 8000,
      ...getPythonCommands(files),
    };
  }

  if (files.pom || files.gradle) {
    return {
      projectType: "Java",
      runtime: "java",
      setupAction: "actions/setup-java@v4",
      version: "17",
      appPort: 8080,
      ...getJavaCommands(files),
    };
  }

  return {
    projectType: "Node.js",
    runtime: "node",
    setupAction: "actions/setup-node@v4",
    version: "20",
    appPort: 3000,
    installCommand: "npm install",
    testCommand: "echo \"No test command detected\"",
    buildCommand: "echo \"No build command detected\"",
  };
}

async function getDetection(client, owner, repo, branch) {
  const [
    packageJson,
    packageLock,
    requirements,
    pyproject,
    setupPy,
    pom,
    gradle,
  ] = await Promise.all([
    fetchFile(client, owner, repo, "package.json", branch),
    fetchFile(client, owner, repo, "package-lock.json", branch),
    fetchFile(client, owner, repo, "requirements.txt", branch),
    fetchFile(client, owner, repo, "pyproject.toml", branch),
    fetchFile(client, owner, repo, "setup.py", branch),
    fetchFile(client, owner, repo, "pom.xml", branch),
    fetchFile(client, owner, repo, "build.gradle", branch),
  ]);

  return detectFromFiles({
    packageJson: packageJson?.content,
    packageLock: Boolean(packageLock),
    requirements: requirements?.content,
    pyproject: pyproject?.content,
    setupPy: setupPy?.content,
    pom: pom?.content,
    gradle: gradle?.content,
  });
}

export async function previewCicdPipeline(userId, { owner, repo, branch = "main" }) {
  const accessToken = await getGitHubAccessToken(userId);
  const client = createGitHubClient(accessToken);
  const detection = await getDetection(client, owner, repo, branch);
  const workflow = buildGitHubActionsWorkflow({ owner, repo, branch, detection });

  return {
    success: true,
    stage: "Generate CI/CD Pipeline",
    path: WORKFLOW_PATH,
    owner,
    repo,
    branch,
    projectType: detection.projectType,
    runtime: detection,
    workflow,
    nextSteps: ["Connect Docker Hub", "Connect EC2", "Enable Auto Deploy"],
  };
}

async function commitWorkflow(client, { owner, repo, branch, workflow }) {
  const existing = await fetchFile(client, owner, repo, WORKFLOW_PATH, branch);
  const response = await client.put(`/repos/${owner}/${repo}/contents/${WORKFLOW_PATH}`, {
    message: "Generate CI/CD deployment pipeline",
    content: Buffer.from(workflow, "utf-8").toString("base64"),
    branch,
    ...(existing?.sha ? { sha: existing.sha } : {}),
  });

  return {
    sha: response.data?.content?.sha,
    commitUrl: response.data?.commit?.html_url,
  };
}

export async function generateCicdPipeline(userId, { owner, repo, branch = "main", workflow: editedWorkflow }) {
  const preview = editedWorkflow
    ? {
        ...(await previewCicdPipeline(userId, { owner, repo, branch })),
        workflow: editedWorkflow,
      }
    : await previewCicdPipeline(userId, { owner, repo, branch });

  const client = createGitHubWriteClient();
  const commit = await commitWorkflow(client, {
    owner,
    repo,
    branch,
    workflow: preview.workflow,
  });

  const pipelineData = {
    userId,
    name: "GitHub Actions Deploy",
    status: "pending",
    deploymentStatus: "healthy",
    provider: "github-actions",
    repository: {
      owner,
      name: repo,
      branch,
      workflowPath: WORKFLOW_PATH,
      htmlUrl: `https://github.com/${owner}/${repo}`,
    },
    projectType: preview.projectType,
    generatedWorkflow: {
      path: WORKFLOW_PATH,
      content: preview.workflow,
      sha: commit.sha,
      commitUrl: commit.commitUrl,
      generatedAt: new Date(),
    },
    runtime: {
      setupAction: preview.runtime.setupAction,
      version: preview.runtime.version,
      installCommand: preview.runtime.installCommand,
      testCommand: preview.runtime.testCommand,
      buildCommand: preview.runtime.buildCommand,
      dockerImage: `${owner}/${repo}`,
      appPort: preview.runtime.appPort,
    },
    statusTracking: {
      workflowStatus: "committed",
      healthCheckStatus: "pending",
    },
    stages: [
      { name: "Generate CI/CD Pipeline", status: "success", logs: [`Generated ${WORKFLOW_PATH}`] },
      { name: "Connect Docker Hub", status: "pending", logs: [] },
      { name: "Connect EC2", status: "pending", logs: [] },
      { name: "Enable Auto Deploy", status: "pending", logs: [] },
    ],
  };

  const pipeline = isDbConnected()
    ? await Pipeline.create(pipelineData)
    : localDB.createCicdPipeline(pipelineData);

  return {
    success: true,
    message: "CI/CD Pipeline Generated",
    pipeline,
    path: WORKFLOW_PATH,
    commit,
    workflow: preview.workflow,
    nextSteps: preview.nextSteps,
  };
}

export async function getCicdPipelineStatus(userId) {
  const pipelines = isDbConnected()
    ? await Pipeline.find({ userId, provider: "github-actions" }).sort({ createdAt: -1 }).limit(10).lean()
    : localDB.findCicdPipelines(userId).slice(0, 10);

  return {
    success: true,
    pipelines,
    latest: pipelines[0] || null,
  };
}

import axios from "axios";
import { Pipeline } from "../models/Pipeline.js";
import { isDbConnected, localDB } from "../db.js";
import { createGitHubWriteClient, getGitHubAccessToken } from "./githubService.js";
import { getDockerHubStatus } from "./dockerHubRegistryService.js";
import { getJenkinsStatus } from "./jenkinsConnectionService.js";
import { calculateActualWorkflowResources } from "./workflowStateService.js";
import { detectApplicationPort } from "../utils/portDetection.js";

const GITHUB_API_BASE = "https://api.github.com";
const JENKINSFILE_PATH = "Jenkinsfile";
const DEFAULT_DOCKER_CREDENTIALS_ID = "dockerhub-credentials";

function createGitHubClient(accessToken) {
  if (!accessToken) {
    console.error('[GITHUB_CLIENT] No access token provided!');
    throw new Error('[GITHUB] Access token is required');
  }

  console.log('[GITHUB_CLIENT] Creating client with token:', {
    tokenProvided: true,
    tokenStart: accessToken.substring(0, 4) + '...',
  });

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
    console.log('[FETCH_FILE] Attempting to fetch:', { 
      filePath, 
      branch: branch || 'default',
      endpoint: `/repos/${owner}/${repo}/contents/${filePath}`,
    });
    
    const response = await client.get(`/repos/${owner}/${repo}/contents/${filePath}`, {
      params: branch ? { ref: branch } : {},
    });

    console.log('[FETCH_FILE] Success:', { 
      filePath, 
      status: response.status, 
      size: response.data?.content?.length 
    });

    if (response.data?.encoding === "base64" && response.data?.content) {
      return {
        content: Buffer.from(response.data.content, "base64").toString("utf-8"),
        sha: response.data.sha,
      };
    }

    return { content: "", sha: response.data?.sha };
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('[FETCH_FILE] Not found (404):', { 
        filePath, 
        branch: branch || 'default',
      });
      return null;
    }
    
    console.error('[FETCH_FILE] Error:', {
      filePath,
      branch: branch || 'default',
      status: error.response?.status,
      message: error.message,
    });
    
    throw error;
  }
}

/**
 * Parses GitHub URLs in multiple formats and extracts owner and repo
 * Handles:
 *   - https://github.com/Arshdadwal99/to-do-list
 *   - https://github.com/Arshdadwal99/to-do-list.git
 *   - git@github.com:Arshdadwal99/to-do-list.git
 * Always returns: { owner: "Arshdadwal99", repo: "to-do-list" }
 */
function parseGitHubURL(url) {
  if (!url) return { owner: "", repo: "" };
  
  const urlString = String(url).trim();
  console.log('[URL_PARSER] Parsing URL:', urlString);
  
  // Handle https:// and http:// URLs
  const httpsMatch = urlString.match(/https?:\/\/github\.com\/([^/]+)\/([^/\s.git#?]+)/i);
  if (httpsMatch) {
    const owner = httpsMatch[1].trim();
    const repo = httpsMatch[2].trim().replace(/\.git$/i, "");
    console.log('[URL_PARSER] ✅ HTTPS URL parsed:', { owner, repo });
    return { owner, repo };
  }
  
  // Handle git@github.com: URLs
  const gitMatch = urlString.match(/git@github\.com:([^/]+)\/([^/\s.git#?]+)/i);
  if (gitMatch) {
    const owner = gitMatch[1].trim();
    const repo = gitMatch[2].trim().replace(/\.git$/i, "");
    console.log('[URL_PARSER] ✅ SSH URL parsed:', { owner, repo });
    return { owner, repo };
  }
  
  // Fallback: try generic github.com pattern
  const genericMatch = urlString.match(/github\.com[:\/]+([^\/\s]+)\/([^\/\s.git#?]+)/i);
  if (genericMatch) {
    const owner = genericMatch[1].trim();
    const repo = genericMatch[2].trim().replace(/\.git$/i, "");
    console.log('[URL_PARSER] ✅ Generic URL parsed:', { owner, repo });
    return { owner, repo };
  }
  
  console.log('[URL_PARSER] ❌ Could not parse URL');
  return { owner: "", repo: "" };
}

function parsePackageJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function hasScript(packageJson, scriptName) {
  return Boolean(packageJson.scripts?.[scriptName]);
}

function nodeCommands(packageJson, hasPackageLock) {
  return {
    installCommand: hasPackageLock ? "npm ci" : "npm install",
    testCommand: hasScript(packageJson, "test") ? "npm test -- --watch=false" : "echo \"No test script configured\"",
  };
}

function pythonCommands(files) {
  return {
    installCommand: files.requirements
      ? "python3 -m pip install --upgrade pip && python3 -m pip install -r requirements.txt"
      : "python3 -m pip install --upgrade pip && python3 -m pip install -e .",
    testCommand: /pytest/i.test(files.requirements || "") ? "python3 -m pytest" : "python3 -m unittest discover",
  };
}

function javaCommands(files) {
  if (files.gradle) {
    return {
      installCommand: "chmod +x ./gradlew || true",
      testCommand: "./gradlew test",
    };
  }

  return {
    installCommand: "echo \"Maven dependencies resolve during test/build\"",
    testCommand: "mvn -B test",
  };
}

function detectProject(files) {
  const packageJson = files.packageJson ? parsePackageJson(files.packageJson) : null;
  const dependencies = packageJson
    ? new Set([
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {}),
      ])
    : new Set();
  const frameworkDefaultPort = packageJson && dependencies.has("next")
    ? 3000
    : packageJson && (dependencies.has("react") || dependencies.has("react-dom"))
    ? dependencies.has("vite") ? 5173 : 3000
    : packageJson
    ? 3000
    : files.requirements || files.pyproject || files.setupPy
    ? /flask/i.test(files.requirements || "") ? 5000 : 8000
    : files.pom || files.gradle
    ? 8080
    : 3000;
  const detectedPort = detectApplicationPort(
    {
      dockerfile: files.dockerfile,
      dockerCompose: files.dockerCompose,
      sourceFiles: files.sourceFiles,
    },
    frameworkDefaultPort
  );

  if (packageJson && dependencies.has("next")) {
    return {
      projectType: "Next.js",
      appPort: detectedPort.port,
      portSource: detectedPort.source,
      ...nodeCommands(packageJson, files.packageLock),
    };
  }

  if (packageJson && (dependencies.has("react") || dependencies.has("react-dom"))) {
    return {
      projectType: "React",
      appPort: detectedPort.port,
      portSource: detectedPort.source,
      ...nodeCommands(packageJson, files.packageLock),
    };
  }

  if (packageJson) {
    return {
      projectType: "Node.js",
      appPort: detectedPort.port,
      portSource: detectedPort.source,
      ...nodeCommands(packageJson, files.packageLock),
    };
  }

  if (files.requirements || files.pyproject || files.setupPy) {
    return {
      projectType: "Python",
      appPort: detectedPort.port,
      portSource: detectedPort.source,
      ...pythonCommands(files),
    };
  }

  if (files.pom || files.gradle) {
    return {
      projectType: "Java",
      appPort: detectedPort.port,
      portSource: detectedPort.source,
      ...javaCommands(files),
    };
  }

  return {
    projectType: "Node.js",
    appPort: detectedPort.port,
    portSource: detectedPort.source,
    installCommand: "npm install",
    testCommand: "echo \"No test command detected\"",
  };
}

async function getDetection(client, owner, repo, branch) {
  console.log('[DETECTION_START] Starting project detection', { owner, repo, branch });
  
  const [
    packageJson,
    packageLock,
    requirements,
    pyproject,
    setupPy,
    pom,
    gradle,
    dockerfile,
    dockerComposeYml,
    dockerComposeYaml,
    appJs,
    serverJs,
    indexJs,
    srcAppJs,
    srcServerJs,
  ] = await Promise.all([
    fetchFile(client, owner, repo, "package.json", branch),
    fetchFile(client, owner, repo, "package-lock.json", branch),
    fetchFile(client, owner, repo, "requirements.txt", branch),
    fetchFile(client, owner, repo, "pyproject.toml", branch),
    fetchFile(client, owner, repo, "setup.py", branch),
    fetchFile(client, owner, repo, "pom.xml", branch),
    fetchFile(client, owner, repo, "build.gradle", branch),
    fetchFile(client, owner, repo, "Dockerfile", branch),
    fetchFile(client, owner, repo, "docker-compose.yml", branch),
    fetchFile(client, owner, repo, "docker-compose.yaml", branch),
    fetchFile(client, owner, repo, "app.js", branch),
    fetchFile(client, owner, repo, "server.js", branch),
    fetchFile(client, owner, repo, "index.js", branch),
    fetchFile(client, owner, repo, "src/app.js", branch),
    fetchFile(client, owner, repo, "src/server.js", branch),
  ]);

  console.log('[DETECTION] Files found:', {
    hasPackageJson: !!packageJson,
    hasRequirements: !!requirements,
    hasPom: !!pom,
    hasGradle: !!gradle,
    hasDockerfile: !!dockerfile,
    hasDockerCompose: !!(dockerComposeYml || dockerComposeYaml),
  });

  const detection = detectProject({
    packageJson: packageJson?.content,
    packageLock: Boolean(packageLock),
    requirements: requirements?.content,
    pyproject: pyproject?.content,
    setupPy: setupPy?.content,
    pom: pom?.content,
    gradle: gradle?.content,
    dockerfile: dockerfile?.content,
    dockerCompose: dockerComposeYml?.content || dockerComposeYaml?.content,
    sourceFiles: {
      "app.js": appJs?.content,
      "server.js": serverJs?.content,
      "index.js": indexJs?.content,
      "src/app.js": srcAppJs?.content,
      "src/server.js": srcServerJs?.content,
    },
  });

  console.log('[DETECTION_COMPLETE] Project detected:', {
    projectType: detection.projectType,
    appPort: detection.appPort,
    portSource: detection.portSource,
  });
  return detection;
}

function sanitizeImagePart(value) {
  return String(value || "app")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128) || "app";
}

function singleQuote(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildJenkinsfile({ owner, repo, branch, detection, dockerHub, ec2, credentials }) {
  const imageName = `${sanitizeImagePart(dockerHub.username)}/${sanitizeImagePart(repo)}`;
  const containerName = sanitizeImagePart(repo);
  const appPort = Number.parseInt(ec2.port || detection.appPort || 3000, 10);
  const publicPort = 80;
  const healthUrl = `http://${ec2.host}/`;

  return `pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '20'))
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
        timestamps()
    }

    environment {
        PROJECT_TYPE = '${singleQuote(detection.projectType)}'
        REPOSITORY = '${singleQuote(owner)}/${singleQuote(repo)}'
        BRANCH_NAME = '${singleQuote(branch)}'
        DOCKER_IMAGE = '${singleQuote(imageName)}'
        DOCKER_IMAGE_LATEST = '${singleQuote(imageName)}:latest'
        CONTAINER_NAME = '${singleQuote(containerName)}'
        APP_PORT = '${appPort}'
        PUBLIC_PORT = '${publicPort}'
        EC2_HOST = '${singleQuote(ec2.host)}'
        EC2_INSTANCE_ID = '${singleQuote(ec2.instanceId)}'
        AWS_REGION = '${singleQuote(ec2.region || "us-east-1")}'
        HEALTH_URL = '${singleQuote(healthUrl)}'
        DEPLOYMENT_TRANSPORT = 'ssm'
        DOCKER_HUB_CREDENTIALS_ID = '${singleQuote(credentials.dockerHubCredentialsId)}'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Images') {
            steps {
              sh '''
                  docker compose build
              '''
       }
  }

        

        stage('Deploy to EC2') {
          steps {
            sh '''
              docker compose down --remove-orphans || true
              docker compose up -d --build
         '''
         }
       }

        stage('Health Check') {
            steps {
                sh '''
                    docker compose ps
                    curl -f http://localhost:3035 || exit 1
                    curl -f http://localhost:3034 || exit 1
                    curl -f http://localhost:3033 || exit 1
                '''
            }
        }
    }

    post {
        always {
            sh 'docker image prune -f || true'
        }
        success {
            echo 'Jenkins Pipeline Generated and deployment completed successfully.'
        }
        failure {
            echo 'Jenkins pipeline failed. Review console logs for the failed stage.'
        }
    }
}
`;
}

async function getConnectedConfiguration(userId, requestedCredentials = {}) {
  const [dockerHubResult, jenkinsResult, resources] = await Promise.all([
    getDockerHubStatus(userId),
    getJenkinsStatus(userId),
    calculateActualWorkflowResources(userId),
  ]);

  const dockerHub = dockerHubResult.status;
  const jenkins = jenkinsResult.status;
  let ec2 = null;

  if (!dockerHub.connected || !dockerHub.permissions?.push) {
    throw new Error("Connect Docker Hub with push permissions before generating a Jenkinsfile.");
  }

  // Get EC2 info from auto-provisioned resources
  if (resources.actual?.ec2AutoProvisioned && resources.runningInstances?.length > 0) {
    const instance = resources.runningInstances[0];
    const host = instance?.publicIp || instance?.elasticIp || instance?.privateIp;
    if (host) {
      ec2 = {
        connected: true,
        host,
        username: instance?.operatingSystem === "amazon-linux" ? "ec2-user" : "ubuntu",
        source: "auto-provisioned",
        instanceId: instance?.instanceId,
        region: instance?.region,
      };
    }
  }

  if (!ec2) {
    throw new Error("AWS Account must be connected. EC2 will be automatically provisioned.");
  }

  if (!jenkins.connected) {
    throw new Error("Connect Jenkins before generating a Jenkinsfile.");
  }

  return {
    dockerHub,
    ec2,
    jenkins,
    credentials: {
      dockerHubCredentialsId: requestedCredentials.dockerHubCredentialsId || DEFAULT_DOCKER_CREDENTIALS_ID,
    },
  };
}

export async function previewJenkinsPipeline(userId, {
  owner,
  repo,
  branch = "main",
  dockerHubCredentialsId,
  ec2SshCredentialsId,
}) {
  console.log('[PREVIEW_PIPELINE_START] Initiating preview');
  console.log('[GITHUB] Parameters received:', { owner, repo, branch });
  
  const accessToken = await getGitHubAccessToken(userId);
  console.log('[GITHUB] Token verification:', { 
    hasToken: !!accessToken,
    tokenLength: accessToken?.length,
    tokenStart: accessToken?.substring(0, 4) + '...',
  });
  
  const client = createGitHubClient(accessToken);
  console.log('[GITHUB] Client created with token');
  
  const [detection, connected] = await Promise.all([
    getDetection(client, owner, repo, branch),
    getConnectedConfiguration(userId, { dockerHubCredentialsId, ec2SshCredentialsId }),
  ]);

  console.log('[PREVIEW_PIPELINE] Configuration detected:', {
    projectType: detection.projectType,
    appPort: detection.appPort,
  });

  const jenkinsfile = buildJenkinsfile({
    owner,
    repo,
    branch,
    detection,
    dockerHub: connected.dockerHub,
    ec2: connected.ec2,
    credentials: connected.credentials,
  });

  console.log('[PREVIEW_PIPELINE_COMPLETE] Preview generated successfully');

  return {
    success: true,
    stage: "Generate Jenkins Pipeline",
    path: JENKINSFILE_PATH,
    owner,
    repo,
    branch,
    projectType: detection.projectType,
    runtime: detection,
    jenkinsfile,
    configuration: {
      dockerHub: {
        username: connected.dockerHub.username,
        credentialsId: connected.credentials.dockerHubCredentialsId,
      },
      ec2: {
        host: connected.ec2.host,
        instanceId: connected.ec2.instanceId,
        region: connected.ec2.region,
        username: connected.ec2.username,
        port: connected.ec2.port || detection.appPort,
        deploymentTransport: "ssm",
      },
      jenkins: {
        url: connected.jenkins.url,
        username: connected.jenkins.username,
      },
    },
    stages: [
      "Checkout",
      "Install Dependencies",
      "Run Tests",
      "Build Docker Image",
      "Push Docker Image",
      "Deploy to EC2",
      "Health Check",
    ],
  };
}

async function verifyGitHubToken(client) {
  try {
    console.log('=== GITHUB TOKEN VERIFICATION ===');
    const userResponse = await client.get('/user');
    const userData = userResponse.data;
    console.log('[GITHUB] Token user verified:', {
      username: userData?.login,
      id: userData?.id,
      type: userData?.type,
    });
    return {
      valid: true,
      username: userData?.login,
      id: userData?.id,
    };
  } catch (error) {
    console.error('[GITHUB] Token verification failed:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
    });
    return { valid: false, error: error.message };
  }
}

async function verifyRepository(client, owner, repo) {
  try {
    console.log('=== GITHUB REPOSITORY VERIFICATION ===');
    console.log('[GITHUB] Verifying repository:', { owner, repo });
    
    const repoResponse = await client.get(`/repos/${owner}/${repo}`);
    const repoData = repoResponse.data;
    
    console.log('[GITHUB] Repository verified:', {
      full_name: repoData?.full_name,
      default_branch: repoData?.default_branch,
      private: repoData?.private,
      permissions: {
        admin: repoData?.permissions?.admin,
        push: repoData?.permissions?.push,
        pull: repoData?.permissions?.pull,
      },
      status: repoResponse.status,
    });
    
    return {
      exists: true,
      fullName: repoData?.full_name,
      defaultBranch: repoData?.default_branch,
      isPrivate: repoData?.private,
      permissions: repoData?.permissions,
    };
  } catch (error) {
    console.error('[GITHUB] Repository verification failed:', {
      owner,
      repo,
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      responseBody: error.response?.data,
    });
    return {
      exists: false,
      error: error.message,
      status: error.response?.status,
      responseBody: error.response?.data,
    };
  }
}

async function getDefaultBranch(client, owner, repo) {
  try {
    console.log('[GITHUB] Detecting default branch:', { owner, repo });
    const repoResponse = await client.get(`/repos/${owner}/${repo}`);
    const defaultBranch = repoResponse.data?.default_branch;
    console.log('[GITHUB] Default branch detected:', { defaultBranch, status: repoResponse.status });
    return defaultBranch;
  } catch (error) {
    console.error('[GITHUB] Failed to detect default branch:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    throw error;
  }
}

async function commitJenkinsfileLegacy({ owner, repo, branch, jenkinsfile }) {
  console.log('\n========================================');
  console.log('=== GITHUB JENKINSFILE COMMIT START ===');
  console.log('========================================\n');
  console.log('[COMMIT] Using Personal Access Token (PAT) for repository write operation');
  
  // Create write-capable client with PAT token instead of OAuth token
  const client = createGitHubWriteClient();
  
  // Validate owner and repo immediately
  console.log('[VALIDATION] Checking owner and repo parameters');
  if (!owner || !repo) {
    const error = `Invalid repository information. owner=${owner}, repo=${repo}`;
    console.error('[VALIDATION] ❌ ' + error);
    throw new Error('[GITHUB] ' + error);
  }
  console.log('[VALIDATION] ✅ Owner and repo are present:', { owner, repo });
  
  // Verify no null, undefined, or weird values
  if (String(owner).includes('undefined') || String(repo).includes('undefined')) {
    throw new Error(`Invalid repository: owner contains 'undefined' or repo contains 'undefined'`);
  }
  
  console.log('=== GITHUB COMMIT PARAMETERS ===');
  const endpoint = `/repos/${owner}/${repo}/contents/${JENKINSFILE_PATH}`;
  console.log('GITHUB COMMIT PARAMETERS');
  console.log({
    owner,
    repo,
    branch,
    endpoint,
    fullUrl: `${GITHUB_API_BASE}${endpoint}`
  });
  
  // Verify inputs
  if (!jenkinsfile) throw new Error('[GITHUB] jenkinsfile content is missing');

  // Step 1: Verify GitHub token
  console.log('\n--- STEP 1: Token Verification ---');
  const tokenCheck = await verifyGitHubToken(client);
  if (!tokenCheck.valid) {
    throw new Error(`[GITHUB] Invalid token: ${tokenCheck.error}`);
  }

  // Step 2: Verify repository exists
  console.log('\n--- STEP 2: Repository Verification ---');
  console.log(`[GITHUB] Verifying repository exists: GET /repos/${owner}/${repo}`);
  const repoCheck = await verifyRepository(client, owner, repo);
  if (!repoCheck.exists) {
    console.error('\n=== REPOSITORY VERIFICATION FAILED ===');
    console.error({
      owner,
      repo,
      status: repoCheck.status,
      responseBody: repoCheck.responseBody,
      error: repoCheck.error,
    });
    throw new Error(`[GITHUB] Repository not found or inaccessible: ${owner}/${repo}`);
  }

  // Step 3: Verify repository permissions
  console.log('\n--- STEP 3: Permission Verification ---');
  if (!repoCheck.permissions?.push) {
    console.error('\n=== INSUFFICIENT PERMISSIONS ===');
    console.error({
      owner,
      repo,
      permissions: repoCheck.permissions,
      requiredPermission: 'push',
    });
    throw new Error('[GITHUB] Token does not have push permission for this repository');
  }

  // Step 4: Detect default branch and use it
  console.log('\n--- STEP 4: Branch Detection ---');
  let resolvedBranch = branch;
  console.log('[GITHUB] Input branch:', branch);
  console.log('[GITHUB] Repository default branch:', repoCheck.defaultBranch);
  
  // Use repository's actual default branch, not the input
  if (repoCheck.defaultBranch) {
    resolvedBranch = repoCheck.defaultBranch;
    console.log('[GITHUB] Using repository default branch:', resolvedBranch);
  } else if (!resolvedBranch) {
    resolvedBranch = 'main';
    console.log('[GITHUB] Falling back to "main"');
  }

  // Step 5: Verify branch exists
  console.log('\n--- STEP 5: Branch Verification ---');
  try {
    console.log(`[GITHUB] Checking if branch exists: GET /repos/${owner}/${repo}/branches/${resolvedBranch}`);
    const branchCheck = await client.get(`/repos/${owner}/${repo}/branches/${resolvedBranch}`);
    console.log('[GITHUB] Branch exists:', {
      name: branchCheck.data?.name,
      commit: branchCheck.data?.commit?.sha?.substring(0, 7),
    });
  } catch (error) {
    console.error('[GITHUB] Branch verification failed:', {
      branch: resolvedBranch,
      status: error.response?.status,
      message: error.message,
    });
    throw new Error(`[GITHUB] Branch does not exist: ${resolvedBranch}`);
  }

  // Step 6: Check if file exists and get SHA if needed
  console.log('\n--- STEP 6: File Existence Check ---');
  console.log(`[GITHUB] Checking if Jenkinsfile exists: GET /repos/${owner}/${repo}/contents/${JENKINSFILE_PATH}?ref=${resolvedBranch}`);
  const existing = await fetchFile(client, owner, repo, JENKINSFILE_PATH, resolvedBranch);
  console.log('[GITHUB] Existing file check:', { 
    fileExists: !!existing,
    sha: existing?.sha ? existing.sha.substring(0, 7) + '...' : 'not-needed-for-new-file',
  });

  // Step 7: Prepare request
  console.log('\n--- STEP 7: Prepare Request ---');
  console.log('[GITHUB] Request method:', 'PUT');
  console.log('[GITHUB] Endpoint:', endpoint);
  console.log('[GITHUB] Full URL:', `${GITHUB_API_BASE}${endpoint}`);
  console.log('[GITHUB] Request body schema:', {
    message: 'Generate Jenkins deployment pipeline',
    branch: resolvedBranch,
    contentLength: Buffer.from(jenkinsfile, 'utf-8').toString('base64').length,
    hasExistingSha: !!existing?.sha,
  });

  // Step 8: Commit Jenkinsfile
  console.log('\n--- STEP 8: Commit to GitHub ---');
  try {
    console.log('\n=== GITHUB PUT REQUEST ===');
    console.log({
      owner,
      repo,
      branch: resolvedBranch,
      endpoint,
      fullUrl: `${GITHUB_API_BASE}${endpoint}`
    });
    console.log(`[GITHUB] Sending PUT request to ${GITHUB_API_BASE}${endpoint}`);
    
    const response = await client.put(endpoint, {
      message: 'Generate Jenkins deployment pipeline',
      content: Buffer.from(jenkinsfile, 'utf-8').toString('base64'),
      branch: resolvedBranch,
      ...(existing?.sha ? { sha: existing.sha } : {}),
    });

    console.log('\n[GITHUB] ✅ Commit successful!');
    console.log({
      status: response.status,
      sha: response.data?.content?.sha,
      commitUrl: response.data?.commit?.html_url,
      commitSha: response.data?.commit?.sha,
    });

    return {
      sha: response.data?.content?.sha,
      commitUrl: response.data?.commit?.html_url,
    };
  } catch (error) {
  console.error("\n=== FULL GITHUB ERROR ===");

  console.error("REQUEST URL:");
  console.error(error.config?.url);

  console.error("REQUEST METHOD:");
  console.error(error.config?.method);

  console.error("REQUEST DATA:");
  console.error(error.config?.data);

  console.error("RESPONSE STATUS:");
  console.error(error.response?.status);

  console.error("RESPONSE HEADERS:");
  console.error(error.response?.headers);

  console.error("RESPONSE DATA:");
  console.error(JSON.stringify(error.response?.data, null, 2));

  console.error('RESPONSE ERROR:', {
    status: error.response?.status,
    statusText: error.response?.statusText,
    message: error.message,
  });
  console.error('RESPONSE BODY:', error.response?.data);

  if (error.response?.status === 404) {
    console.error('\n=== 404 ERROR ANALYSIS ===');
    console.error({
      endpoint: endpoint,
      owner: owner,
      repo: repo,
      branch: resolvedBranch,
      reason: 'Repository, branch, or endpoint not found. Verify owner, repo name, and branch exist.',
      fullUrl: `${GITHUB_API_BASE}${endpoint}`,
      exactEndpointUsed: `PUT /repos/${owner}/${repo}/contents/Jenkinsfile`,
      possibleReasons: [
        '❌ Repository does not exist',
        '❌ Repository is private and token has no access',
        '❌ Branch does not exist',
        '❌ Token does not have push permission',
        '❌ Endpoint path is incorrect',
      ],
      responseBody: error.response?.data,
    });
  }

  throw error;
  }
}

async function commitJenkinsfile({ owner, repo, branch, jenkinsfile }) {
  console.log('\n========================================');
  console.log('=== GITHUB JENKINSFILE COMMIT START ===');
  console.log('========================================\n');
  console.log('[COMMIT] Using Personal Access Token (PAT) for repository write operation');

  const client = createGitHubWriteClient();
  const repository = `${owner}/${repo}`;
  const endpoint = `/repos/${owner}/${repo}/contents/${JENKINSFILE_PATH}`;

  if (!owner || !repo) {
    throw new Error(`[GITHUB] Invalid repository information. owner=${owner}, repo=${repo}`);
  }
  if (String(owner).includes('undefined') || String(repo).includes('undefined')) {
    throw new Error(`[GITHUB] Invalid repository: owner=${owner}, repo=${repo}`);
  }
  if (!jenkinsfile) {
    throw new Error('[GITHUB] jenkinsfile content is missing');
  }

  console.log('[COMMIT] Repository parameters:', {
    repository,
    branch,
    endpoint,
    fullUrl: `${GITHUB_API_BASE}${endpoint}`,
    jenkinsfileLength: jenkinsfile.length,
  });

  console.log('\n--- STEP 1: Token Verification ---');
  const tokenCheck = await verifyGitHubToken(client);
  if (!tokenCheck.valid) {
    throw new Error(`[GITHUB] Invalid token: ${tokenCheck.error}`);
  }

  console.log('\n--- STEP 2: Repository Verification ---');
  const repoCheck = await verifyRepository(client, owner, repo);
  if (!repoCheck.exists) {
    console.error('[GITHUB] Repository verification failed before Jenkinsfile commit:', {
      repository,
      status: repoCheck.status,
      responseBody: repoCheck.responseBody,
      error: repoCheck.error,
    });
    throw new Error(`[GITHUB] Repository not found or inaccessible: ${repository}`);
  }

  if (!repoCheck.permissions?.push) {
    console.error('[GITHUB] Token does not have push permission:', {
      repository,
      permissions: repoCheck.permissions,
      requiredPermission: 'push',
    });
    throw new Error('[GITHUB] Token does not have push permission for this repository');
  }

  let resolvedBranch = repoCheck.defaultBranch || branch || 'main';
  console.log('\n--- STEP 3: Branch Verification ---');
  console.log('[GITHUB] Branch selected for Jenkinsfile commit:', {
    repository,
    inputBranch: branch,
    defaultBranch: repoCheck.defaultBranch,
    resolvedBranch,
  });

  try {
    const branchCheck = await client.get(`/repos/${owner}/${repo}/branches/${resolvedBranch}`);
    console.log('[GITHUB] Branch exists:', {
      repository,
      branch: resolvedBranch,
      commit: branchCheck.data?.commit?.sha,
    });
  } catch (error) {
    console.error('[GITHUB] Branch verification failed:', {
      repository,
      branch: resolvedBranch,
      status: error.response?.status,
      responseBody: error.response?.data,
      message: error.message,
    });
    throw new Error(`[GITHUB] Branch does not exist: ${resolvedBranch}`);
  }

  const encodedContent = Buffer.from(jenkinsfile, 'utf-8').toString('base64');

  async function fetchLatestJenkinsfile(attempt, reason) {
    console.log('\n--- Jenkinsfile Latest SHA Lookup ---');
    console.log('[GITHUB] Fetching latest Jenkinsfile before update:', {
      repository,
      branch: resolvedBranch,
      attempt,
      reason,
      endpoint: `GET /repos/${owner}/${repo}/contents/${JENKINSFILE_PATH}`,
    });

    const current = await fetchFile(client, owner, repo, JENKINSFILE_PATH, resolvedBranch);

    console.log('[GITHUB] Latest Jenkinsfile state:', {
      repository,
      branch: resolvedBranch,
      attempt,
      exists: !!current,
      currentGitHubSha: current?.sha || null,
      currentContentLength: current?.content?.length || 0,
      generatedContentLength: jenkinsfile.length,
      identicalToGenerated: current?.content === jenkinsfile,
    });

    return current;
  }

  async function putJenkinsfile(current, attempt) {
    const shaBeingUsed = current?.sha || null;

    console.log('\n=== GITHUB JENKINSFILE PUT REQUEST ===');
    console.log({
      repository,
      branch: resolvedBranch,
      attempt,
      retryAttempts: attempt - 1,
      endpoint: `PUT ${endpoint}`,
      fullUrl: `${GITHUB_API_BASE}${endpoint}`,
      currentGitHubSha: current?.sha || null,
      shaBeingUsedForUpdate: shaBeingUsed,
      requestMode: shaBeingUsed ? 'update-existing-Jenkinsfile' : 'create-new-Jenkinsfile',
      includesSha: !!shaBeingUsed,
    });

    return client.put(endpoint, {
      message: 'Generate Jenkins deployment pipeline',
      content: encodedContent,
      branch: resolvedBranch,
      ...(shaBeingUsed ? { sha: shaBeingUsed } : {}),
    });
  }

  console.log('\n--- STEP 4: Idempotent Jenkinsfile Commit ---');
  let current = await fetchLatestJenkinsfile(1, 'initial write attempt');

  if (current?.content === jenkinsfile) {
    console.log('[GITHUB] Jenkinsfile content is identical. Skipping commit and continuing workflow successfully.', {
      repository,
      branch: resolvedBranch,
      currentGitHubSha: current.sha,
      shaBeingUsedForUpdate: null,
      retryAttempts: 0,
      skipped: true,
    });

    return {
      sha: current.sha,
      commitUrl: null,
      skipped: true,
      branch: resolvedBranch,
      message: 'Jenkinsfile already up to date',
    };
  }

  try {
    const response = await putJenkinsfile(current, 1);
    console.log('[GITHUB] Jenkinsfile commit successful:', {
      repository,
      branch: resolvedBranch,
      status: response.status,
      currentGitHubSha: current?.sha || null,
      shaBeingUsedForUpdate: current?.sha || null,
      newContentSha: response.data?.content?.sha,
      commitSha: response.data?.commit?.sha,
      commitUrl: response.data?.commit?.html_url,
      retryAttempts: 0,
    });

    return {
      sha: response.data?.content?.sha,
      commitUrl: response.data?.commit?.html_url,
      skipped: false,
      branch: resolvedBranch,
    };
  } catch (error) {
    console.error('[GITHUB] Jenkinsfile commit failed:', {
      repository,
      branch: resolvedBranch,
      status: error.response?.status,
      statusText: error.response?.statusText,
      currentGitHubSha: current?.sha || null,
      shaBeingUsedForUpdate: current?.sha || null,
      retryAttempts: 0,
      message: error.message,
      githubErrorResponseBody: error.response?.data,
    });

    if (error.response?.status !== 409) {
      throw error;
    }

    console.warn('[GITHUB] 409 Conflict detected. Fetching latest Jenkinsfile SHA and retrying once.', {
      repository,
      branch: resolvedBranch,
      previousShaUsed: current?.sha || null,
      retryAttempt: 1,
      githubErrorResponseBody: error.response?.data,
    });

    const latest = await fetchLatestJenkinsfile(2, 'retry after 409 conflict');

    if (latest?.content === jenkinsfile) {
      console.log('[GITHUB] Jenkinsfile became identical after conflict. Skipping retry commit and continuing workflow successfully.', {
        repository,
        branch: resolvedBranch,
        currentGitHubSha: latest.sha,
        shaBeingUsedForUpdate: null,
        retryAttempts: 1,
        skipped: true,
      });

      return {
        sha: latest.sha,
        commitUrl: null,
        skipped: true,
        branch: resolvedBranch,
        retried: true,
        message: 'Jenkinsfile already up to date after conflict retry',
      };
    }

    try {
      const retryResponse = await putJenkinsfile(latest, 2);
      console.log('[GITHUB] Jenkinsfile commit successful after 409 retry:', {
        repository,
        branch: resolvedBranch,
        status: retryResponse.status,
        currentGitHubSha: latest?.sha || null,
        shaBeingUsedForUpdate: latest?.sha || null,
        newContentSha: retryResponse.data?.content?.sha,
        commitSha: retryResponse.data?.commit?.sha,
        commitUrl: retryResponse.data?.commit?.html_url,
        retryAttempts: 1,
      });

      return {
        sha: retryResponse.data?.content?.sha,
        commitUrl: retryResponse.data?.commit?.html_url,
        skipped: false,
        branch: resolvedBranch,
        retried: true,
      };
    } catch (retryError) {
      console.error('[GITHUB] Jenkinsfile retry commit failed:', {
        repository,
        branch: resolvedBranch,
        status: retryError.response?.status,
        statusText: retryError.response?.statusText,
        currentGitHubSha: latest?.sha || null,
        shaBeingUsedForUpdate: latest?.sha || null,
        retryAttempts: 1,
        message: retryError.message,
        githubErrorResponseBody: retryError.response?.data,
      });
      throw retryError;
    }
  }
}

export async function generateJenkinsPipeline(userId, {
  owner,
  repo,
  branch = "main",
  jenkinsfile: editedJenkinsfile,
  dockerHubCredentialsId,
  ec2SshCredentialsId,
  repositoryUrl, // Added to derive owner/repo if missing
}) {
  console.log('\n========================================');
  console.log('=== GENERATE JENKINS PIPELINE START ===');
  console.log('========================================\n');
  
  console.log('[GENERATE_PIPELINE] Input parameters received:', {
    userId,
    owner: owner || 'MISSING',
    repo: repo || 'MISSING',
    branch: branch || 'MISSING',
    repositoryUrl: repositoryUrl || 'MISSING',
    hasJenkinsfile: !!editedJenkinsfile,
  });

  // Validate and auto-derive owner/repo from URL if missing
  let resolvedOwner = owner ? String(owner).trim() : "";
  let resolvedRepo = repo ? String(repo).trim() : "";

  if (!resolvedOwner || !resolvedRepo) {
    console.log('[GENERATE_PIPELINE] Owner or repo missing, attempting to derive from URL');
    if (repositoryUrl) {
      const parsed = parseGitHubURL(repositoryUrl);
      if (parsed.owner && parsed.repo) {
        resolvedOwner = parsed.owner;
        resolvedRepo = parsed.repo;
        console.log('[GENERATE_PIPELINE] ✅ Derived from URL:', { resolvedOwner, resolvedRepo });
      }
    }
  }

  // Validate required parameters
  if (!resolvedOwner) {
    const error = `[GITHUB] Repository owner is required. Provided owner: ${owner}, repositoryUrl: ${repositoryUrl}`;
    console.error(error);
    throw new Error(error);
  }
  if (!resolvedRepo) {
    const error = `[GITHUB] Repository name is required. Provided repo: ${repo}, repositoryUrl: ${repositoryUrl}`;
    console.error(error);
    throw new Error(error);
  }

  // Print final validated values before proceeding
  console.log('================================');
  console.log('FINAL VALUES BEFORE COMMIT');
  console.log('OWNER:', resolvedOwner);
  console.log('REPO:', resolvedRepo);
  console.log('BRANCH:', branch);
  console.log('================================');

  console.log('[GENERATE_PIPELINE] Validated parameters:', {
    owner: resolvedOwner,
    repo: resolvedRepo,
    branch,
  });
  
  console.log('\n--- Generating preview ---');
  const preview = await previewJenkinsPipeline(userId, {
    owner: resolvedOwner,
    repo: resolvedRepo,
    branch,
    dockerHubCredentialsId,
    ec2SshCredentialsId,
  });
  
  console.log('[GENERATE_PIPELINE] Preview generated:', {
    projectType: preview.projectType,
    branch: preview.branch,
    owner: preview.owner,
    repo: preview.repo,
  });
  
  const jenkinsfile = editedJenkinsfile || preview.jenkinsfile;
  
  console.log('\n--- Committing Jenkinsfile to GitHub ---');
  console.log('[GENERATE_PIPELINE] Exact values being passed to commitJenkinsfile:', {
    owner: resolvedOwner,
    repo: resolvedRepo,
    branch,
    jenkinsfileLength: jenkinsfile.length,
  });
  
  // Validation before commitJenkinsfile()
  if (!resolvedOwner || !resolvedRepo) {
    throw new Error(
      `Invalid repository values. owner=${resolvedOwner}, repo=${resolvedRepo}`
    );
  }
  
  try {
    const commit = await commitJenkinsfile({ 
      owner: resolvedOwner, 
      repo: resolvedRepo, 
      branch, 
      jenkinsfile 
    });

    console.log('[GENERATE_PIPELINE] Commit complete:', { 
      sha: commit.sha ? commit.sha.substring(0, 7) + '...' : 'unknown',
      commitUrl: commit.commitUrl,
      skipped: !!commit.skipped,
      branch: commit.branch || branch,
      retried: !!commit.retried,
    });

    const committedBranch = commit.branch || branch;
    const pipelineStageLog = commit.skipped
      ? `${JENKINSFILE_PATH} already up to date; skipped GitHub commit`
      : `Generated ${JENKINSFILE_PATH}`;

    const pipelineData = {
      userId,
      name: "Jenkins Deploy",
      status: "pending",
      deploymentStatus: "healthy",
      provider: "jenkins",
      repository: {
        owner: resolvedOwner,
        name: resolvedRepo,
        branch: committedBranch,
        workflowPath: JENKINSFILE_PATH,
        htmlUrl: `https://github.com/${resolvedOwner}/${resolvedRepo}`,
      },
      projectType: preview.projectType,
      generatedWorkflow: {
        path: JENKINSFILE_PATH,
        content: jenkinsfile,
        sha: commit.sha,
        commitUrl: commit.commitUrl,
        skipped: !!commit.skipped,
        retried: !!commit.retried,
        generatedAt: new Date(),
      },
      runtime: {
        setupAction: "jenkins-declarative-pipeline",
        version: "declarative",
        installCommand: preview.runtime.installCommand,
        testCommand: preview.runtime.testCommand,
        buildCommand: "docker compose build",
        dockerImage: `${preview.configuration.dockerHub.username}/${sanitizeImagePart(resolvedRepo)}`,
        appPort: preview.configuration.ec2.port,
      },
      deploymentConfig: preview.configuration,
      statusTracking: {
        workflowStatus: "committed",
        healthCheckStatus: "pending",
      },
      stages: [
        { name: "Generate Jenkins Pipeline", status: "success", logs: [pipelineStageLog] },
        { name: "Create Jenkins Job", status: "pending", logs: [] },
        { name: "Configure GitHub Webhook", status: "pending", logs: [] },
        { name: "Checkout", status: "pending", logs: [] },
        { name: "Install Dependencies", status: "pending", logs: [] },
        { name: "Run Tests", status: "pending", logs: [] },
        { name: "Build Docker Image", status: "pending", logs: [] },
        { name: "Push Docker Image", status: "pending", logs: [] },
        { name: "Deploy to EC2", status: "pending", logs: [] },
        { name: "Health Check", status: "pending", logs: [] },
      ],
    };

    const pipeline = isDbConnected()
      ? await Pipeline.create(pipelineData)
      : localDB.createCicdPipeline(pipelineData);

    console.log('[GENERATE_PIPELINE_COMPLETE] Pipeline successfully created');

    return {
      success: true,
      message: "Jenkins Pipeline Generated",
      pipeline,
      path: JENKINSFILE_PATH,
      commit,
      jenkinsfile,
      configuration: preview.configuration,
    };
  } catch (error) {
    console.error('\n=== GENERATE PIPELINE ERROR ===');
    const errorDetails = {
      owner: resolvedOwner,
      repo: resolvedRepo,
      branch,
      message: error.message,
      statusCode: error.response?.status,
      responseBody: error.response?.data,
    };
    console.error(errorDetails);
    
    // Return detailed error to frontend
    throw Object.assign(error, {
      details: errorDetails,
    });
  }
}

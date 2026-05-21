import fs from "fs/promises";
import path from "path";
import { TECH_STACKS } from "./techStackDetectorService.js";

/**
 * Jenkinsfile Generator Service
 * Generates dynamic Jenkins CI/CD pipelines based on tech stack
 */

function generateNodeJenkinsfile(detection, containerName, containerPort, repoName) {
  return `pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    environment {
        NODE_ENV = 'production'
        DOCKER_IMAGE = '${containerName}:${BUILD_NUMBER}'
        PORT = '${containerPort}'
        REGISTRY = credentials('docker-registry')
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo '✅ Checking out source code...'
                    checkout scm
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                script {
                    echo '📦 Installing dependencies...'
                    sh 'npm install --legacy-peer-deps'
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    echo '🔍 Linting code...'
                    sh 'npm run lint || true'
                }
            }
        }

        stage('Build') {
            steps {
                script {
                    echo '🔨 Building application...'
                    sh 'npm run build || npm run dev || echo "No build script"'
                }
            }
        }

        stage('Test') {
            steps {
                script {
                    echo '🧪 Running tests...'
                    sh 'npm test || npm run test || echo "No test script"'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo '🐳 Building Docker image...'
                    sh 'docker build -t \${DOCKER_IMAGE} .'
                }
            }
        }

        stage('Push Docker Image') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '📤 Pushing Docker image...'
                    sh '''
                        docker tag \${DOCKER_IMAGE} ${containerName}:latest
                        docker push \${DOCKER_IMAGE} || echo "Push skipped"
                        docker push ${containerName}:latest || echo "Push skipped"
                    '''
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '🚀 Deploying application...'
                    sh '''
                        docker compose pull || true
                        docker compose down || true
                        docker compose up -d
                        sleep 10
                    '''
                }
            }
        }

        stage('Health Check') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '❤️ Performing health checks...'
                    sh '''
                        for i in {1..30}; do
                            if curl -f http://localhost:${PORT} > /dev/null 2>&1; then
                                echo "✅ Application is healthy"
                                exit 0
                            fi
                            echo "Waiting for application to be ready... (\$i/30)"
                            sleep 2
                        done
                        echo "❌ Health check failed"
                        exit 1
                    '''
                }
            }
        }
    }

    post {
        always {
            script {
                echo '📝 Cleaning up...'
                cleanWs()
            }
        }
        success {
            script {
                echo '✅ Build successful!'
            }
        }
        failure {
            script {
                echo '❌ Build failed!'
            }
        }
    }
}
`;
}

function generatePythonJenkinsfile(detection, containerName, containerPort, repoName) {
  return `pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    environment {
        PYTHONUNBUFFERED = '1'
        DOCKER_IMAGE = '${containerName}:${BUILD_NUMBER}'
        PORT = '${containerPort}'
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo '✅ Checking out source code...'
                    checkout scm
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                script {
                    echo '📦 Installing dependencies...'
                    sh '''
                        python3 -m venv venv || true
                        . venv/bin/activate || source venv/Scripts/activate || true
                        pip install --upgrade pip
                        pip install -r requirements.txt || true
                    '''
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    echo '🔍 Linting code...'
                    sh '''
                        . venv/bin/activate || source venv/Scripts/activate || true
                        flake8 . || pylint . || true
                    '''
                }
            }
        }

        stage('Test') {
            steps {
                script {
                    echo '🧪 Running tests...'
                    sh '''
                        . venv/bin/activate || source venv/Scripts/activate || true
                        pytest . || python -m pytest || true
                    '''
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo '🐳 Building Docker image...'
                    sh 'docker build -t \${DOCKER_IMAGE} .'
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '🚀 Deploying application...'
                    sh '''
                        docker compose pull || true
                        docker compose down || true
                        docker compose up -d
                        sleep 10
                    '''
                }
            }
        }

        stage('Health Check') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '❤️ Performing health checks...'
                    sh '''
                        for i in {1..30}; do
                            if curl -f http://localhost:${PORT}/health > /dev/null 2>&1; then
                                echo "✅ Application is healthy"
                                exit 0
                            fi
                            echo "Waiting for application to be ready... (\$i/30)"
                            sleep 2
                        done
                        echo "❌ Health check failed"
                        exit 1
                    '''
                }
            }
        }
    }

    post {
        always {
            script {
                echo '📝 Cleaning up...'
                cleanWs()
            }
        }
        success {
            script {
                echo '✅ Build successful!'
            }
        }
        failure {
            script {
                echo '❌ Build failed!'
            }
        }
    }
}
`;
}

function generateStaticJenkinsfile(detection, containerName, containerPort, repoName) {
  return `pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    environment {
        DOCKER_IMAGE = '${containerName}:${BUILD_NUMBER}'
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo '✅ Checking out source code...'
                    checkout scm
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo '🐳 Building Docker image...'
                    sh 'docker build -t \${DOCKER_IMAGE} .'
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '🚀 Deploying application...'
                    sh '''
                        docker compose pull || true
                        docker compose down || true
                        docker compose up -d
                        sleep 5
                    '''
                }
            }
        }

        stage('Health Check') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '❤️ Performing health checks...'
                    sh '''
                        for i in {1..30}; do
                            if curl -f http://localhost/ > /dev/null 2>&1; then
                                echo "✅ Static site is accessible"
                                exit 0
                            fi
                            echo "Waiting for site to be ready... (\$i/30)"
                            sleep 2
                        done
                        echo "❌ Health check failed"
                        exit 1
                    '''
                }
            }
        }
    }

    post {
        always {
            script {
                echo '📝 Cleaning up...'
                cleanWs()
            }
        }
        success {
            script {
                echo '✅ Build successful!'
            }
        }
        failure {
            script {
                echo '❌ Build failed!'
            }
        }
    }
}
`;
}

/**
 * Generate Jenkinsfile based on tech stack
 */
export async function generateJenkinsfile(detection, containerName, containerPort = 3000, repoName = "app") {
  try {
    let jenkinsfile;

    switch (detection.primaryStack) {
      case TECH_STACKS.NODE_JS:
      case TECH_STACKS.NEXTJS:
      case TECH_STACKS.REACT:
      case TECH_STACKS.MERN:
        jenkinsfile = generateNodeJenkinsfile(detection, containerName, containerPort, repoName);
        break;
      case TECH_STACKS.PYTHON:
      case TECH_STACKS.DJANGO:
      case TECH_STACKS.FASTAPI:
      case TECH_STACKS.FLASK:
        jenkinsfile = generatePythonJenkinsfile(detection, containerName, containerPort, repoName);
        break;
      case TECH_STACKS.STATIC:
        jenkinsfile = generateStaticJenkinsfile(detection, containerName, containerPort, repoName);
        break;
      default:
        jenkinsfile = generateNodeJenkinsfile(detection, containerName, containerPort, repoName);
    }

    return {
      success: true,
      jenkinsfile,
    };
  } catch (error) {
    console.error("Error generating Jenkinsfile:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Write Jenkinsfile to repository
 */
export async function writeJenkinsfile(repoPath, jenkinsfile) {
  try {
    const jenkinsfilePath = path.join(repoPath, "Jenkinsfile");
    await fs.writeFile(jenkinsfilePath, jenkinsfile, "utf-8");

    return {
      success: true,
      path: jenkinsfilePath,
    };
  } catch (error) {
    console.error("Error writing Jenkinsfile:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    string(name: 'REPO_URL', defaultValue: '', description: 'Git repository URL. Leave empty to use Jenkins SCM checkout.')
    string(name: 'BRANCH', defaultValue: 'main', description: 'Git branch to deploy.')
    string(name: 'COMMIT_SHA', defaultValue: '', description: 'Commit SHA from webhook.')
    string(name: 'PROJECT_NAME', defaultValue: 'devops-hub', description: 'Docker image/container name.')
    string(name: 'BUILD_FILE_PATH', defaultValue: 'auto', description: 'auto, Dockerfile, or docker-compose.yml.')
    string(name: 'PORTS', defaultValue: '5000:5000', description: 'Comma-separated Docker port mappings.')
    string(name: 'ENVIRONMENT', defaultValue: 'production', description: 'Deployment environment.')
  }

  environment {
    APP_NAME = "${params.PROJECT_NAME}"
    IMAGE_TAG = "${params.PROJECT_NAME}:${env.BUILD_NUMBER}"
    CONTAINER_NAME = "${params.PROJECT_NAME}"
    NODE_ENV = "production"
  }

  stages {
    stage('Checkout') {
      steps {
        script {
          deleteDir()
          if (params.REPO_URL?.trim()) {
            checkout([
              $class: 'GitSCM',
              branches: [[name: "*/${params.BRANCH}"]],
              userRemoteConfigs: [[url: params.REPO_URL]]
            ])
          } else {
            checkout scm
          }
        }
      }
    }

    stage('Install Dependencies') {
      steps {
        script {
          if (isUnix()) {
            sh '''
              set -e
              if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; fi
              if [ -f backend/package-lock.json ]; then (cd backend && npm ci); elif [ -f backend/package.json ]; then (cd backend && npm install); fi
              if [ -f frontend/package-lock.json ]; then (cd frontend && npm ci); elif [ -f frontend/package.json ]; then (cd frontend && npm install); fi
            '''
          } else {
            bat '''
              if exist package-lock.json (npm ci) else if exist package.json (npm install)
              if exist backend\\package-lock.json (cd backend && npm ci)
              if exist frontend\\package-lock.json (cd frontend && npm ci)
            '''
          }
        }
      }
    }

    stage('Build Application') {
      steps {
        script {
          if (isUnix()) {
            sh '''
              set -e
              if [ -f frontend/package.json ]; then (cd frontend && npm run build); fi
              if [ -f package.json ]; then npm run build --if-present; fi
              if [ -f backend/package.json ]; then (cd backend && npm run build --if-present); fi
            '''
          } else {
            bat '''
              if exist frontend\\package.json (cd frontend && npm run build)
              if exist package.json (npm run build --if-present)
              if exist backend\\package.json (cd backend && npm run build --if-present)
            '''
          }
        }
      }
    }

    stage('Detect Docker Build File') {
      steps {
        script {
          def requested = params.BUILD_FILE_PATH?.trim()
          if (requested && requested != 'auto') {
            env.BUILD_FILE = requested
          } else if (fileExists('docker-compose.yml')) {
            env.BUILD_FILE = 'docker-compose.yml'
          } else if (fileExists('docker-compose.yaml')) {
            env.BUILD_FILE = 'docker-compose.yaml'
          } else if (fileExists('compose.yml')) {
            env.BUILD_FILE = 'compose.yml'
          } else if (fileExists('compose.yaml')) {
            env.BUILD_FILE = 'compose.yaml'
          } else if (fileExists('Dockerfile')) {
            env.BUILD_FILE = 'Dockerfile'
          } else {
            error('No Dockerfile or Docker Compose file found in repository root.')
          }
          echo "Using Docker build file: ${env.BUILD_FILE}"
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          def compose = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].contains(env.BUILD_FILE)
          if (compose) {
            if (isUnix()) {
              sh "docker compose -f '${env.BUILD_FILE}' -p '${env.CONTAINER_NAME}' build"
            } else {
              bat "docker compose -f %BUILD_FILE% -p %CONTAINER_NAME% build"
            }
          } else {
            if (isUnix()) {
              sh "docker build -f '${env.BUILD_FILE}' -t '${env.IMAGE_TAG}' ."
            } else {
              bat "docker build -f %BUILD_FILE% -t %IMAGE_TAG% ."
            }
          }
        }
      }
    }

    stage('Deploy Docker Container') {
      steps {
        script {
          def compose = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'].contains(env.BUILD_FILE)
          if (compose) {
            if (isUnix()) {
              sh '''
                set -e
                docker compose -f "$BUILD_FILE" -p "$CONTAINER_NAME" down --remove-orphans || true
                docker compose -f "$BUILD_FILE" -p "$CONTAINER_NAME" up -d --remove-orphans
                docker image prune -f || true
              '''
            } else {
              bat '''
                docker compose -f %BUILD_FILE% -p %CONTAINER_NAME% down --remove-orphans
                docker compose -f %BUILD_FILE% -p %CONTAINER_NAME% up -d --remove-orphans
                docker image prune -f
              '''
            }
          } else {
            if (isUnix()) {
              sh '''
                set -e
                docker stop "$CONTAINER_NAME" || true
                docker rm "$CONTAINER_NAME" || true
                PORT_FLAGS=""
                IFS=',' read -ra PORT_LIST <<< "$PORTS"
                for port in "${PORT_LIST[@]}"; do PORT_FLAGS="$PORT_FLAGS -p $port"; done
                docker run -d --restart unless-stopped --name "$CONTAINER_NAME" $PORT_FLAGS -e NODE_ENV=production "$IMAGE_TAG"
                docker image prune -f || true
              '''
            } else {
              bat '''
                docker stop %CONTAINER_NAME%
                docker rm %CONTAINER_NAME%
                docker run -d --restart unless-stopped --name %CONTAINER_NAME% -p %PORTS% -e NODE_ENV=production %IMAGE_TAG%
                docker image prune -f
              '''
            }
          }
        }
      }
    }
  }

  post {
    success {
      echo "Deployment succeeded: ${env.IMAGE_TAG}"
    }
    failure {
      echo "Deployment failed. Check Jenkins console logs and DevOps Hub alerts."
    }
    always {
      archiveArtifacts artifacts: '**/dist/**', allowEmptyArchive: true
    }
  }
}

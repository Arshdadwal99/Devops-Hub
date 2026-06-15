function runtimeSetupBlock(detection) {
  if (detection.runtime === "python") {
    return `      - name: Setup Python
        uses: ${detection.setupAction}
        with:
          python-version: "${detection.version}"`;
  }

  if (detection.runtime === "java") {
    return `      - name: Setup Java
        uses: ${detection.setupAction}
        with:
          distribution: temurin
          java-version: "${detection.version}"`;
  }

  return `      - name: Setup Node.js
        uses: ${detection.setupAction}
        with:
          node-version: "${detection.version}"
          cache: npm`;
}

function indentCommand(command, spaces = 10) {
  const indent = " ".repeat(spaces);
  return String(command)
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

export function buildGitHubActionsWorkflow({ repo, branch = "main", detection }) {
  const imageName = `${"${{ secrets.DOCKERHUB_USERNAME }}"}/${repo}`;
  const containerName = `${repo}-app`;

  return `name: Deploy

on:
  push:
    branches:
      - ${branch}
  workflow_dispatch:

env:
  IMAGE_NAME: ${imageName}
  CONTAINER_NAME: ${containerName}
  APP_PORT: "${detection.appPort}"
  PUBLIC_PORT: 80

jobs:
  deploy:
    name: Build, Push, and Deploy
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

${runtimeSetupBlock(detection)}

      - name: Install dependencies
        run: |
${indentCommand(detection.installCommand)}

      - name: Run tests
        run: |
${indentCommand(detection.testCommand)}

      - name: Build application
        run: |
${indentCommand(detection.buildCommand)}

      - name: Build Docker image
        run: |
          docker build -t "$IMAGE_NAME:${"${{ github.sha }}"}" -t "$IMAGE_NAME:latest" .

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${"${{ secrets.DOCKERHUB_USERNAME }}"}
          password: ${"${{ secrets.DOCKERHUB_TOKEN }}"}

      - name: Push image to Docker Hub
        run: |
          docker push "$IMAGE_NAME:${"${{ github.sha }}"}"
          docker push "$IMAGE_NAME:latest"

      - name: SSH into EC2 and deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${"${{ secrets.EC2_HOST }}"}
          username: ${"${{ secrets.EC2_USER }}"}
          key: ${"${{ secrets.EC2_SSH_KEY }}"}
          port: ${"${{ secrets.EC2_PORT || 22 }}"}
          script: |
            set -e
            IMAGE_NAME="${"${{ secrets.DOCKERHUB_USERNAME }}"}"/${repo}
            CONTAINER_NAME="${containerName}"
            APP_PORT="${detection.appPort}"
            PUBLIC_PORT=80

            echo "[Deploy] Starting deployment..."
            echo "[Deploy] Image: $IMAGE_NAME:latest"
            echo "[Deploy] Container: $CONTAINER_NAME"
            echo "[Deploy] Ports: $PUBLIC_PORT:$APP_PORT"

            # ========================================================================
            # PHASE 0: LOG EXISTING CONTAINERS AND CLEANUP
            # ========================================================================
            echo "[Cleanup] Listing existing containers BEFORE cleanup"
            echo "[Existing Containers] Running containers:"
            docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" || true
            echo "[Existing Containers] All containers (including stopped):"
            docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" || true

            echo "[Port Check] Checking port $PUBLIC_PORT BEFORE cleanup"
            if netstat -tuln 2>/dev/null | grep -q ":$PUBLIC_PORT"; then
              echo "[Port Check] Port $PUBLIC_PORT is currently IN USE"
              netstat -tuln 2>/dev/null | grep ":$PUBLIC_PORT" || true
            else
              echo "[Port Check] Port $PUBLIC_PORT is currently FREE"
            fi

            # Stop old container gracefully if it exists
            if docker ps -a --format '{{.Names}}' | grep -q "^$CONTAINER_NAME\$"; then
              echo "[Container Stop] Found existing container: $CONTAINER_NAME"
              
              if docker ps --format '{{.Names}}' | grep -q "^$CONTAINER_NAME\$"; then
                echo "[Container Stop] Container is running, stopping gracefully with 30s timeout"
                docker stop "$CONTAINER_NAME" --time 30 || true
                sleep 2
                echo "[Container Stop] Container stopped successfully"
              else
                echo "[Container Stop] Container is already stopped"
              fi
              
              echo "[Container Remove] Removing container: $CONTAINER_NAME"
              docker rm -f "$CONTAINER_NAME" || true
              sleep 1
              echo "[Container Remove] Container removed successfully"
            else
              echo "[Container Stop] No existing container found with name: $CONTAINER_NAME"
            fi

            # Force remove any containers still bound to port $PUBLIC_PORT
            echo "[Port Force Clean] Forcefully cleaning up containers on port $PUBLIC_PORT"
            STUCK_CONTAINERS=\$(docker ps -a --filter "expose=$PUBLIC_PORT" --format "{{.ID}} {{.Names}}" 2>/dev/null || echo "")
            if [ -n "\$STUCK_CONTAINERS" ]; then
              while IFS= read -r CONTAINER_ID CONTAINER_NAME_VAR; do
                if [ -n "\$CONTAINER_ID" ]; then
                  echo "[Port Force Clean] Force removing stuck container: \$CONTAINER_NAME_VAR (ID: \$CONTAINER_ID)"
                  docker rm -f "\$CONTAINER_ID" 2>/dev/null || true
                fi
              done <<< "\$STUCK_CONTAINERS"
              sleep 1
            else
              echo "[Port Force Clean] No containers found on port $PUBLIC_PORT"
            fi

            # Verify port is now free
            echo "[Port Verify] Verifying port $PUBLIC_PORT is now free"
            MAX_WAIT=30
            ELAPSED=0
            while [ \$ELAPSED -lt \$MAX_WAIT ]; do
              if ! netstat -tuln 2>/dev/null | grep -q ":$PUBLIC_PORT"; then
                echo "[Port Verify] Port $PUBLIC_PORT is now FREE - cleanup successful"
                break
              else
                echo "[Port Verify] Port still in use, waiting... (\$ELAPSED/$MAX_WAIT seconds)"
                sleep 1
                ELAPSED=\$((ELAPSED + 1))
              fi
            done

            if [ \$ELAPSED -ge \$MAX_WAIT ]; then
              echo "[Port Verify] WARNING: Port $PUBLIC_PORT still appears to be in use after 30 seconds"
              lsof -i :$PUBLIC_PORT 2>/dev/null || netstat -tuln 2>/dev/null | grep ":$PUBLIC_PORT" || true
            fi

            echo "[Cleanup] Complete - Old containers removed and port verified free"

            # ========================================================================
            # PHASE 1: DOCKER PULL
            # ========================================================================
            echo "[Docker Pull] Starting..."
            docker pull "$IMAGE_NAME:latest"
            echo "[Docker Pull] Success"

            # ========================================================================
            # PHASE 2: DOCKER RUN
            # ========================================================================
            echo "[Docker Run] Starting container..."
            CONTAINER_ID=\$(docker run -d --restart unless-stopped --name "$CONTAINER_NAME" -p "$PUBLIC_PORT:$APP_PORT" "$IMAGE_NAME:latest")
            echo "[Docker Run] Success - Container ID: \$CONTAINER_ID"

            # ========================================================================
            # PHASE 3: VERIFY CONTAINER IS RUNNING
            # ========================================================================
            echo "[Container Verify] Verifying container is running..."
            for attempt in {1..30}; do
              if docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q "true"; then
                echo "[Container Verify] Container is running:"
                docker ps --filter name="$CONTAINER_NAME" --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'
                echo "[Port Status] Port $PUBLIC_PORT is now bound:"
                netstat -tuln 2>/dev/null | grep ":$PUBLIC_PORT" || echo "[Port Status] Port check complete"
                echo "[Deployment] SUCCESS - Application deployed and running"
                exit 0
              fi
              echo "[Container Verify] Attempt $attempt/30 - Container not ready, waiting..."
              sleep 2
            done

            echo "[Deployment] FAILED - Container did not start"
            docker ps -a --filter name="$CONTAINER_NAME"
            docker logs --tail 100 "$CONTAINER_NAME" || true
            exit 1

      - name: Run health check
        run: |
          HEALTH_URL="${"${{ secrets.HEALTH_CHECK_URL }}"}"
          if [ -z "$HEALTH_URL" ]; then
            HEALTH_URL="http://${"${{ secrets.EC2_HOST }}"}:$APP_PORT/health"
          fi
          for attempt in {1..12}; do
            if curl --fail --silent --show-error "$HEALTH_URL"; then
              echo "Health check passed"
              exit 0
            fi
            echo "Waiting for service health... attempt $attempt"
            sleep 10
          done
          echo "Health check failed"
          exit 1
`;
}

export const reusableWorkflowTemplates = {
  githubActionsDeploy: buildGitHubActionsWorkflow,
};

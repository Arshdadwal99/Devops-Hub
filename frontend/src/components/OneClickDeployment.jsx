import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { startOneClickDeploy } from '../lib/api';
import '../styles/OneClickDeployment.css';

/**
 * One-Click CI/CD Deployment Component
 * 
 * Provides a simple one-click deployment experience similar to Vercel/Railway/Render
 * After connecting GitHub, Jenkins, Docker Hub, and AWS, users can deploy with one click
 */
export function OneClickDeployment() {
  const { socket } = useSocket();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentId, setDeploymentId] = useState(null);
  const [deploymentStatus, setDeploymentStatus] = useState(null);
  const [error, setError] = useState(null);
  const [progressLog, setProgressLog] = useState([]);

  useEffect(() => {
    if (!socket) return;

    // Listen for deployment progress updates
    socket.on('oneclick:progress', (data) => {
      setProgressLog((prev) => [...prev, data]);

      if (data.status === 'success') {
        setDeploymentStatus({ ...data, completed: true });
      } else if (data.status === 'failed') {
        setDeploymentStatus({ ...data, failed: true });
        setError(data.message);
      }
    });

    return () => {
      socket.off('oneclick:progress');
    };
  }, [socket]);

  const handleDeploy = async () => {
    if (!owner || !repo) {
      setError('Please enter repository owner and name');
      return;
    }

    setError(null);
    setIsDeploying(true);
    setProgressLog([]);

    try {
      const data = await startOneClickDeploy({
        owner: owner.trim(),
        repo: repo.trim(),
        repositoryUrl: `https://github.com/${owner.trim()}/${repo.trim()}`,
        repositoryName: repo.trim(),
        branch: branch || 'main',
      });

      if (!data.success) {
        throw new Error(data.error || data.failedStep || 'Deployment request failed without a detailed API error');
      }

      setDeploymentId(data.deploymentId);

      // Add initial progress log entry
      setProgressLog([
        {
          step: 'INIT',
          displayName: '🚀 Starting One-Click Deployment',
          status: 'success',
          progress: 0,
        },
      ]);
    } catch (err) {
      setError(err.message);
      setIsDeploying(false);
    }
  };

  const getStepIcon = (step) => {
    const icons = {
      VERIFY_CONNECTIONS: '🔗',
      ANALYZE_REPOSITORY: '🔍',
      GENERATE_DEPLOYMENT_FILES: '📄',
      PROVISION_INFRASTRUCTURE: '☁️',
      CREATE_JENKINS_JOB: '🔧',
      CONFIGURE_JENKINS_CREDENTIALS: '🔐',
      CONFIGURE_GITHUB_WEBHOOK: '🪝',
      BUILD_DOCKER_IMAGE: '🐳',
      PUSH_DOCKER_IMAGE: '📤',
      DEPLOY_TO_EC2: '🚀',
      RUN_HEALTH_CHECKS: '❤️',
      ENABLE_AUTO_DEPLOY: '⚡',
      COMPLETE: '✅',
    };
    return icons[step] || '•';
  };

  return (
    <div className="oneclick-deployment">
      <div className="deployment-header">
        <h1>One-Click CI/CD Deployment</h1>
        <p>Deploy your application with a single click</p>
      </div>

      {!isDeploying && !deploymentId && (
        <div className="deployment-form">
          <div className="form-group">
            <label>Repository Owner</label>
            <input
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="e.g., my-username"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Repository Name</label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="e.g., my-app"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="form-input"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            onClick={handleDeploy}
            className="deploy-button"
            disabled={!owner || !repo}
          >
            [ Deploy with CI/CD ]
          </button>

          <div className="deployment-info">
            <h3>What will happen:</h3>
            <ul>
              <li>✓ Repository will be analyzed automatically</li>
              <li>✓ Deployment files will be generated</li>
              <li>✓ EC2 infrastructure will be provisioned</li>
              <li>✓ Jenkins job will be created</li>
              <li>✓ GitHub webhook will be configured</li>
              <li>✓ Docker image will be built and pushed</li>
              <li>✓ Application will be deployed to EC2</li>
              <li>✓ Health checks will run</li>
              <li>✓ Auto-deploy will be enabled for future pushes</li>
            </ul>
          </div>
        </div>
      )}

      {(isDeploying || deploymentId) && (
        <div className="deployment-progress">
          <div className="progress-header">
            <h2>{deploymentStatus?.failed ? '❌ Deployment Failed' : deploymentStatus?.completed ? '✅ Deployment Complete' : '⏳ Deploying...'}</h2>
            <p>Deployment ID: {deploymentId}</p>
          </div>

          {deploymentStatus && !deploymentStatus.failed && !deploymentStatus.completed && (
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${deploymentStatus.progress || 0}%` }}
              />
              <span className="progress-text">{deploymentStatus.progress || 0}%</span>
            </div>
          )}

          <div className="progress-log">
            {progressLog.map((entry, idx) => (
              <div key={idx} className={`log-entry ${entry.status}`}>
                <span className="log-icon">{getStepIcon(entry.step)}</span>
                <div className="log-content">
                  <div className="log-name">
                    {entry.displayName || entry.step}
                  </div>
                  {entry.message && <div className="log-message">{entry.message}</div>}
                  {entry.data && Object.keys(entry.data).length > 0 && (
                    <div className="log-data">
                      {Object.entries(entry.data).map(([key, value]) => (
                        <div key={key} className="data-item">
                          <strong>{key}:</strong> {String(value)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`log-status ${entry.status}`}>
                  {entry.status === 'in-progress' && '⏳'}
                  {entry.status === 'success' && '✅'}
                  {entry.status === 'failed' && '❌'}
                </span>
              </div>
            ))}
          </div>

          {deploymentStatus?.completed && (
            <div className="deployment-summary">
              <h3>Deployment Summary</h3>
              <div className="summary-section">
                <h4>Infrastructure</h4>
                {deploymentStatus.data?.infrastructure && (
                  <div className="summary-item">
                    <strong>Instance ID:</strong> {deploymentStatus.data.infrastructure.instanceId}
                  </div>
                )}
              </div>

              <div className="summary-section">
                <h4>Quick Links</h4>
                {deploymentStatus.data?.infrastructure?.publicIp && (
                  <a
                    href={`http://${deploymentStatus.data.infrastructure.publicIp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="summary-link"
                  >
                    → View Application
                  </a>
                )}
              </div>

              <button
                onClick={() => {
                  setDeploymentId(null);
                  setProgressLog([]);
                  setDeploymentStatus(null);
                }}
                className="deploy-button"
              >
                Deploy Another Application
              </button>
            </div>
          )}

          {deploymentStatus?.failed && (
            <div className="deployment-error">
              <h3>Deployment Failed</h3>
              <p>{error || deploymentStatus.message}</p>
              <button
                onClick={() => {
                  setDeploymentId(null);
                  setProgressLog([]);
                  setDeploymentStatus(null);
                  setError(null);
                  setIsDeploying(false);
                }}
                className="deploy-button"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OneClickDeployment;

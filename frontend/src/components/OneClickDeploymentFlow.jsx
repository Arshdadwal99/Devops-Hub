import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import DeploymentProgress from "./DeploymentProgress";
import SetupWizard from "./SetupWizard";
import {
  getDeploymentProgress,
  startOneClickDeploy,
  validateOneClickDeploy,
} from "../lib/api";

function getVisibleErrorMessage(error, fallback = "An unknown deployment error occurred") {
  if (!error) return fallback;
  return error.data?.error
    || error.data?.message
    || error.response?.data?.error
    || error.response?.data?.message
    || error.message
    || fallback;
}

export default function OneClickDeploymentFlow({
  isOpen,
  repository,
  onClose,
  onDeploymentStart,
  onDeploymentComplete,
}) {
  const navigate = useNavigate();
  const [deploymentId, setDeploymentId] = useState(null);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [phaseProgress, setPhaseProgress] = useState({});
  const [overallProgress, setOverallProgress] = useState(0);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState("");
  const [failedStep, setFailedStep] = useState("");
  const [stackTrace, setStackTrace] = useState("");
  const [jenkinsDetails, setJenkinsDetails] = useState(null);
  const [deploymentOutput, setDeploymentOutput] = useState(null);
  const [deploymentLogs, setDeploymentLogs] = useState([]);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [missingIntegrations, setMissingIntegrations] = useState([]);
  const [status, setStatus] = useState("idle"); // idle, setup-required, validating, deploying, complete, failed
  const pollIntervalRef = useRef(null);

  // Start the one-click deployment
  const startDeployment = async () => {
    if (!repository) return;

    try {
      setStatus("validating");
      setError(null);
      setCurrentPhase(1);
      setCurrentStep("Validation");
      setFailedStep("");
      setStackTrace("");
      setJenkinsDetails(null);
      setDeploymentLogs([]);
      setPhaseProgress({});
      setOverallProgress(0);

      // First, validate integrations
      const deploymentPayload = {
        repositoryUrl: repository.htmlUrl,
        repositoryName: repository.name,
        owner: repository.owner?.login || repository.htmlUrl.split("/")[3],
        repo: repository.name,
        branch: repository.defaultBranch || "main",
      };

      const validationResult = await validateOneClickDeploy(deploymentPayload);

      if (!validationResult.success) {
        throw new Error(validationResult.error || "Validation failed");
      }

      // Check if all integrations are connected
      if (validationResult.missingIntegrations?.length > 0) {
        setMissingIntegrations(validationResult.missingIntegrations);
        setShowSetupWizard(true);
        setStatus("setup-required");
        return;
      }

      // All integrations connected, start deployment
      const deployResult = await startOneClickDeploy(deploymentPayload);

      if (!deployResult.success) {
        const deployError = new Error(deployResult.error || "Deployment start failed");
        deployError.failedStep = deployResult.failedStep;
        deployError.currentStep = deployResult.currentStep;
        deployError.stackTrace = deployResult.stack;
        throw deployError;
      }

      setDeploymentId(deployResult.deploymentId);
      setStatus("deploying");
      onDeploymentStart?.(deployResult.deploymentId);

      // Start polling for progress
      startPolling(deployResult.deploymentId);
    } catch (err) {
      console.error("Deployment error:", err);
      setCurrentStep(err.currentStep || err.data?.currentStep || "Deployment Start");
      setFailedStep(err.failedStep || err.data?.failedStep || err.currentStep || "Deployment Start");
      setStackTrace(err.stackTrace || err.data?.stack || "");
      setJenkinsDetails(err.jenkins || err.data?.jenkins || null);
      setError(err.message || "Failed to start deployment");
      setStatus("failed");
    }
  };

  // Poll for deployment progress
  const startPolling = (depId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(() => {
      pollDeploymentProgress(depId);
    }, 2000); // Poll every 2 seconds
  };

  // Get deployment progress
  const pollDeploymentProgress = async (depId) => {
    try {
      const progressData = await getDeploymentProgress(depId);

      if (!progressData.success) {
        throw new Error(progressData.error || "Failed to get progress");
      }

      setCurrentPhase(progressData.currentPhase || 1);
      setCurrentStep(progressData.currentStep || "");
      setFailedStep(progressData.failedStep || "");
      setStackTrace(progressData.stack || "");
      setJenkinsDetails(progressData.jenkins || null);
      setPhaseProgress(progressData.phaseProgress || {});
      setOverallProgress(progressData.overallProgress || 0);
      setDeploymentLogs([
        ...(progressData.logs || []).map((log) => ({
          timestamp: log.timestamp,
          level: log.level,
          message: log.message,
        })),
        ...(progressData.stepLogs || []).map((log) => ({
          timestamp: log.timestamp,
          level: log.level,
          message: `${log.step} ${log.event}${log.error ? `: ${log.error}` : ""}`,
        })),
      ].slice(-30));
      setDeploymentOutput({
        publicIp: progressData.publicIp,
        applicationUrl: progressData.applicationUrl || progressData.appUrl,
      });

      // Check if deployment is complete or failed
      if (progressData.status === "complete") {
        setStatus("complete");
        clearInterval(pollIntervalRef.current);
        onDeploymentComplete?.({
          deploymentId: depId,
          result: progressData,
        });
      } else if (progressData.status === "failed") {
        const errorMessage = progressData.error || "No detailed error was returned by the deployment progress endpoint";
        setStatus("failed");
        setError(errorMessage);
        setFailedStep(progressData.failedStep || progressData.currentStep || "Unknown Step");
        setStackTrace(progressData.stack || "");
        setJenkinsDetails(progressData.jenkins || null);
        clearInterval(pollIntervalRef.current);
      }
    } catch (err) {
      console.error("Poll error:", err);
      setStatus("failed");
      setCurrentStep(err.data?.currentStep || "Progress Lookup");
      setFailedStep(err.data?.failedStep || "Progress Lookup");
      setStackTrace(err.data?.stack || err.stack || "");
      setJenkinsDetails(err.data?.jenkins || null);
      setError(getVisibleErrorMessage(err, "Failed to get deployment progress"));
      clearInterval(pollIntervalRef.current);
    }
  };

  // Retry setup after integrations connected
  const handleRetrySetup = async () => {
    setShowSetupWizard(false);
    await startDeployment();
  };

  // Retry on error
  const handleRetry = async () => {
    await startDeployment();
  };

  // Handle close
  const handleClose = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setDeploymentId(null);
    setCurrentPhase(1);
    setCurrentStep("");
    setFailedStep("");
    setStackTrace("");
    setJenkinsDetails(null);
    setDeploymentLogs([]);
    setDeploymentOutput(null);
    setPhaseProgress({});
    setOverallProgress(0);
    setError(null);
    setStatus("idle");
    setShowSetupWizard(false);
    setMissingIntegrations([]);
    onClose?.();
  };

  // Auto-start deployment when modal opens
  useEffect(() => {
    if (isOpen && status === "idle") {
      startDeployment();
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Setup Wizard - shown when integrations are missing */}
      {showSetupWizard && (
        <SetupWizard
          isOpen={showSetupWizard}
          missingIntegrations={missingIntegrations}
          onClose={() => setShowSetupWizard(false)}
          onRetry={handleRetrySetup}
        />
      )}

      {/* Deployment Progress - shown during deployment */}
      {!showSetupWizard && (
        <DeploymentProgress
          isOpen={isOpen && !showSetupWizard}
          deploymentId={deploymentId}
          currentPhase={currentPhase}
          phaseProgress={phaseProgress}
          overallProgress={overallProgress}
          error={error}
          currentStep={currentStep}
          failedStep={failedStep}
          stackTrace={stackTrace}
          jenkinsDetails={jenkinsDetails}
          status={status === "complete" ? "complete" : status}
          logs={deploymentLogs}
          deploymentOutput={deploymentOutput}
          onClose={handleClose}
          onRetry={status === "failed" ? handleRetry : null}
        />
      )}
    </>
  );
}

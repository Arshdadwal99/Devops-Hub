import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  getAWSConnection,
  getInstanceTypes,
  createInfrastructure,
  getProvisioningStatus,
} from "../lib/api";
import { isValidRegionCode, getFullRegionLabel } from "../constants/awsRegions";

const PROVISIONING_STEPS = [
  "Creating Security Group",
  "Authorizing Ports (22, 80, 443)",
  "Retrieving AMI",
  "Creating EC2 Instance",
  "Waiting for Running State",
  "Allocating Public IP",
  "Bootstrapping Server",
];

function DetailCard({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-800/30 p-3">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-sm font-mono text-slate-200 break-all">{value}</p>
    </div>
  );
}

function StepIndicator({ steps, current, completed }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((stepTitle, idx) => (
        <div key={idx} className="flex-1">
          <div className="flex items-center">
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold transition ${
                idx < completed
                  ? "bg-emerald-500 text-white"
                  : idx === current
                  ? "bg-blue-500 text-white"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {idx < completed ? "✓" : idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-2 transition ${
                  idx < completed ? "bg-emerald-500" : "bg-slate-700"
                }`}
              />
            )}
          </div>
          <p className="mt-2 text-xs font-medium text-center text-slate-400">{stepTitle}</p>
        </div>
      ))}
    </div>
  );
}

function formatJobValue(value) {
  if (!value) return "Waiting...";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function AWSInfrastructureProvisioning() {
  const navigate = useNavigate();
  const { connectionId } = useParams();
  const [connection, setConnection] = useState(null);
  const [instanceTypes, setInstanceTypes] = useState(null);
  const [wizardStep, setWizardStep] = useState(1); // 1, 2, 3, 4, provisioning, complete

  // Configuration state
  const [name, setName] = useState("");
  const [instanceType, setInstanceType] = useState("t3.micro");
  const [os, setOs] = useState("ubuntu");
  const [storageSize, setStorageSize] = useState("30");
  const [selectedRegion, setSelectedRegion] = useState("");

  // Provisioning state
  const [provisioning, setProvisioning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [provisioningSteps, setProvisioningSteps] = useState([]);
  const [currentJobId, setCurrentJobId] = useState("");
  const [currentStep, setCurrentStep] = useState("");
  const [currentOperation, setCurrentOperation] = useState("");
  const [lastSuccessfulStep, setLastSuccessfulStep] = useState("");
  const [error, setError] = useState("");
  const [createdInfrastructure, setCreatedInfrastructure] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadData();
  }, [connectionId]);

  const loadData = async () => {
    try {
      const connResp = await getAWSConnection(connectionId);
      setConnection(connResp.connection);
      
      const regionCode = connResp.connection.region;
      
      // Validate region code from connection
      if (!isValidRegionCode(regionCode)) {
        console.error("[AWS Provisioning] Invalid region code in connection", {
          region: regionCode,
          connectionId,
        });
        setError(
          `Invalid region code in AWS connection: ${regionCode}. Please reconnect your AWS account.`
        );
        return;
      }
      
      console.log("[AWS Provisioning] Connection loaded successfully", {
        connectionId,
        region: regionCode,
        regionLabel: getFullRegionLabel(regionCode),
        accountId: connResp.connection.accountId,
      });
      
      setSelectedRegion(regionCode);

      const typesResp = await getInstanceTypes();
      setInstanceTypes(typesResp);
    } catch (err) {
      const errorMessage = err.message || "Failed to load connection data";
      console.error("[AWS Provisioning] Error loading connection", {
        error: errorMessage,
        connectionId,
      });
      setError(errorMessage);
    }
  };

  const updateStepStatus = (index, status) => {
    setProvisioningSteps((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], status };
      }
      return updated;
    });
  };

  const handleStartProvisioning = async () => {
    if (!name || !instanceType || !os || !selectedRegion) {
      setError("All configuration fields are required");
      return;
    }

    // Validate region code
    if (!isValidRegionCode(selectedRegion)) {
      setError(
        `Invalid region code '${selectedRegion}'. Please select a valid AWS region from the connection details.`
      );
      console.warn(
        `[AWS Provisioning] Invalid region code: ${selectedRegion}. Valid regions must match AWS SDK format (e.g., us-east-1).`
      );
      return;
    }

    setError("");
    setProvisioning(true);
    setWizardStep("provisioning");
    setProvisioningSteps(
      PROVISIONING_STEPS.map((title) => ({
        title,
        status: "pending",
      }))
    );
    setProgress(0);
    setCurrentJobId("");
    setCurrentStep("");
    setCurrentOperation("");
    setLastSuccessfulStep("");

    console.log("[AWS Provisioning] Starting infrastructure provisioning", {
      name,
      instanceType,
      os,
      storageSize: `${storageSize} GB`,
      region: selectedRegion,
      regionLabel: getFullRegionLabel(selectedRegion),
    });

    try {
      // Initialize first step
      updateStepStatus(0, "in-progress");
      setProgress(5);

      console.log(`[AWS Provisioning] Creating infrastructure with region code: ${selectedRegion}`);

      // Make API call to create infrastructure (returns jobId immediately)
      const response = await createInfrastructure(connectionId, {
        instanceType,
        os,
        storageSize: parseInt(storageSize),
        name,
        region: selectedRegion,
      });

      console.log("[AWS Provisioning] Provisioning job queued", {
        jobId: response.jobId,
        status: response.status,
        statusUrl: response.statusUrl,
      });
      setCurrentJobId(response.jobId);

      // Start polling for job status
      const provisionedInfrastructure = await pollProvisioningStatus(response.jobId);

      setProgress(100);
      navigate("/aws/infrastructure", {
        replace: true,
        state: {
          createdInstanceId: provisionedInfrastructure?.instanceId,
          provisioningJobId: response.jobId,
        },
      });
    } catch (err) {
      const errorMessage = err.message || "Failed to create infrastructure";
      console.error("[AWS Provisioning] Error during infrastructure creation", {
        error: errorMessage,
        region: selectedRegion,
      });
      setError(errorMessage);
      const lastPending = provisioningSteps.findIndex((s) => s.status !== "complete");
      if (lastPending >= 0) {
        updateStepStatus(lastPending, "failed");
      }
    } finally {
      setProvisioning(false);
    }
  };

  const pollProvisioningStatus = async (jobId) => {
    const pollInterval = 2000; // Poll every 2 seconds
    const maxAttempts = 450; // 15 minutes max
    let attempts = 0;

    console.log("[AWS Provisioning] Starting to poll job status", { jobId, pollInterval });

    while (attempts < maxAttempts) {
      try {
        const statusResponse = await getProvisioningStatus(jobId);
        const { job } = statusResponse;

        console.log("[AWS Provisioning] Job status polled", {
          jobId,
          status: job.status,
          progress: job.progress,
          currentStep: job.currentStep,
          currentOperation: job.currentOperation || job.awsOperation,
          lastSuccessfulStep: job.lastSuccessfulStep,
          stepCount: job.steps.length,
        });

        // Update progress
        setProgress(job.progress);
        setCurrentStep(job.currentStep || "");
        setCurrentOperation(job.currentOperation || job.awsOperation || "");
        setLastSuccessfulStep(job.lastSuccessfulStep || "");

        // Map backend steps to frontend UI steps and update
        if (job.steps && job.steps.length > 0) {
          updateProvisioningStepsFromJob(job.steps, job.status, job.currentStep);
        }

        // Check if job is done
        if (job.status === "completed") {
          console.log("[AWS Provisioning] Provisioning completed successfully", {
            jobId,
            result: job.result,
          });

          if (job.result) {
            setCreatedInfrastructure(job.result);
          }
          return job.result; // Job completed
        }

        if (job.status === "failed") {
          const errorMsg = job.error?.message || "Provisioning failed";
          console.error("[AWS Provisioning] Provisioning job failed", {
            jobId,
            error: job.error,
            failedStep: job.error?.failedStep,
          });

          throw new Error(errorMsg);
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        attempts++;
      } catch (err) {
        if (attempts < maxAttempts - 1) {
          console.warn("[AWS Provisioning] Error polling status, will retry", {
            error: err.message,
            attempt: attempts + 1,
            jobId,
          });
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          attempts++;
        } else {
          throw err;
        }
      }
    }

    throw new Error("Provisioning timeout: Job did not complete within 15 minutes");
  };

  const updateProvisioningStepsFromJob = (jobSteps, jobStatus, activeStep) => {
    // Map backend steps to frontend step display
    const stepMap = {
      initialization: 0,
      creating_security_group: 0,
      authorizing_security_group: 1,
      fetching_ami: 2,
      creating_ec2_instance: 3,
      waiting_running_state: 4,
      allocating_public_ip: 5,
      completing: 6,
    };

    setProvisioningSteps((prev) => {
      const baseSteps = prev.length
        ? prev
        : PROVISIONING_STEPS.map((title) => ({ title, status: "pending" }));
      const updatedSteps = baseSteps.map((step) => ({ ...step }));

      for (const jobStep of jobSteps) {
        const frontendStepIdx = stepMap[jobStep.step] ?? -1;
        if (frontendStepIdx >= 0) {
          if (jobStep.status === "completed") {
            updatedSteps[frontendStepIdx].status = "complete";
          } else if (jobStep.status === "in_progress") {
            updatedSteps[frontendStepIdx].status = "in-progress";
          } else if (jobStep.status === "failed") {
            updatedSteps[frontendStepIdx].status = "failed";
            if (jobStep.error) {
              updatedSteps[frontendStepIdx].error = jobStep.error;
            }
          }
        }
      }

      const activeStepIdx = stepMap[activeStep] ?? -1;
      if (activeStepIdx >= 0 && jobStatus === "in_progress") {
        updatedSteps.forEach((step, idx) => {
          if (idx < activeStepIdx && step.status !== "failed") {
            step.status = "complete";
          }
        });
      }

      if (jobStatus === "failed") {
        for (let i = 0; i < updatedSteps.length; i++) {
          if (updatedSteps[i].status === "pending") {
            updatedSteps[i].status = "failed";
          }
        }
      }

      return updatedSteps;
    });
  };

  const simulateProvisioningSteps = async () => {
    const delays = [1200, 1000, 800, 1500, 2000, 1200, 1500];
    let cumulativeProgress = 10;

    for (let i = 0; i < PROVISIONING_STEPS.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, delays[i]));

      updateStepStatus(i, "complete");
      cumulativeProgress += (90 - 10) / PROVISIONING_STEPS.length;
      setProgress(Math.min(cumulativeProgress, 99));

      if (i < PROVISIONING_STEPS.length - 1) {
        updateStepStatus(i + 1, "in-progress");
      }
    }
  };

  if (!connection) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 min-h-screen">
        <div className="text-center text-slate-400">Loading...</div>
      </main>
    );
  }

  const wizardSteps = ["Instance Type", "Operating System", "Storage Size", "Review"];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() =>
            navigate(
              wizardStep === "provisioning" || wizardStep === "complete"
                ? `/aws/${connectionId}`
                : `/aws/${connectionId}`
            )
          }
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200 mb-4"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold text-slate-100">Create Infrastructure</h1>
        <p className="mt-2 text-slate-400">
          Provision a new EC2 instance in {connection.connectionName}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 flex items-start gap-3"
        >
          <span className="text-lg flex-shrink-0">❌</span>
          <div>{error}</div>
        </motion.div>
      )}

      {/* Configuration Steps */}
      {[1, 2, 3, 4].includes(wizardStep) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-8 backdrop-blur-xl"
        >
          {/* Step 1: Instance Type */}
          {wizardStep === 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-6">Select Instance Type</h2>
                <p className="text-slate-400 mb-6">
                  Choose the compute capacity for your EC2 instance
                </p>

                <div className="space-y-3">
                  {[
                    {
                      name: "t3.micro",
                      description: "Next-gen burstable. 2 vCPUs, 1 GB memory",
                      cost: "$7.90",
                      recommended: true,
                    },
                    {
                      name: "t3.small",
                      description: "Next-gen burstable. 2 vCPUs, 2 GB memory",
                      cost: "$15.80",
                    },
                  ].map((type) => (
                    <label
                      key={type.name}
                      className={`flex items-start gap-4 rounded-lg border-2 p-4 cursor-pointer transition ${
                        instanceType === type.name
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-slate-700 bg-slate-800/30 hover:border-slate-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="instanceType"
                        value={type.name}
                        checked={instanceType === type.name}
                        onChange={(e) => setInstanceType(e.target.value)}
                        className="mt-1 flex-shrink-0"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{type.name}</span>
                          {type.recommended && (
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-emerald-500/20 text-emerald-200">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-400 mt-1">{type.description}</p>
                        <p className="text-xs text-slate-500 mt-2">{type.cost}/month</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button
                  onClick={() => navigate(`/aws/${connectionId}`)}
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-800/30 px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800/50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setWizardStep(2)}
                  className="flex-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Next
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Operating System */}
          {wizardStep === 2 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-6">Select Operating System</h2>
                <p className="text-slate-400 mb-6">Choose the operating system for your instance</p>

                <div className="space-y-3">
                  {[
                    {
                      name: "ubuntu",
                      displayName: "Ubuntu 22.04 LTS",
                      notes: "Long-term support, widely used in DevOps",
                      defaultUser: "ubuntu",
                    },
                    {
                      name: "amazon-linux",
                      displayName: "Amazon Linux 2023",
                      notes: "AWS-optimized, faster boot times",
                      defaultUser: "ec2-user",
                    },
                  ].map((osOption) => (
                    <label
                      key={osOption.name}
                      className={`flex items-start gap-4 rounded-lg border-2 p-4 cursor-pointer transition ${
                        os === osOption.name
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-slate-700 bg-slate-800/30 hover:border-slate-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="os"
                        value={osOption.name}
                        checked={os === osOption.name}
                        onChange={(e) => setOs(e.target.value)}
                        className="mt-1 flex-shrink-0"
                      />
                      <div className="flex-1">
                        <span className="font-bold text-slate-100">{osOption.displayName}</span>
                        <p className="text-sm text-slate-400 mt-1">{osOption.notes}</p>
                        <p className="text-xs text-slate-500 mt-2">Default user: {osOption.defaultUser}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button
                  onClick={() => setWizardStep(1)}
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-800/30 px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800/50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setWizardStep(3)}
                  className="flex-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Next
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Storage Size */}
          {wizardStep === 3 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-6">Configure Storage</h2>
                <p className="text-slate-400 mb-6">Set the volume size for your instance</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-200 mb-3">
                      Storage Size (GB)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        value={storageSize}
                        onChange={(e) => setStorageSize(e.target.value)}
                        min="20"
                        max="100"
                        className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <input
                        type="number"
                        value={storageSize}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(20, parseInt(e.target.value) || 30));
                          setStorageSize(val.toString());
                        }}
                        min="20"
                        max="100"
                        className="w-16 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-slate-100 text-right"
                      />
                      <span className="text-slate-400">GB</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Storage size: {storageSize} GB (gp3 volume type)
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-800/50 p-4 mt-6">
                    <p className="text-sm text-slate-300">
                      <strong>💡 Tip:</strong> Start with 30-50 GB for most applications. You can expand
                      storage later.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button
                  onClick={() => setWizardStep(2)}
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-800/30 px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800/50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setWizardStep(4)}
                  className="flex-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  Next
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Review */}
          {wizardStep === 4 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl font-bold text-slate-100 mb-6">Review Configuration</h2>

                {/* Instance Name */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-200 mb-2">
                    Instance Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., my-devops-server"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Configuration Summary */}
                <div className="rounded-lg bg-slate-800/30 p-6 space-y-3">
                  <h3 className="font-semibold text-slate-100 mb-4">Configuration Summary</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Instance Type</p>
                      <p className="text-sm text-slate-200 mt-1">{instanceType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Operating System</p>
                      <p className="text-sm text-slate-200 mt-1">
                        {os === "ubuntu" ? "Ubuntu 22.04 LTS" : "Amazon Linux 2023"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Storage</p>
                      <p className="text-sm text-slate-200 mt-1">{storageSize} GB</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Region</p>
                      <p className="text-sm text-slate-200 mt-1">{selectedRegion}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-700 mt-4">
                    <p className="text-xs text-slate-400">
                      ✓ Security Group with SSH (22), HTTP (80), HTTPS (443) enabled
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      ✓ Docker, Docker Compose, Git will be automatically installed
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button
                  onClick={() => setWizardStep(3)}
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-800/30 px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800/50"
                >
                  Previous
                </button>
                <button
                  onClick={handleStartProvisioning}
                  disabled={!name || provisioning}
                  className="flex-1 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {provisioning ? "Creating..." : "Create Infrastructure"}
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Provisioning Progress */}
      {wizardStep === "provisioning" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-8 backdrop-blur-xl"
        >
          <h2 className="text-2xl font-bold text-slate-100 mb-8">Provisioning Infrastructure</h2>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-300">Overall Progress</span>
              <span className="text-sm font-semibold text-emerald-400">{Math.floor(progress)}%</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300"
              />
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-3">
            <DetailCard label="Current Step" value={formatJobValue(currentStep)} />
            <DetailCard label="Current AWS Operation" value={currentOperation || "Waiting..."} />
            <DetailCard label="Last Successful Step" value={formatJobValue(lastSuccessfulStep)} />
          </div>

          {currentJobId && (
            <div className="mb-6 flex justify-end">
              <button
                onClick={() => navigate(`/aws/jobs/${currentJobId}/debug`)}
                className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-200 transition hover:bg-blue-500/20"
              >
                View Debug Logs
              </button>
            </div>
          )}

          {/* Provisioning Steps */}
          <div className="space-y-3">
            {provisioningSteps.map((step, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-center gap-3 rounded-lg bg-slate-800/30 p-4 border border-slate-700/50"
              >
                <div className="flex-shrink-0 w-6 h-6">
                  {step.status === "complete" && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-full h-full rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold"
                    >
                      ✓
                    </motion.div>
                  )}
                  {step.status === "in-progress" && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="w-full h-full rounded-full border-2 border-blue-500/40 border-t-blue-500"
                    />
                  )}
                  {step.status === "failed" && (
                    <div className="w-full h-full rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                      ✕
                    </div>
                  )}
                  {step.status === "pending" && (
                    <div className="w-full h-full rounded-full bg-slate-600 flex items-center justify-center text-slate-300">
                      ○
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`font-medium ${
                      step.status === "complete"
                        ? "text-emerald-300"
                        : step.status === "in-progress"
                        ? "text-blue-300"
                        : step.status === "failed"
                        ? "text-red-300"
                        : "text-slate-400"
                    }`}
                  >
                    {step.title}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Complete */}
      {wizardStep === "complete" && createdInfrastructure && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Success Card */}
          <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 p-8 backdrop-blur-xl text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="text-6xl mb-4"
            >
              ✅
            </motion.div>
            <h2 className="text-3xl font-bold text-emerald-300 mb-2">Infrastructure Ready</h2>
            <p className="text-slate-300">
              Your EC2 instance has been successfully created and is ready to use
            </p>
          </div>

          {/* Infrastructure Details */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-8 backdrop-blur-xl">
            <h3 className="text-xl font-bold text-slate-100 mb-6">Infrastructure Details</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailCard label="Instance ID" value={createdInfrastructure.instanceId} />
              <DetailCard label="Instance Type" value={createdInfrastructure.instanceType} />
              <DetailCard label="Public IP" value={createdInfrastructure.publicIp || "Allocating..."} />
              <DetailCard label="Private IP" value={createdInfrastructure.privateIp || "—"} />
              <DetailCard label="Operating System" value={createdInfrastructure.operatingSystem.toUpperCase()} />
              <DetailCard label="Region" value={createdInfrastructure.region} />
              <DetailCard label="Storage" value={`${createdInfrastructure.storageSize} GB`} />
              <DetailCard label="Status" value="Running ✓" />
            </div>
          </div>

          {/* Bootstrap Information */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-8 backdrop-blur-xl">
            <h3 className="text-xl font-bold text-slate-100 mb-6">Installed Services</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { name: "Docker", icon: "🐳", status: true },
                { name: "Docker Compose", icon: "📦", status: true },
                { name: "Git", icon: "📂", status: true },
                { name: "cURL", icon: "🌐", status: true },
                { name: "SSH Server", icon: "🔐", status: true },
                { name: "Port 22 (SSH)", icon: "🔌", status: true },
                { name: "Port 80 (HTTP)", icon: "🌍", status: true },
                { name: "Port 443 (HTTPS)", icon: "🔒", status: true },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30">
                  <span className="text-2xl">{item.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium text-slate-200">{item.name}</p>
                  </div>
                  <span className="text-emerald-400">✓</span>
                </div>
              ))}
            </div>
          </div>

          {/* Next Steps */}
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-8 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-blue-300 mb-4">🚀 Next Steps</h3>
            <ol className="space-y-3 text-slate-300">
              <li className="flex gap-3">
                <span className="font-bold text-blue-400 flex-shrink-0">1.</span>
                <span>
                  SSH into your instance: <code className="text-xs font-mono bg-slate-800/50 px-2 py-1 rounded">ssh -i key.pem ubuntu@{createdInfrastructure.publicIp}</code>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-400 flex-shrink-0">2.</span>
                <span>Deploy your application using Docker or Docker Compose</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-400 flex-shrink-0">3.</span>
                <span>Monitor logs and metrics from the infrastructure dashboard</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-400 flex-shrink-0">4.</span>
                <span>Set up automated deployments via Jenkins pipeline</span>
              </li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => navigate(`/aws/${connectionId}/infrastructure`)}
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
            >
              📊 View Infrastructure
            </button>
            <button
              onClick={() => {
                setWizardStep(1);
                setName("");
                setInstanceType("t3.micro");
                setOs("ubuntu");
                setStorageSize("30");
                setError("");
              }}
              className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-6 py-3 font-semibold text-blue-200 transition hover:bg-blue-500/20"
            >
              ⚙️ Create Another
            </button>
          </div>
        </motion.div>
      )}
    </main>
  );
}

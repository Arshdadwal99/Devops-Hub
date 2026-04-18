import { DashboardState } from "../models/DashboardState.js";
import { seedData } from "../data/seedData.js";

async function getState() {
  let state = await DashboardState.findOne().sort({ updatedAt: -1 });

  if (!state) {
    state = await DashboardState.create(seedData);
  }

  return state;
}

function addDeploymentLog(state, message) {
  state.logs.deployment.unshift(
    `[${new Date().toLocaleTimeString("en-US", { hour12: false })}] ${message}`
  );
  state.logs.deployment = state.logs.deployment.slice(0, 8);
}

export async function fetchDashboard() {
  const state = await getState();
  return state.toObject();
}

export async function triggerDeploy() {
  const state = await getState();

  state.pipeline.buildStatus = "running";
  state.pipeline.deploymentStatus = "deploying";
  state.pipeline.progress = 100;
  state.controlPanel.previousVersion = state.controlPanel.currentVersion;
  state.controlPanel.currentVersion = "v1.4.3";
  state.controlPanel.lastDeploymentAt = new Date();
  state.metrics.activeContainers = 9;
  addDeploymentLog(state, "Manual deploy triggered from dashboard");
  state.alerts.unshift({
    severity: "info",
    message: "Fresh deployment started from the control panel.",
    createdAt: new Date(),
  });

  await state.save();
  return state.toObject();
}

export async function triggerRollback() {
  const state = await getState();

  const currentVersion = state.controlPanel.currentVersion;
  state.controlPanel.currentVersion = state.controlPanel.previousVersion;
  state.controlPanel.previousVersion = currentVersion;
  state.pipeline.deploymentStatus = "rollback";
  state.pipeline.buildStatus = "success";
  state.pipeline.progress = 73;
  state.metrics.activeContainers = Math.max(6, state.metrics.activeContainers - 1);
  addDeploymentLog(
    state,
    `Rollback executed. Restored ${state.controlPanel.currentVersion}`
  );
  state.alerts.unshift({
    severity: "warning",
    message: "Rollback completed. Verify service stability before the next deploy.",
    createdAt: new Date(),
  });

  await state.save();
  return state.toObject();
}

export async function restartContainers() {
  const state = await getState();

  state.pipeline.deploymentStatus = "restarting";
  state.metrics.latency = Math.max(110, state.metrics.latency - 8);
  addDeploymentLog(state, "Container restart command issued for api and web");
  await state.save();

  return state.toObject();
}

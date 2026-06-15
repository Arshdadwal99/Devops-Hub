import {
  connectDockerHub,
  disconnectDockerHub,
  getDockerHubStatus,
} from "../services/dockerHubRegistryService.js";

function getUserId(req) {
  return req.user?.userId || req.user?.uid || req.user?.id || "system";
}

export async function connectDockerHubHandler(req, res) {
  try {
    const result = await connectDockerHub(getUserId(req), {
      username: req.body?.username,
      accessToken: req.body?.accessToken,
    });

    res.json(result);
  } catch (error) {
    console.error("[Registry] Docker Hub connect failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.detail || error.message,
    });
  }
}

export async function getDockerHubStatusHandler(req, res) {
  try {
    const result = await getDockerHubStatus(getUserId(req));
    res.json(result);
  } catch (error) {
    console.error("[Registry] Docker Hub status failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function disconnectDockerHubHandler(req, res) {
  try {
    const result = await disconnectDockerHub(getUserId(req));
    res.json(result);
  } catch (error) {
    console.error("[Registry] Docker Hub disconnect failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

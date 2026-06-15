import fs from "fs/promises";
import os from "os";
import path from "path";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";

const TEMP_KEY_FILE_PREFIX = "devops-hub-ec2-key-";

function normalizePem(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

export function getEc2KeyPairName() {
  return process.env.AWS_EC2_KEY_NAME || process.env.EC2_KEY_NAME || "generated-per-deployment";
}

export function hasEc2SshKeyConfig() {
  return true;
}

export function validateEc2SshStartupConfig() {
  console.info(
    "EC2 SSH startup key validation skipped: deployment keys are generated automatically per deployment."
  );
}

function getKeyLookupDetails(source = {}) {
  const candidates = [
    ["deployment.generatedPrivateKey", source.generatedPrivateKey],
    ["deployment.generatedKeyMaterial", source.generatedKeyMaterial],
    ["deployment.privateKey", source.privateKey],
    ["deployment.infrastructure.generatedPrivateKey", source.infrastructure?.generatedPrivateKey],
    ["deployment.infrastructure.privateKey", source.infrastructure?.privateKey],
    ["deployment.ec2Instance.generatedPrivateKey", source.ec2Instance?.generatedPrivateKey],
    ["deployment.ec2Instance.privateKey", source.ec2Instance?.privateKey],
    ["infrastructure.generatedPrivateKey", source.generatedPrivateKey],
    ["infrastructure.generatedKeyMaterial", source.generatedKeyMaterial],
    ["infrastructure.privateKey", source.privateKey],
  ];

  const found = candidates.find(([, value]) => value);
  return found ? { keySource: found[0], keyMaterial: found[1] } : null;
}

function getGeneratedKeyName(deployment = {}) {
  return (
    deployment.generatedKeyName ||
    deployment.keyPairName ||
    deployment.infrastructure?.generatedKeyName ||
    deployment.infrastructure?.keyPairName ||
    deployment.ec2Instance?.generatedKeyName ||
    deployment.ec2Instance?.keyPairName ||
    getEc2KeyPairName()
  );
}

export async function loadEc2PrivateKey(deployment = {}) {
  let keyDetails = getKeyLookupDetails(deployment);
  let generatedPrivateKey = keyDetails?.keyMaterial;
  let keySource = keyDetails?.keySource;
  const instanceId = deployment.instanceId || deployment.infrastructure?.instanceId || deployment.ec2Instance?.instanceId;

  if (!generatedPrivateKey && instanceId) {
    const infrastructure = await AWSInfrastructure.findOne({ instanceId }).lean().catch(() => null);
    if (infrastructure?.privateKey) {
      generatedPrivateKey = infrastructure.privateKey;
      keySource = "AWSInfrastructure.privateKey";
      deployment = {
        ...deployment,
        keyPairName: deployment.keyPairName || infrastructure.keyPairName,
      };
    }
  }

  if (generatedPrivateKey) {
    const privateKey = normalizePem(generatedPrivateKey);
    if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
      throw new Error("Generated EC2 private key does not look like PEM private key content.");
    }

    return {
      privateKey,
      keySource,
      keyPairName: getGeneratedKeyName(deployment),
    };
  }

  console.log("[SSH] No generated EC2 private key available", {
    deploymentId: deployment.deploymentId || deployment._id?.toString(),
    instanceId,
    keyPairName: getGeneratedKeyName(deployment),
    hasGeneratedPrivateKey: !!deployment.generatedPrivateKey,
    generatedPrivateKeyLength: deployment.generatedPrivateKey?.length || 0,
  });

  throw new Error(
    "No generated EC2 private key available. Create the instance through DevOps Hub automatic key pair provisioning before SSH deployment."
  );
}

export async function resolveEc2SshKeyForCli(deployment = {}) {
  const keyConfig = await loadEc2PrivateKey(deployment);
  if (keyConfig.keyPath) {
    return keyConfig;
  }

  const keyPath = path.join(os.tmpdir(), `${TEMP_KEY_FILE_PREFIX}${process.pid}.pem`);
  await fs.writeFile(keyPath, `${keyConfig.privateKey}\n`, { mode: 0o600 });
  return {
    ...keyConfig,
    keyPath,
    temporaryKeyPath: true,
  };
}

export function logEc2SshTarget({ logger, keySource, keyPairName, host, operation }) {
  const details = {
    operation,
    keySource,
    keyPairName,
    targetPublicIp: host,
  };

  if (logger?.info) {
    logger.info("EC2 SSH configuration selected", details);
  } else {
    console.log("EC2 SSH configuration selected", details);
  }
}

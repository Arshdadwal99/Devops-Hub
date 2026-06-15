import crypto from "crypto";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  return crypto
    .createHash("sha256")
    .update(String(config.registryEncryptionKey))
    .digest();
}

/**
 * Encrypt a secret string using AES-256-GCM
 * @param {string} secret - The secret to encrypt
 * @returns {{encryptedValue: string, iv: string, authTag: string}} Encrypted secret with IV and auth tag
 * @throws {Error} If secret is not a non-empty string
 */
export function encryptSecret(secret) {
  if (!secret || typeof secret !== "string") {
    throw new Error("Secret must be a non-empty string");
  }

  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const result = {
      encryptedValue: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };

    logger.debug("Secret encrypted successfully", {
      algorithm: ALGORITHM,
      secretLength: secret.length,
      resultStructure: Object.keys(result),
    });

    return result;
  } catch (error) {
    logger.error("Encryption failed", {
      error: error.message,
      algorithm: ALGORITHM,
      secretLength: secret ? secret.length : 0,
    });
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt a secret encrypted with encryptSecret
 * @param {{encryptedValue: string, iv: string, authTag: string}} encryptedSecret - The encrypted secret object
 * @returns {string} The decrypted secret
 * @throws {Error} If encrypted secret is incomplete or decryption fails
 */
export function decryptSecret({ encryptedValue, iv, authTag }) {
  if (!encryptedValue || !iv || !authTag) {
    const missing = [];
    if (!encryptedValue) missing.push("encryptedValue");
    if (!iv) missing.push("iv");
    if (!authTag) missing.push("authTag");
    
    const error = `Encrypted secret is incomplete. Missing: ${missing.join(", ")}`;
    logger.error("Decryption validation failed", {
      providedFields: { encryptedValue: !!encryptedValue, iv: !!iv, authTag: !!authTag },
      missingFields: missing,
    });
    throw new Error(error);
  }

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getEncryptionKey(),
      Buffer.from(iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64")),
      decipher.final(),
    ]).toString("utf8");

    logger.debug("Secret decrypted successfully", {
      algorithm: ALGORITHM,
      decryptedLength: decrypted.length,
    });

    return decrypted;
  } catch (error) {
    logger.error("Decryption failed", {
      error: error.message,
      algorithm: ALGORITHM,
      errorCode: error.code,
    });
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

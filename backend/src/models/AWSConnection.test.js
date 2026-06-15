/**
 * Unit Tests for AWSConnection Schema
 * 
 * Tests schema validation for encrypted credentials
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import mongoose from "mongoose";
import { AWSConnection } from "../models/AWSConnection.js";
import { encryptSecret } from "../services/credentialEncryptionService.js";

describe("AWSConnection Schema", () => {
  let connection;

  beforeEach(() => {
    // Clear any existing test data
    connection = null;
  });

  afterEach(() => {
    // Cleanup
    if (connection) {
      connection = null;
    }
  });

  describe("Encrypted Credentials Schema Validation", () => {
    it("should accept valid encrypted credentials structure", () => {
      const encryptedAccessKey = encryptSecret("AKIAIOSFODNN7EXAMPLE");
      const encryptedSecretKey = encryptSecret("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptedAccessKey,
          secretAccessKey: encryptedSecretKey,
        },
        region: "us-east-1",
        accountId: "123456789012",
        accountArn: "arn:aws:iam::123456789012:user/test",
        accountName: "Test Account",
      });

      // Should not throw
      expect(() => conn.validate()).not.toThrow();
    });

    it("should validate encryptedValue field exists", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: {
            encryptedValue: "base64string",
            iv: "base64iv",
            authTag: "base64tag",
          },
          secretAccessKey: {
            encryptedValue: "base64string",
            iv: "base64iv",
            authTag: "base64tag",
          },
        },
        region: "us-east-1",
        accountId: "123456789012",
        accountArn: "arn:aws:iam::123456789012:user/test",
        accountName: "Test Account",
      });

      expect(() => conn.validate()).not.toThrow();
    });

    it("should reject missing encryptedValue", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: {
            // Missing encryptedValue
            iv: "base64iv",
            authTag: "base64tag",
          },
          secretAccessKey: {
            encryptedValue: "base64string",
            iv: "base64iv",
            authTag: "base64tag",
          },
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });

    it("should reject missing iv", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: {
            encryptedValue: "base64string",
            // Missing iv
            authTag: "base64tag",
          },
          secretAccessKey: {
            encryptedValue: "base64string",
            iv: "base64iv",
            authTag: "base64tag",
          },
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });

    it("should reject missing authTag", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: {
            encryptedValue: "base64string",
            iv: "base64iv",
            // Missing authTag
          },
          secretAccessKey: {
            encryptedValue: "base64string",
            iv: "base64iv",
            authTag: "base64tag",
          },
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });

    it("should reject incomplete secretAccessKey", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: {
            encryptedValue: "base64string",
            iv: "base64iv",
            authTag: "base64tag",
          },
          secretAccessKey: {
            encryptedValue: "base64string",
            // Missing iv and authTag
          },
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });

    it("should reject string instead of object for accessKeyId", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: "just-a-string", // Should be an object
          secretAccessKey: {
            encryptedValue: "base64string",
            iv: "base64iv",
            authTag: "base64tag",
          },
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });

    it("should reject string instead of object for secretAccessKey", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: {
            encryptedValue: "base64string",
            iv: "base64iv",
            authTag: "base64tag",
          },
          secretAccessKey: "just-a-string", // Should be an object
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });
  });

  describe("Other Required Fields", () => {
    it("should require userId", () => {
      const conn = new AWSConnection({
        // Missing userId
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          secretAccessKey: encryptSecret("secret"),
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });

    it("should require connectionName", () => {
      const conn = new AWSConnection({
        userId: "user123",
        // Missing connectionName
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          secretAccessKey: encryptSecret("secret"),
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });

    it("should require encryptedCredentials.accessKeyId", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          // Missing accessKeyId
          secretAccessKey: encryptSecret("secret"),
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });

    it("should require encryptedCredentials.secretAccessKey", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          // Missing secretAccessKey
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });
  });

  describe("Valid Regions", () => {
    const validRegions = [
      "us-east-1",
      "us-east-2",
      "us-west-1",
      "us-west-2",
      "eu-west-1",
      "eu-central-1",
      "ap-northeast-1",
      "ap-southeast-1",
      "ca-central-1",
    ];

    validRegions.forEach((region) => {
      it(`should accept valid region: ${region}`, () => {
        const conn = new AWSConnection({
          userId: "user123",
          connectionName: "Test Connection",
          encryptedCredentials: {
            accessKeyId: encryptSecret("key"),
            secretAccessKey: encryptSecret("secret"),
          },
          region,
          accountId: "123456789012",
        });

        expect(() => conn.validate()).not.toThrow();
      });
    });

    it("should reject invalid region", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          secretAccessKey: encryptSecret("secret"),
        },
        region: "invalid-region", // Not in enum
        accountId: "123456789012",
      });

      expect(() => conn.validate()).toThrow();
    });
  });

  describe("Schema Methods", () => {
    it("should have isValid method", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          secretAccessKey: encryptSecret("secret"),
        },
        region: "us-east-1",
        accountId: "123456789012",
        connected: true,
      });

      expect(typeof conn.isValid).toBe("function");
    });

    it("should have logError method", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          secretAccessKey: encryptSecret("secret"),
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(typeof conn.logError).toBe("function");
      conn.logError("Test error");
      expect(conn.lastError).toBe("Test error");
      expect(conn.errorCount).toBe(1);
    });

    it("should have clearError method", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          secretAccessKey: encryptSecret("secret"),
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      conn.logError("Test error");
      expect(conn.lastError).toBe("Test error");

      conn.clearError();
      expect(conn.lastError).toBeNull();
      expect(conn.lastErrorAt).toBeNull();
      expect(conn.errorCount).toBe(0);
    });
  });

  describe("Quota Limits", () => {
    it("should have default quota limits", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          secretAccessKey: encryptSecret("secret"),
        },
        region: "us-east-1",
        accountId: "123456789012",
      });

      expect(conn.quotaLimits.maxInstances).toBe(10);
      expect(conn.quotaLimits.maxSecurityGroups).toBe(10);
      expect(conn.quotaLimits.maxElasticIPs).toBe(5);
    });

    it("should allow custom quota limits", () => {
      const conn = new AWSConnection({
        userId: "user123",
        connectionName: "Test Connection",
        encryptedCredentials: {
          accessKeyId: encryptSecret("key"),
          secretAccessKey: encryptSecret("secret"),
        },
        region: "us-east-1",
        accountId: "123456789012",
        quotaLimits: {
          maxInstances: 50,
          maxSecurityGroups: 30,
          maxElasticIPs: 10,
        },
      });

      expect(conn.quotaLimits.maxInstances).toBe(50);
      expect(conn.quotaLimits.maxSecurityGroups).toBe(30);
      expect(conn.quotaLimits.maxElasticIPs).toBe(10);
    });
  });
});

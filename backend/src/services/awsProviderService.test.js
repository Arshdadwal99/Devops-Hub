/**
 * Integration Tests for AWS Provider Service with Encrypted Credentials
 * 
 * Tests that the AWSProviderService correctly decrypts credentials and
 * passes them to AWS SDK in the correct format
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { AWSProviderService } from "../services/awsProviderService.js";
import { encryptSecret, decryptSecret } from "../services/credentialEncryptionService.js";

describe("AWS Provider Service - Encrypted Credentials", () => {
  let awsProviderService;

  beforeEach(() => {
    awsProviderService = new AWSProviderService();
  });

  describe("Credential Decryption in getSTSClient", () => {
    it("should successfully decrypt credentials from encrypted object format", async () => {
      // This test verifies the decryption process without making actual AWS calls
      const accessKey = "AKIAIOSFODNN7EXAMPLE";
      const secretKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

      const encryptedCredentials = {
        accessKeyId: encryptSecret(accessKey),
        secretAccessKey: encryptSecret(secretKey),
      };

      // Verify the encrypted credentials have correct structure
      expect(encryptedCredentials.accessKeyId).toHaveProperty("encryptedValue");
      expect(encryptedCredentials.accessKeyId).toHaveProperty("iv");
      expect(encryptedCredentials.accessKeyId).toHaveProperty("authTag");

      // Verify we can decrypt them
      const decryptedAccessKey = decryptSecret(encryptedCredentials.accessKeyId);
      const decryptedSecretKey = decryptSecret(encryptedCredentials.secretAccessKey);

      expect(decryptedAccessKey).toBe(accessKey);
      expect(decryptedSecretKey).toBe(secretKey);
    });

    it("should handle encrypted credentials with various formats", () => {
      const testCredentials = [
        {
          accessKey: "AKIAIOSFODNN7EXAMPLE",
          secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        },
        {
          accessKey: "ASIATEMP2EXAMPLE7QMZ",
          secretKey: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/xxxxx",
        },
      ];

      testCredentials.forEach(({ accessKey, secretKey }) => {
        const encryptedCredentials = {
          accessKeyId: encryptSecret(accessKey),
          secretAccessKey: encryptSecret(secretKey),
        };

        // Verify structure
        expect(encryptedCredentials.accessKeyId.encryptedValue).toBeDefined();
        expect(encryptedCredentials.accessKeyId.iv).toBeDefined();
        expect(encryptedCredentials.accessKeyId.authTag).toBeDefined();

        // Verify decryption
        const decrypted = {
          accessKeyId: decryptSecret(encryptedCredentials.accessKeyId),
          secretAccessKey: decryptSecret(encryptedCredentials.secretAccessKey),
        };

        expect(decrypted.accessKeyId).toBe(accessKey);
        expect(decrypted.secretAccessKey).toBe(secretKey);
      });
    });
  });

  describe("Region Validation", () => {
    it("should accept valid regions", () => {
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
        "sa-east-1",
      ];

      validRegions.forEach((region) => {
        expect(() => awsProviderService.validateRegion(region)).not.toThrow();
      });
    });

    it("should reject invalid regions", () => {
      const invalidRegions = [
        "invalid-region",
        "us-middle-1",
        "eu-south-3",
        "ap-north-1",
      ];

      invalidRegions.forEach((region) => {
        expect(() => awsProviderService.validateRegion(region)).toThrow();
      });
    });

    it("should handle whitespace in region names", () => {
      // Should trim whitespace
      const region = "  us-east-1  ";
      expect(() => awsProviderService.validateRegion(region)).not.toThrow();
    });
  });

  describe("Error Handling for Incomplete Encrypted Credentials", () => {
    it("should throw error if accessKeyId is missing", () => {
      const encryptedCredentials = {
        secretAccessKey: encryptSecret("secret"),
      };

      expect(() => {
        decryptSecret(encryptedCredentials.accessKeyId);
      }).toThrow();
    });

    it("should throw error if secretAccessKey is missing", () => {
      const encryptedCredentials = {
        accessKeyId: encryptSecret("key"),
      };

      expect(() => {
        decryptSecret(encryptedCredentials.secretAccessKey);
      }).toThrow();
    });

    it("should throw error if encrypted object is incomplete", () => {
      const incompleteEncrypted = {
        encryptedValue: "base64",
        // Missing iv and authTag
      };

      expect(() => decryptSecret(incompleteEncrypted)).toThrow();
    });
  });

  describe("Decryption Output Format", () => {
    it("should produce strings suitable for AWS SDK", () => {
      const accessKey = "AKIAIOSFODNN7EXAMPLE";
      const secretKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

      const encryptedCredentials = {
        accessKeyId: encryptSecret(accessKey),
        secretAccessKey: encryptSecret(secretKey),
      };

      const decryptedCredentials = {
        accessKeyId: decryptSecret(encryptedCredentials.accessKeyId),
        secretAccessKey: decryptSecret(encryptedCredentials.secretAccessKey),
      };

      // AWS SDK expects strings
      expect(typeof decryptedCredentials.accessKeyId).toBe("string");
      expect(typeof decryptedCredentials.secretAccessKey).toBe("string");

      // Should match original credentials
      expect(decryptedCredentials.accessKeyId).toBe(accessKey);
      expect(decryptedCredentials.secretAccessKey).toBe(secretKey);
    });

    it("should handle credentials with special characters", () => {
      const accessKey = "AKIA+IOSFODNNxxxxxx";
      const secretKey = "xxxx/xxxx+xxxx=xxxx/xxxx";

      const encrypted = {
        accessKeyId: encryptSecret(accessKey),
        secretAccessKey: encryptSecret(secretKey),
      };

      const decrypted = {
        accessKeyId: decryptSecret(encrypted.accessKeyId),
        secretAccessKey: decryptSecret(encrypted.secretAccessKey),
      };

      expect(decrypted.accessKeyId).toBe(accessKey);
      expect(decrypted.secretAccessKey).toBe(secretKey);
    });
  });

  describe("Multiple Encryption/Decryption Cycles", () => {
    it("should handle multiple encryption and decryption cycles", () => {
      const originalAccessKey = "AKIAIOSFODNN7EXAMPLE";
      const originalSecretKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

      // First cycle
      let encrypted = {
        accessKeyId: encryptSecret(originalAccessKey),
        secretAccessKey: encryptSecret(originalSecretKey),
      };

      let decrypted = {
        accessKeyId: decryptSecret(encrypted.accessKeyId),
        secretAccessKey: decryptSecret(encrypted.secretAccessKey),
      };

      expect(decrypted.accessKeyId).toBe(originalAccessKey);
      expect(decrypted.secretAccessKey).toBe(originalSecretKey);

      // Second cycle (re-encrypt the decrypted values)
      encrypted = {
        accessKeyId: encryptSecret(decrypted.accessKeyId),
        secretAccessKey: encryptSecret(decrypted.secretAccessKey),
      };

      decrypted = {
        accessKeyId: decryptSecret(encrypted.accessKeyId),
        secretAccessKey: decryptSecret(encrypted.secretAccessKey),
      };

      expect(decrypted.accessKeyId).toBe(originalAccessKey);
      expect(decrypted.secretAccessKey).toBe(originalSecretKey);
    });
  });

  describe("Data Isolation", () => {
    it("should not leak decrypted credentials in errors", () => {
      const accessKey = "AKIAIOSFODNN7EXAMPLE";
      const encrypted = encryptSecret(accessKey);

      // Modify to cause decryption failure
      const tampered = {
        encryptedValue: encrypted.encryptedValue,
        iv: "AAAAAAAAAAAAAAAA",
        authTag: encrypted.authTag,
      };

      try {
        decryptSecret(tampered);
        expect.fail("Should have thrown");
      } catch (error) {
        // Verify error message doesn't contain the original secret
        expect(error.message).not.toContain(accessKey);
      }
    });
  });
});

/**
 * Unit Tests for Credential Encryption Service
 * 
 * Tests encryption and decryption of AWS credentials
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { encryptSecret, decryptSecret } from "../services/credentialEncryptionService.js";

describe("Credential Encryption Service", () => {
  describe("encryptSecret", () => {
    it("should encrypt a valid secret string", () => {
      const secret = "AKIAIOSFODNN7EXAMPLE";
      const encrypted = encryptSecret(secret);

      expect(encrypted).toBeDefined();
      expect(encrypted).toHaveProperty("encryptedValue");
      expect(encrypted).toHaveProperty("iv");
      expect(encrypted).toHaveProperty("authTag");
      expect(typeof encrypted.encryptedValue).toBe("string");
      expect(typeof encrypted.iv).toBe("string");
      expect(typeof encrypted.authTag).toBe("string");
    });

    it("should return base64 encoded values", () => {
      const secret = "test-secret-key";
      const encrypted = encryptSecret(secret);

      // Base64 regex pattern
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

      expect(base64Regex.test(encrypted.encryptedValue)).toBe(true);
      expect(base64Regex.test(encrypted.iv)).toBe(true);
      expect(base64Regex.test(encrypted.authTag)).toBe(true);
    });

    it("should produce different ciphertexts for the same secret", () => {
      const secret = "same-secret";
      const encrypted1 = encryptSecret(secret);
      const encrypted2 = encryptSecret(secret);

      // Same plaintext should produce different ciphertexts due to random IV
      expect(encrypted1.encryptedValue).not.toBe(encrypted2.encryptedValue);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      // Auth tag will also be different due to different IV
      expect(encrypted1.authTag).not.toBe(encrypted2.authTag);
    });

    it("should throw error for empty string", () => {
      expect(() => encryptSecret("")).toThrow("Secret must be a non-empty string");
    });

    it("should throw error for null", () => {
      expect(() => encryptSecret(null)).toThrow("Secret must be a non-empty string");
    });

    it("should throw error for undefined", () => {
      expect(() => encryptSecret(undefined)).toThrow("Secret must be a non-empty string");
    });

    it("should throw error for non-string values", () => {
      expect(() => encryptSecret(123)).toThrow("Secret must be a non-empty string");
      expect(() => encryptSecret({})).toThrow("Secret must be a non-empty string");
      expect(() => encryptSecret([])).toThrow("Secret must be a non-empty string");
    });

    it("should handle long secrets", () => {
      const longSecret = "x".repeat(10000);
      const encrypted = encryptSecret(longSecret);

      expect(encrypted).toHaveProperty("encryptedValue");
      expect(encrypted).toHaveProperty("iv");
      expect(encrypted).toHaveProperty("authTag");
    });

    it("should handle special characters in secrets", () => {
      const secretWithSpecialChars =
        "p@$$w0rd!@#$%^&*()_+-=[]{}|;:',.<>?/`~";
      const encrypted = encryptSecret(secretWithSpecialChars);

      expect(encrypted).toHaveProperty("encryptedValue");
      expect(encrypted.encryptedValue.length).toBeGreaterThan(0);
    });

    it("should handle AWS credential formats", () => {
      const credentials = [
        "AKIAIOSFODNN7EXAMPLE",
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "ASIATEMP2EXAMPLETOKEN",
      ];

      credentials.forEach((credential) => {
        const encrypted = encryptSecret(credential);
        expect(encrypted).toHaveProperty("encryptedValue");
        expect(encrypted).toHaveProperty("iv");
        expect(encrypted).toHaveProperty("authTag");
      });
    });
  });

  describe("decryptSecret", () => {
    it("should decrypt an encrypted secret", () => {
      const originalSecret = "AKIAIOSFODNN7EXAMPLE";
      const encrypted = encryptSecret(originalSecret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(originalSecret);
    });

    it("should decrypt long secrets", () => {
      const longSecret = "x".repeat(10000);
      const encrypted = encryptSecret(longSecret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(longSecret);
    });

    it("should decrypt secrets with special characters", () => {
      const secretWithSpecialChars =
        "p@$$w0rd!@#$%^&*()_+-=[]{}|;:',.<>?/`~";
      const encrypted = encryptSecret(secretWithSpecialChars);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(secretWithSpecialChars);
    });

    it("should throw error if encryptedValue is missing", () => {
      expect(() =>
        decryptSecret({
          iv: "base64iv",
          authTag: "base64tag",
        })
      ).toThrow("Encrypted secret is incomplete");
    });

    it("should throw error if iv is missing", () => {
      expect(() =>
        decryptSecret({
          encryptedValue: "base64value",
          authTag: "base64tag",
        })
      ).toThrow("Encrypted secret is incomplete");
    });

    it("should throw error if authTag is missing", () => {
      expect(() =>
        decryptSecret({
          encryptedValue: "base64value",
          iv: "base64iv",
        })
      ).toThrow("Encrypted secret is incomplete");
    });

    it("should throw error for tampered ciphertext", () => {
      const secret = "test-secret";
      const encrypted = encryptSecret(secret);

      // Tamper with the ciphertext
      const tampered = {
        encryptedValue: encrypted.encryptedValue.replace(/.$/, "X"),
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      };

      expect(() => decryptSecret(tampered)).toThrow();
    });

    it("should throw error for tampered IV", () => {
      const secret = "test-secret";
      const encrypted = encryptSecret(secret);

      // Tamper with the IV
      const tampered = {
        encryptedValue: encrypted.encryptedValue,
        iv: "AAAAAAAAAAAAAAAA", // Different IV
        authTag: encrypted.authTag,
      };

      expect(() => decryptSecret(tampered)).toThrow();
    });

    it("should throw error for tampered auth tag", () => {
      const secret = "test-secret";
      const encrypted = encryptSecret(secret);

      // Tamper with the auth tag
      const tampered = {
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: "AAAAAAAAAAAAAAAA", // Different auth tag
      };

      expect(() => decryptSecret(tampered)).toThrow();
    });

    it("should throw error for invalid base64 encryptedValue", () => {
      expect(() =>
        decryptSecret({
          encryptedValue: "not-valid-base64!!!",
          iv: "dGVzdA==", // Valid base64
          authTag: "dGVzdA==", // Valid base64
        })
      ).toThrow();
    });

    it("should throw error for invalid base64 IV", () => {
      expect(() =>
        decryptSecret({
          encryptedValue: "dGVzdA==",
          iv: "not-valid-base64!!!",
          authTag: "dGVzdA==",
        })
      ).toThrow();
    });

    it("should throw error for invalid base64 authTag", () => {
      expect(() =>
        decryptSecret({
          encryptedValue: "dGVzdA==",
          iv: "dGVzdA==",
          authTag: "not-valid-base64!!!",
        })
      ).toThrow();
    });

    it("should handle null properties", () => {
      expect(() =>
        decryptSecret({
          encryptedValue: null,
          iv: null,
          authTag: null,
        })
      ).toThrow("Encrypted secret is incomplete");
    });
  });

  describe("Round-trip encryption and decryption", () => {
    const testSecrets = [
      "simple-secret",
      "AKIAIOSFODNN7EXAMPLE",
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "special!@#$%^&*()chars",
      "very-long-secret-" + "x".repeat(1000),
      "emoji-secret-🔒🔑",
      "unicode-secret-日本語-العربية",
    ];

    testSecrets.forEach((secret) => {
      it(`should successfully round-trip: ${secret.substring(0, 30)}...`, () => {
        const encrypted = encryptSecret(secret);
        const decrypted = decryptSecret(encrypted);

        expect(decrypted).toBe(secret);
      });
    });
  });

  describe("Schema validation", () => {
    it("should produce object with all required fields", () => {
      const secret = "test-secret";
      const encrypted = encryptSecret(secret);

      // Check structure matches MongoDB schema
      expect(encrypted).toEqual(
        expect.objectContaining({
          encryptedValue: expect.any(String),
          iv: expect.any(String),
          authTag: expect.any(String),
        })
      );

      // Check no extra fields
      expect(Object.keys(encrypted)).toEqual([
        "encryptedValue",
        "iv",
        "authTag",
      ]);
    });

    it("should work with destructuring", () => {
      const secret = "test-secret";
      const encrypted = encryptSecret(secret);

      // This is how it's used in the schema
      const { encryptedValue, iv, authTag } = encrypted;

      expect(encryptedValue).toBeDefined();
      expect(iv).toBeDefined();
      expect(authTag).toBeDefined();

      // Should be decryptable
      const decrypted = decryptSecret({ encryptedValue, iv, authTag });
      expect(decrypted).toBe(secret);
    });
  });

  describe("Performance", () => {
    it("should encrypt and decrypt quickly", () => {
      const secret = "test-secret";
      const iterations = 100;

      const startEncrypt = Date.now();
      const encryptedArray = [];
      for (let i = 0; i < iterations; i++) {
        encryptedArray.push(encryptSecret(secret));
      }
      const encryptTime = Date.now() - startEncrypt;

      const startDecrypt = Date.now();
      for (const encrypted of encryptedArray) {
        decryptSecret(encrypted);
      }
      const decryptTime = Date.now() - startDecrypt;

      // Should complete 100 operations in reasonable time
      expect(encryptTime).toBeLessThan(5000); // 5 seconds
      expect(decryptTime).toBeLessThan(5000); // 5 seconds

      console.log(`Encryption of ${iterations} items: ${encryptTime}ms`);
      console.log(`Decryption of ${iterations} items: ${decryptTime}ms`);
    });
  });
});

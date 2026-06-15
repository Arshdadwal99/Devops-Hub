import {
  GetCommandInvocationCommand,
  SSMClient,
  SendCommandCommand,
} from "@aws-sdk/client-ssm";
import { awsProviderService } from "./awsProviderService.js";
import { logger } from "../utils/logger.js";
import { ec2SsmDiagnosticsService } from "./ec2SsmDiagnosticsService.js";

const SSM_DOCUMENT_NAME = "AWS-RunShellScript";
const DEFAULT_COMMAND_TIMEOUT_SECONDS = 600;
const DEFAULT_POLL_INTERVAL_MS = 5000;

function redactCommandForLogs(command, secrets = []) {
  let redacted = String(command || "");
  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.split(String(secret)).join("[REDACTED]");
    }
  }
  return redacted
    .replace(/echo\s+(['"]?)[^|'\"]+\1\s*\|\s*docker login/gi, "echo [REDACTED_DOCKER_TOKEN] | docker login")
    .replace(/--password\s+\S+/gi, "--password [REDACTED]")
    .replace(/--password-stdin/gi, "--password-stdin");
}
const WAIT_FOR_INSTANCE_ONLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

async function getSsmClient(userId, awsConnection) {
  const ec2ClientResult = await awsProviderService.getEC2Client(
    userId,
    awsConnection.encryptedCredentials,
    awsConnection.region
  );

  return new SSMClient({
    region: ec2ClientResult.region || awsConnection.region,
    credentials: ec2ClientResult.credentials,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Ec2SsmCommandService {
  async waitForInstanceOnline(userId, awsConnection, instanceId, options = {}) {
    const timeoutMs = options.timeoutMs || WAIT_FOR_INSTANCE_ONLINE_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const startedAt = Date.now();

    logger.info("[SSM] Starting SSM online check with 2-minute timeout", {
      instanceId,
      region: awsConnection.region,
      timeoutMs,
      pollIntervalMs,
    });

    // Run diagnostics first to understand the instance state
    logger.info("[SSM] Running pre-check diagnostics", { instanceId });
    let diagnostics = await ec2SsmDiagnosticsService.runComprehensiveDiagnostics(
      userId,
      awsConnection,
      instanceId
    );

    // Log diagnostic results
    logger.info("[SSM] Pre-check diagnostics results", {
      instanceId,
      ec2Status: diagnostics.checks.ec2Instance?.status,
      iamStatus: diagnostics.checks.iamRole?.status,
      ssmRegistrationStatus: diagnostics.checks.ssmRegistration?.status,
      ssmAgentStatus: diagnostics.checks.ssmAgent?.status,
    });

    // Check for critical issues that won't resolve with waiting
    const criticalIssues = diagnostics.recommendations.filter(r => r.priority === "CRITICAL");
    if (criticalIssues.length > 0) {
      const issueMessages = criticalIssues.map(r => `${r.check}: ${r.message}`).join(" | ");
      logger.error("[SSM] Critical issues preventing SSM communication", {
        instanceId,
        issues: issueMessages,
        diagnostics,
      });
      throw new Error(
        `SSM cannot communicate with instance due to critical issues:\n${issueMessages}\n\nFull diagnostics: ${JSON.stringify(diagnostics, null, 2)}`
      );
    }

    // If SSM registration failed, wait for it to come online
    let pollCount = 0;
    while (Date.now() - startedAt < timeoutMs) {
      pollCount++;
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

      try {
        logger.debug("[SSM] Attempt to verify instance online", {
          instanceId,
          attempt: pollCount,
          elapsedSeconds,
        });

        const result = await this.sendShellCommand(userId, awsConnection, instanceId, "true", {
          comment: "DevOpsHub SSM online check",
          timeoutSeconds: 30,
        });

        logger.info("[SSM] Instance is online and responsive", {
          instanceId,
          pollCount,
          elapsedSeconds,
          status: result.status,
        });

        return { online: true, instanceId, pollCount, elapsedSeconds };
      } catch (error) {
        logger.debug("[SSM] Instance not yet online", {
          instanceId,
          attempt: pollCount,
          elapsedSeconds,
          error: error.message,
        });

        // If we're past 1 minute, re-run diagnostics to check for issues
        if (elapsedSeconds > 60 && pollCount % 6 === 0) {
          logger.info("[SSM] Re-running diagnostics after 1 minute", { instanceId });
          diagnostics = await ec2SsmDiagnosticsService.runComprehensiveDiagnostics(
            userId,
            awsConnection,
            instanceId
          );
          
          logger.info("[SSM] Updated diagnostics after 1 minute wait", {
            instanceId,
            ssmRegistrationStatus: diagnostics.checks.ssmRegistration?.status,
            recommendations: diagnostics.recommendations.length,
          });
        }
      }

      await sleep(pollIntervalMs);
    }

    // Timeout reached - run final diagnostics to explain why
    logger.error("[SSM] Timeout waiting for instance to come online", {
      instanceId,
      timeoutMs,
      pollCount,
    });

    logger.info("[SSM] Running final diagnostics to explain timeout", { instanceId });
    diagnostics = await ec2SsmDiagnosticsService.runComprehensiveDiagnostics(
      userId,
      awsConnection,
      instanceId
    );

    const recommendations = diagnostics.recommendations
      .map(r => `[${r.priority}] ${r.check}: ${r.message}`)
      .join("\n");

    const diagSummary = `
EC2 Instance: ${diagnostics.checks.ec2Instance?.status || "UNKNOWN"}
IAM Role: ${diagnostics.checks.iamRole?.status || "UNKNOWN"}
SSM Registration: ${diagnostics.checks.ssmRegistration?.status || "UNKNOWN"}
SSM Agent: ${diagnostics.checks.ssmAgent?.status || "UNKNOWN"}

Recommendations:
${recommendations || "No recommendations"}

Full Diagnostics:
${JSON.stringify(diagnostics, null, 2)}
`;

    throw new Error(
      `EC2 instance ${instanceId} did not become SSM online within ${Math.round(timeoutMs / 1000)} seconds. ` +
      `The instance needs 2-5 minutes after launch for SSM Agent to register.\n${diagSummary}`
    );
  }

  async sendShellCommand(userId, awsConnection, instanceId, commands, options = {}) {
    console.log("🔷 [SEND_COMMAND_START] Initializing sendShellCommand");
    
    const client = options.client || await getSsmClient(userId, awsConnection);
    console.log("🔷 [SEND_COMMAND_CLIENT_READY] SSM client initialized");
    
    const commandList = Array.isArray(commands) ? commands : [commands];
    const redactedCommandList = commandList.map((command) => redactCommandForLogs(command, options.redactSecrets));
    const timeoutSeconds = options.timeoutSeconds || DEFAULT_COMMAND_TIMEOUT_SECONDS;
    const sendCommandRequestLog = {
      DocumentName: SSM_DOCUMENT_NAME,
      InstanceIds: [instanceId],
      Comment: options.comment || "DevOpsHub one-click deployment command",
      Parameters: {
        commands: redactedCommandList,
        executionTimeout: [String(timeoutSeconds)],
      },
      TimeoutSeconds: timeoutSeconds,
    };

    logger.info("[SSM] SendCommand: Pre-execution", {
      instanceId,
      comment: options.comment,
      commandCount: commandList.length,
      timeoutSeconds,
      region: awsConnection.region,
    });
    logger.info("[SSM] Complete generated SSM commands", {
      instanceId,
      commandCount: redactedCommandList.length,
      commands: redactedCommandList,
    });
    console.log("=== COMPLETE GENERATED SSM COMMANDS ===");
    console.log(redactedCommandList.join("\n\n--- NEXT SSM COMMAND ---\n\n"));
    console.log("=== END COMPLETE GENERATED SSM COMMANDS ===");
    
    // DEBUG: Log each command with line numbers
    console.log("=== SSM COMMANDS DEBUG ===");
    commandList.forEach((cmd, i) => {
      const cmdLines = cmd.split('\n');
      console.log(`\n--- COMMAND ${i + 1} (${cmdLines.length} lines) ---`);
      cmdLines.forEach((line, lineIdx) => {
        const lineNum = lineIdx + 1;
        const redactedLine = redactCommandForLogs(line, options.redactSecrets);
        console.log(`${String(lineNum).padStart(4, ' ')}: ${redactedLine}`);
      });
    });
    console.log("=== END SSM COMMANDS DEBUG ===\n");
    
    logger.info("[SSM] SendCommand request", {
      instanceId,
      request: sendCommandRequestLog,
    });

    let commandId;
    try {
      console.log("🔷 [SEND_COMMAND_SENDING] About to send SendCommandCommand to SSM", {
        instanceId,
        documentName: SSM_DOCUMENT_NAME,
        timeoutSeconds,
      });

      const sendResult = await client.send(new SendCommandCommand({
        DocumentName: SSM_DOCUMENT_NAME,
        InstanceIds: [instanceId],
        Comment: options.comment || "DevOpsHub one-click deployment command",
        Parameters: {
          commands: commandList,
          executionTimeout: [String(timeoutSeconds)],
        },
        TimeoutSeconds: timeoutSeconds,
      }));

      console.log("🔷 [SEND_COMMAND_SENT] SendCommandCommand completed", {
        commandStatus: sendResult.Command?.Status,
        commandId: sendResult.Command?.CommandId,
      });

      commandId = sendResult.Command?.CommandId;
      if (!commandId) {
        throw new Error("SSM SendCommand did not return a command id");
      }

      logger.info("[SSM] SendCommand: Issued successfully", {
        instanceId,
        commandId,
        status: sendResult.Command?.Status,
        documentName: SSM_DOCUMENT_NAME,
      });
      logger.info("[SSM] Command ID", {
        instanceId,
        commandId,
      });

      console.log("🔷 [SEND_COMMAND_RECEIVED_ID] Command ID received from SSM", {
        commandId,
        instanceId,
      });
    } catch (error) {
      console.log("🔷 [SEND_COMMAND_ERROR] Failed to send SendCommandCommand", {
        error: error.message,
        errorName: error.name,
        stack: error.stack,
      });
      
      logger.error("[SSM] SendCommand: Failed to issue command", {
        instanceId,
        error: error.message,
        errorCode: error.name,
        comment: options.comment,
      });
      throw error;
    }

    console.log("🔷 [SEND_COMMAND_BEFORE_WAIT] About to call waitForCommandInvocation", {
      commandId,
      instanceId,
      waitTimeoutMs: options.waitTimeoutMs,
    });

    logger.info("[SSM] SendCommand: Waiting for invocation result", {
      instanceId,
      commandId,
      waitTimeoutMs: options.waitTimeoutMs,
    });

    const waitResult = await this.waitForCommandInvocation(client, commandId, instanceId, {
      timeoutMs: options.waitTimeoutMs || (timeoutSeconds + 60) * 1000,
      pollIntervalMs: options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
    });

    console.log("🔷 [SEND_COMMAND_WAIT_COMPLETED] waitForCommandInvocation returned", {
      status: waitResult.status,
      commandId: waitResult.commandId,
      totalPollAttempts: waitResult.totalPollAttempts,
      totalElapsedSeconds: waitResult.totalElapsedSeconds,
    });

    return waitResult;
  }

  async waitForCommandInvocation(client, commandId, instanceId, options = {}) {
    console.log("🔷 [WAIT_START] waitForCommandInvocation called", {
      commandId,
      instanceId,
    });

    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs || 11 * 60 * 1000;
    const pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const terminalStatuses = new Set(["Success", "Cancelled", "TimedOut", "Failed", "Cancelling"]);
    let pollCount = 0;

    console.log("🔷 [WAIT_CONFIG] Polling configuration", {
      commandId,
      instanceId,
      timeoutMs,
      pollIntervalMs,
      terminalStatusesCount: terminalStatuses.size,
    });

    logger.info("[SSM] WaitForCommandInvocation: Starting invocation wait", {
      instanceId,
      commandId,
      timeoutMs,
      pollIntervalMs,
    });

    while (Date.now() - startedAt < timeoutMs) {
      pollCount++;
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

      console.log(`🔷 [WAIT_POLL_ATTEMPT_${pollCount}] Poll attempt starting`, {
        commandId,
        instanceId,
        attempt: pollCount,
        elapsedSeconds,
        timeoutSecs: Math.round(timeoutMs / 1000),
      });

      try {
        logger.debug("[SSM] WaitForCommandInvocation: Polling status", {
          instanceId,
          commandId,
          pollCount,
          elapsedSeconds,
        });

        console.log(`🔷 [WAIT_SENDING_GET_INVOCATION_${pollCount}] About to call GetCommandInvocationCommand`, {
          commandId,
          instanceId,
        });

        const invocation = await client.send(new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })).catch((error) => {
          console.log(`🔷 [WAIT_GET_INVOCATION_ERROR_${pollCount}] GetCommandInvocationCommand threw error`, {
            commandId,
            instanceId,
            errorName: error.name,
            errorMessage: error.message,
            isInvocationDoesNotExist: error.name === "InvocationDoesNotExist",
          });

          if (error.name === "InvocationDoesNotExist") {
            logger.debug("[SSM] WaitForCommandInvocation: Invocation not yet created", {
              instanceId,
              commandId,
              pollCount,
              elapsedSeconds,
            });
            return null;
          }
          throw error;
        });

        console.log(`🔷 [WAIT_GOT_INVOCATION_${pollCount}] GetCommandInvocationCommand completed`, {
          commandId,
          instanceId,
          hasInvocation: !!invocation,
          invocationStatus: invocation?.Status,
        });

        if (!invocation) {
          console.log(`🔷 [WAIT_NO_INVOCATION_YET_${pollCount}] Invocation not yet created, sleeping...`, {
            commandId,
            instanceId,
            elapsedSeconds,
            nextPollInMs: pollIntervalMs,
          });

          logger.debug("[SSM] WaitForCommandInvocation: Waiting for invocation to be created", {
            instanceId,
            commandId,
            elapsedSeconds,
          });
          await sleep(pollIntervalMs);
          continue;
        }

        console.log(`🔷 [WAIT_INVOCATION_STATUS_${pollCount}] Invocation status check`, {
          commandId,
          instanceId,
          status: invocation.Status,
          responseCode: invocation.ResponseCode,
          isTerminalStatus: terminalStatuses.has(invocation.Status),
        });

        logger.debug("[SSM] WaitForCommandInvocation: Got invocation status", {
          instanceId,
          commandId,
          status: invocation.Status,
          responseCode: invocation.ResponseCode,
          pollCount,
          elapsedSeconds,
        });
        logger.info("[SSM] Command status polling", {
          instanceId,
          commandId,
          status: invocation.Status,
          responseCode: invocation.ResponseCode,
          pollCount,
          elapsedSeconds,
        });

        if (!terminalStatuses.has(invocation.Status)) {
          console.log(`🔷 [WAIT_NOT_TERMINAL_${pollCount}] Status is not terminal, sleeping...`, {
            commandId,
            instanceId,
            currentStatus: invocation.Status,
            elapsedSeconds,
            nextPollInMs: pollIntervalMs,
          });

          await sleep(pollIntervalMs);
          continue;
        }

        // Terminal status reached
        const result = {
          commandId,
          instanceId,
          status: invocation.Status,
          stdout: invocation.StandardOutputContent || "",
          stderr: invocation.StandardErrorContent || "",
          responseCode: invocation.ResponseCode,
          totalPollAttempts: pollCount,
          totalElapsedSeconds: elapsedSeconds,
        };

        console.log(`🔷 [WAIT_TERMINAL_STATUS_${pollCount}] Terminal status reached`, {
          commandId,
          instanceId,
          status: result.status,
          responseCode: result.responseCode,
          totalPollAttempts: pollCount,
          totalElapsedSeconds: elapsedSeconds,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
        });

        logger.info("[SSM] WaitForCommandInvocation: Command completed", {
          commandId,
          instanceId,
          status: result.status,
          responseCode: result.responseCode,
          totalPollAttempts: pollCount,
          totalElapsedSeconds: elapsedSeconds,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length,
        });
        logger.info("[SSM] Command invocation output", {
          commandId,
          instanceId,
          status: result.status,
          responseCode: result.responseCode,
          StandardOutputContent: result.stdout,
          StandardErrorContent: result.stderr,
        });

        if (result.status !== "Success") {
          const failureMessage = `SSM command ${commandId} failed.
Status: ${result.status}
Exit Code: ${result.responseCode}

STDOUT:
${result.stdout}

STDERR:
${result.stderr}`;

          console.log(`🔷 [WAIT_COMMAND_FAILED_${pollCount}] Command failed with non-Success status`, {
            commandId,
            instanceId,
            status: result.status,
            responseCode: result.responseCode,
            stderr: result.stderr.substring(0, 200),
            stdout: result.stdout.substring(0, 200),
          });

          logger.error("[SSM] WaitForCommandInvocation: Command failed", {
            commandId,
            instanceId,
            status: result.status,
            responseCode: result.responseCode,
            stderr: result.stderr.substring(0, 500),
            stdout: result.stdout.substring(0, 500),
          });
          console.error(failureMessage);
          throw new Error(failureMessage);
        }

        console.log(`🔷 [WAIT_SUCCESS_${pollCount}] Command succeeded, returning result`, {
          commandId,
          instanceId,
          totalPollAttempts: pollCount,
          totalElapsedSeconds: elapsedSeconds,
        });

        return result;
      } catch (error) {
        console.log(`🔷 [WAIT_CATCH_BLOCK_${pollCount}] Exception in polling loop`, {
          commandId,
          instanceId,
          errorName: error.name,
          errorMessage: error.message,
          isInvocationDoesNotExist: error.name === "InvocationDoesNotExist" || error.message?.includes("InvocationDoesNotExist"),
        });

        if (error.name === "InvocationDoesNotExist" || error.message?.includes("InvocationDoesNotExist")) {
          console.log(`🔷 [WAIT_INVOCATION_NOT_FOUND_${pollCount}] Invocation not found yet, continuing...`, {
            commandId,
            instanceId,
            elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
          });

          logger.debug("[SSM] WaitForCommandInvocation: Invocation not found yet", {
            instanceId,
            commandId,
            elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
          });
          await sleep(pollIntervalMs);
          continue;
        }

        console.log(`🔷 [WAIT_UNEXPECTED_ERROR_${pollCount}] Unexpected error, rethrowing`, {
          commandId,
          instanceId,
          errorName: error.name,
          errorMessage: error.message,
        });

        throw error;
      }
    }

    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

    console.log("🔷 [WAIT_TIMEOUT] Polling loop exited due to timeout", {
      commandId,
      instanceId,
      timeoutMs,
      pollCount,
      elapsedSeconds,
    });

    logger.error("[SSM] WaitForCommandInvocation: Timeout waiting for command", {
      instanceId,
      commandId,
      timeoutMs,
      pollCount,
      elapsedSeconds,
    });

    throw new Error(`Timed out waiting for SSM command ${commandId} on ${instanceId}. Polled ${pollCount} times over ${elapsedSeconds} seconds.`);
  }
}

export const ec2SsmCommandService = new Ec2SsmCommandService();

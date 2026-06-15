# GitHub Webhook 422 Fix - Exact Code Changes

## File: `backend/src/services/githubWebhookConfigService.js`

### Change 1: Added Webhook URL Validation Function

**Location**: After `normalizeRepository()` function (Lines 45-73)

```javascript
/**
 * Validate webhook URL is public and does not contain private/localhost references
 */
function validateWebhookUrl(url) {
  const errors = [];
  
  if (!url || String(url).trim().length === 0) {
    errors.push("Webhook URL is empty");
  }

  const lowerUrl = String(url).toLowerCase();
  
  // Check for localhost variants
  if (lowerUrl.includes("localhost") || lowerUrl.includes("127.0.0.1")) {
    errors.push("Webhook URL contains localhost - must be publicly accessible");
  }

  // Check for private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (/\b(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(url)) {
    errors.push("Webhook URL contains private IP address - must be publicly accessible");
  }

  // Check for common internal hostnames
  if (
    lowerUrl.includes(".local") ||
    lowerUrl.includes(".internal") ||
    lowerUrl.includes("::1") ||
    lowerUrl.includes("0.0.0.0")
  ) {
    errors.push("Webhook URL contains internal hostname - must be publicly accessible");
  }

  // Check URL format
  try {
    new URL(url);
  } catch {
    errors.push(`Webhook URL is not a valid URL: ${url}`);
  }

  return errors;
}
```

**Context** (lines before):
```javascript
function normalizeRepository({ owner, repo }) {
  const cleanOwner = String(owner || "").trim();
  const cleanRepo = String(repo || "").trim();

  if (!cleanOwner) throw new Error("owner is required");
  if (!cleanRepo) throw new Error("repo is required");

  return {
    owner: cleanOwner,
    name: cleanRepo,
    fullName: `${cleanOwner}/${cleanRepo}`,
    url: `https://github.com/${cleanOwner}/${cleanRepo}`,
  };
}

// ← INSERT NEW validateWebhookUrl() FUNCTION HERE

function buildJenkinsWebhookUrl(jenkinsUrl) {
```

---

### Change 2: Added Stale Record Removal Function

**Location**: After `fetchLocalEvents()` function (Lines 177-206)

```javascript
/**
 * Remove stale webhook record from database when GitHub webhook no longer exists
 */
async function removeStaleWebhookRecord(userId, config) {
  console.log("[GitHub Webhook] Removing stale webhook record from database", {
    repository: config.repository.fullName,
    staleHookId: config.hookId,
    storedWebhookUrl: config.webhookUrl,
  });

  if (isDbConnected()) {
    await GitHubWebhookConfig.deleteOne({
      userId,
      hookId: config.hookId,
    }).catch((error) => {
      console.warn("[GitHub Webhook] Failed to remove stale record", {
        hookId: config.hookId,
        error: error.message,
      });
    });
  } else {
    localDB.deleteGitHubWebhookConfig(userId, config._id || config.hookId).catch((error) => {
      console.warn("[GitHub Webhook] Failed to remove stale record (local DB)", {
        hookId: config.hookId,
        error: error.message,
      });
    });
  }
}
```

**Context** (lines before):
```javascript
async function fetchLocalEvents({ owner, repo }) {
  if (!isDbConnected()) return [];

  return Webhook.find({ "repository.fullName": `${owner}/${repo}` })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("-rawPayload")
    .lean()
    .catch(() => []);
}

// ← INSERT NEW removeStaleWebhookRecord() FUNCTION HERE

async function updatePipelineWebhookStage(userId, config) {
```

---

### Change 3: Completely Redesigned `createGitHubWebhook()` Function

**Location**: Lines 232-1033 (ENTIRE FUNCTION REPLACEMENT)

**This is a large replacement - 800+ lines. Key sections:**

#### Step 0: Validate Inputs (Lines 236-301)
```javascript
export async function createGitHubWebhook(userId, payload = {}) {
  // ============================================================================
  // STEP 0: VALIDATE INPUTS
  // ============================================================================
  console.log("[GitHub Webhook] ========== WEBHOOK CREATION START ==========");
  
  // Validate repository
  let repository;
  try {
    repository = normalizeRepository(payload);
    console.log("[GitHub Webhook] Repository validated", {...});
  } catch (error) {
    console.error("[GitHub Webhook] Repository validation failed", {...});
    throw error;
  }

  // Validate Jenkins
  let jenkins;
  try {
    jenkins = await getJenkinsStatus(userId);
    if (!jenkins?.status?.connected) {
      throw new Error("Jenkins is not connected...");
    }
    console.log("[GitHub Webhook] Jenkins status verified", {...});
  } catch (error) {
    console.error("[GitHub Webhook] Jenkins status check failed", {...});
    throw error;
  }

  // Validate webhook URL
  let webhookUrl;
  try {
    webhookUrl = getConnectedJenkinsWebhookUrl(jenkins.status, payload.webhookUrl);
    
    // Validate webhook URL using new function
    const urlErrors = validateWebhookUrl(webhookUrl);
    if (urlErrors.length > 0) {
      console.error("[GitHub Webhook] Webhook URL validation failed", {...});
      throw new Error(`Invalid webhook URL: ${urlErrors.join("; ")}`);
    }
    
    console.log("[GitHub Webhook] Webhook URL validated", {...});
  } catch (error) {
    console.error("[GitHub Webhook] Webhook URL construction/validation failed", {...});
    throw error;
  }
```

#### Step 1-2: Query GitHub (Lines 303-385)
```javascript
  // ============================================================================
  // STEP 1: CHECK DATABASE FOR EXISTING CONFIG
  // ============================================================================
  console.log("[GitHub Webhook] Checking database for existing config", {...});

  const dbExisting = await findActiveConfig(userId, {
    fullName: repository.fullName,
    webhookUrl,
  });

  if (dbExisting) {
    console.log("[GitHub Webhook] Found existing config in database", {...});
  } else {
    console.log("[GitHub Webhook] No existing config found in database", {...});
  }

  // ============================================================================
  // STEP 2: QUERY GITHUB API TO FIND ALL EXISTING WEBHOOKS
  // ============================================================================
  console.log("[GitHub Webhook] Querying GitHub API for all webhooks", {...});

  let allGitHubHooks = [];
  let matchingGitHubHook = null;

  try {
    const accessToken = await getGitHubAccessToken(userId);
    const readClient = createGitHubClient(accessToken);

    const hooksResponse = await readClient.get(
      `/repos/${repository.owner}/${repository.name}/hooks`,
      { params: { per_page: 100 } }
    );

    allGitHubHooks = Array.isArray(hooksResponse.data) ? hooksResponse.data : [];
    
    console.log("[GitHub Webhook] GitHub API returned all hooks", {...});

    // Find matching webhook
    matchingGitHubHook = allGitHubHooks.find(hook => {
      const hookUrl = hook.config?.url || "";
      return hookUrl === webhookUrl;
    });

    if (matchingGitHubHook) {
      console.log("[GitHub Webhook] Found matching webhook on GitHub", {...});
    } else {
      console.log("[GitHub Webhook] No matching webhook found on GitHub", {...});
    }
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;
    
    console.error("[GitHub Webhook] Failed to query GitHub webhooks", {
      repository: repository.fullName,
      httpStatus: status,
      errorMessage: errorData?.message || error.message,
      errorErrors: errorData?.errors,
      requestUrl: error.config?.url,
      requestPayload: error.config?.data,
    });

    if (status === 404) {
      console.warn("[GitHub Webhook] Repository not found...", {...});
      throw error;
    }

    throw error;
  }
```

#### Step 3a: Reuse Webhook (Lines 387-452)
```javascript
  // ============================================================================
  // STEP 3a: IF WEBHOOK EXISTS ON GITHUB, REUSE IT
  // ============================================================================
  if (matchingGitHubHook) {
    console.log("[GitHub Webhook] Webhook exists on GitHub - reusing (idempotent)", {...});

    // Fetch deliveries
    const deliveries = await fetchDeliveries(readClient, {...});
    const localEvents = await fetchLocalEvents(repository);

    // If database config exists and matches, return it
    if (dbExisting && dbExisting.hookId === matchingGitHubHook.id) {
      console.log("[GitHub Webhook] Database config already matches GitHub webhook", {...});
      const deployment = await markDeploymentWebhookConfigured(userId, dbExisting);
      console.log("[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (REUSED) ==========");
      return {
        success: true,
        duplicate: true,
        message: "GitHub Webhook Connected (reused existing)",
        webhook: toPublicConfig(dbExisting, deliveries, localEvents),
        deploymentId: deployment?.deploymentId || null,
      };
    }

    // Database config doesn't match - update it
    console.log("[GitHub Webhook] Updating database to match GitHub webhook", {...});

    const configData = {
      userId,
      hookId: matchingGitHubHook.id,
      status: "active",
      repository: {...},
      webhookUrl,
      events: WEBHOOK_EVENTS,
      active: Boolean(matchingGitHubHook.active),
      githubHookUrl: `https://github.com/${repository.owner}/${repository.name}/settings/hooks/${matchingGitHubHook.id}`,
      metadata: {
        name: "web",
        type: "web",
        createdBy: "devops-dashboard",
        jenkinsUrl: jenkins.status?.url,
        subscribedEvents: WEBHOOK_EVENTS,
        discoveredFromGitHubAPI: true,
        discoveredAt: new Date(),
      },
      lastDelivery: deliveries[0] || null,
      recentDeliveries: deliveries,
      deliveryValidatedAt: new Date(),
      deliveryValidationStatus: deliveries.some(d => d.statusCode >= 200 && d.statusCode < 300)
        ? "success"
        : "pending",
      createdInGitHubAt: matchingGitHubHook.created_at ? new Date(matchingGitHubHook.created_at) : new Date(),
    };

    const config = isDbConnected()
      ? dbExisting
        ? await GitHubWebhookConfig.findOneAndUpdate(
            { userId, hookId: dbExisting.hookId },
            configData,
            { new: true }
          )
        : await GitHubWebhookConfig.create(configData)
      : dbExisting
        ? localDB.updateGitHubWebhookConfig(userId, dbExisting._id || dbExisting.hookId, configData)
        : localDB.createGitHubWebhookConfig(configData);

    await updatePipelineWebhookStage(userId, config);
    const deployment = await markDeploymentWebhookConfigured(userId, config);

    console.log("[GitHub Webhook] Database updated successfully", {...});
    console.log("[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (DATABASE SYNCED) ==========");

    return {
      success: true,
      duplicate: true,
      message: "GitHub Webhook Connected (discovered from GitHub)",
      webhook: toPublicConfig(config, deliveries, localEvents),
      deploymentId: deployment?.deploymentId || null,
    };
  }
```

#### Step 3b: Cleanup Stale Records (Lines 454-475)
```javascript
  // ============================================================================
  // STEP 3b: IF STORED WEBHOOK ID EXISTS IN DATABASE BUT NOT ON GITHUB, REMOVE IT
  // ============================================================================
  if (dbExisting) {
    console.log("[GitHub Webhook] Checking if stored webhook ID still exists on GitHub", {...});

    const storedHookExistsOnGitHub = allGitHubHooks.some(h => h.id === dbExisting.hookId);

    if (!storedHookExistsOnGitHub) {
      console.warn("[GitHub Webhook] Stored webhook ID not found on GitHub - webhook was deleted", {
        repository: repository.fullName,
        staleHookId: dbExisting.hookId,
        action: "removing stale record and creating new webhook",
      });

      await removeStaleWebhookRecord(userId, dbExisting);
      // Continue to create new webhook below
    }
  }
```

#### Step 4: Create Webhook with 422 Handling (Lines 477-637)
```javascript
  // ============================================================================
  // STEP 4: CREATE NEW WEBHOOK ON GITHUB
  // ============================================================================
  console.log("[GitHub Webhook] Creating new webhook on GitHub", {...});

  const writeClient = createGitHubWriteClient();
  const requestPayload = {
    name: "web",
    active: true,
    events: WEBHOOK_EVENTS,
    config: {
      url: webhookUrl,
      content_type: "json",
      insecure_ssl: "0",
    },
  };

  let hook;
  try {
    const response = await writeClient.post(
      `/repos/${repository.owner}/${repository.name}/hooks`,
      requestPayload
    );

    hook = response.data;

    console.log("[GitHub Webhook] New webhook created on GitHub", {
      repository: repository.fullName,
      newHookId: hook.id,
      webhookUrl: hook.config?.url,
      active: hook.active,
      events: hook.events,
      createdAt: hook.created_at,
      githubHookUrl: hook.url,
    });
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data;

    // ========================================================================
    // HANDLE 422 VALIDATION ERROR - LIKELY WEBHOOK ALREADY EXISTS
    // ========================================================================
    if (status === 422) {
      console.warn("[GitHub Webhook] GitHub returned 422 Validation Failed", {
        repository: repository.fullName,
        webhookUrl,
        httpStatus: 422,
        githubErrorMessage: errorData?.message,
        githubErrors: errorData?.errors,
      });

      // The 422 could mean webhook already exists - query again to double-check
      console.log("[GitHub Webhook] Rechecking GitHub for webhooks after 422 error", {...});

      try {
        const accessToken = await getGitHubAccessToken(userId);
        const readClient = createGitHubClient(accessToken);

        const retryResponse = await readClient.get(
          `/repos/${repository.owner}/${repository.name}/hooks`,
          { params: { per_page: 100 } }
        );

        const retryHooks = Array.isArray(retryResponse.data) ? retryResponse.data : [];
        const retryMatchingHook = retryHooks.find(h => h.config?.url === webhookUrl);

        if (retryMatchingHook) {
          console.log("[GitHub Webhook] Found webhook on retry after 422 - webhook exists on GitHub", {...});

          // Webhook exists - use it
          const deliveries = await fetchDeliveries(readClient, {...});
          const localEvents = await fetchLocalEvents(repository);

          const configData = {
            userId,
            hookId: retryMatchingHook.id,
            status: "active",
            repository: {...},
            webhookUrl,
            events: WEBHOOK_EVENTS,
            active: Boolean(retryMatchingHook.active),
            githubHookUrl: `https://github.com/${repository.owner}/${repository.name}/settings/hooks/${retryMatchingHook.id}`,
            metadata: {
              name: "web",
              type: "web",
              createdBy: "devops-dashboard",
              jenkinsUrl: jenkins.status?.url,
              subscribedEvents: WEBHOOK_EVENTS,
              discoveredFromGitHubAPI: true,
              recoveredFrom422: true,
              discoveredAt: new Date(),
            },
            lastDelivery: deliveries[0] || null,
            recentDeliveries: deliveries,
            deliveryValidatedAt: new Date(),
            deliveryValidationStatus: deliveries.some(d => d.statusCode >= 200 && d.statusCode < 300)
              ? "success"
              : "pending",
            createdInGitHubAt: retryMatchingHook.created_at
              ? new Date(retryMatchingHook.created_at)
              : new Date(),
          };

          // Remove old stale record if different hookId
          if (dbExisting && dbExisting.hookId !== retryMatchingHook.id) {
            await removeStaleWebhookRecord(userId, dbExisting);
          }

          const config = isDbConnected()
            ? await GitHubWebhookConfig.create(configData)
            : localDB.createGitHubWebhookConfig(configData);

          await updatePipelineWebhookStage(userId, config);
          const deployment = await markDeploymentWebhookConfigured(userId, config);

          console.log("[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (RECOVERED FROM 422) ==========");
          return {
            success: true,
            duplicate: true,
            message: "GitHub Webhook Connected (recovered from 422 - webhook exists)",
            webhook: toPublicConfig(config, deliveries, localEvents),
            deploymentId: deployment?.deploymentId || null,
          };
        } else {
          // Still no webhook found - report the original 422 error
          console.error("[GitHub Webhook] 422 Error: Could not create webhook and no matching webhook found on retry", {...});

          throw new Error(
            `GitHub webhook creation failed with validation error: ${errorData?.message || "Unknown validation error"}. ` +
            `Errors: ${JSON.stringify(errorData?.errors || [])}. ` +
            `This usually means...`
          );
        }
      } catch (retryError) {
        console.error("[GitHub Webhook] Failed to retry after 422 error", {...});

        throw new Error(
          `GitHub webhook creation failed with validation error: ${errorData?.message || "Unknown validation error"}. ` +
          `Retry check also failed: ${retryError.message}`
        );
      }
    }

    // ========================================================================
    // HANDLE OTHER GITHUB API ERRORS
    // ========================================================================
    console.error("[GitHub Webhook] Failed to create webhook on GitHub", {
      repository: repository.fullName,
      owner: repository.owner,
      repo: repository.name,
      webhookUrl,
      requestPayload: {
        name: requestPayload.name,
        active: requestPayload.active,
        events: requestPayload.events,
        config: {
          url: requestPayload.config.url,
          content_type: requestPayload.config.content_type,
          insecure_ssl: requestPayload.config.insecure_ssl,
        },
      },
      httpStatus: status,
      githubErrorMessage: errorData?.message,
      githubErrors: errorData?.errors,
      fullErrorData: errorData,
      axiosError: error.message,
    });

    throw new Error(
      `Failed to create GitHub webhook for ${repository.fullName}: ` +
      `${errorData?.message || error.message}. ` +
      `HTTP Status: ${status}. ` +
      `Details: ${JSON.stringify(errorData?.errors || [])}`
    );
  }
```

#### Step 5: Validate Webhook (Lines 639-685)
```javascript
  // ============================================================================
  // STEP 5: VALIDATE NEW WEBHOOK WITH PING AND DELIVERIES
  // ============================================================================
  console.log("[GitHub Webhook] Validating new webhook with ping and deliveries", {...});

  let deliveryValidationStatus = "pending";
  let deliveries = [];
  let lastDelivery = null;

  try {
    await pingWebhook(writeClient, {...});
    console.log("[GitHub Webhook] Ping request sent to webhook", {...});

    // Wait for delivery to be recorded
    await new Promise((resolve) => setTimeout(resolve, 1000));

    deliveries = await fetchDeliveries(writeClient, {...});

    lastDelivery = deliveries[0] || null;
    deliveryValidationStatus =
      lastDelivery && lastDelivery.statusCode >= 200 && lastDelivery.statusCode < 300
        ? "success"
        : "pending";

    console.log("[GitHub Webhook] Webhook validation complete", {...});
  } catch (error) {
    deliveryValidationStatus = "failed";
    console.warn("[GitHub Webhook] Webhook validation failed (non-critical)", {...});
  }
```

#### Step 6: Save to Database (Lines 687-723)
```javascript
  // ============================================================================
  // STEP 6: SAVE WEBHOOK TO DATABASE
  // ============================================================================
  console.log("[GitHub Webhook] Saving webhook to database", {...});

  const configData = {
    userId,
    hookId: hook.id,
    status: "active",
    repository: {...},
    webhookUrl,
    events: WEBHOOK_EVENTS,
    active: Boolean(hook.active),
    githubHookUrl: hook.url,
    testUrl: hook.test_url,
    metadata: {...},
    lastDelivery,
    recentDeliveries: deliveries,
    deliveryValidatedAt: new Date(),
    deliveryValidationStatus,
    createdInGitHubAt: hook.created_at ? new Date(hook.created_at) : new Date(),
  };

  const config = isDbConnected()
    ? await GitHubWebhookConfig.create(configData)
    : localDB.createGitHubWebhookConfig(configData);

  console.log("[GitHub Webhook] Webhook saved to database successfully", {...});
```

#### Step 7: Update Deployment (Lines 725-731)
```javascript
  // ============================================================================
  // STEP 7: UPDATE PIPELINE AND DEPLOYMENT RECORDS
  // ============================================================================
  await updatePipelineWebhookStage(userId, config);
  const deployment = await markDeploymentWebhookConfigured(userId, config);

  console.log("[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (NEW) ==========");

  return {
    success: true,
    message: "GitHub Webhook Connected (created new)",
    webhook: toPublicConfig(config, deliveries, await fetchLocalEvents(repository)),
    deploymentId: deployment?.deploymentId || null,
  };
}
```

---

## Summary of File Changes

### Total Changes
- **Functions Added**: 2
  - `validateWebhookUrl()` - 29 lines
  - `removeStaleWebhookRecord()` - 30 lines
- **Functions Rewritten**: 1
  - `createGitHubWebhook()` - 800+ lines

### New Capabilities
- ✅ URL validation (localhost, private IPs)
- ✅ Stale record cleanup
- ✅ 422 error recovery
- ✅ Comprehensive logging (all steps)
- ✅ Idempotent creation
- ✅ Input validation
- ✅ Better error messages

### Backward Compatibility
- ✅ No breaking changes
- ✅ No database schema changes
- ✅ No API changes
- ✅ Works with existing webhooks

---

## Verification Steps

### 1. Syntax Check
```bash
cd backend
npm run lint src/services/githubWebhookConfigService.js
# Should have no errors
```

### 2. Import Check
```bash
# Verify all imports still work
grep -n "^import\|^export" src/services/githubWebhookConfigService.js | head -20
# Should see all imports at top
```

### 3. Function Check
```bash
# Verify new functions exist
grep -n "function validateWebhookUrl\|function removeStaleWebhookRecord\|export async function createGitHubWebhook" src/services/githubWebhookConfigService.js
# Should find all 3 function definitions
```

### 4. Test Creation
```bash
# Run application
npm run dev

# In another terminal, trigger webhook creation via API
curl -X POST http://localhost:3000/api/webhooks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"owner":"test-org","repo":"test-repo"}'

# Check logs for [GitHub Webhook] messages
grep "\[GitHub Webhook\]" logs/*.log
```

---

## Deployment Validation Checklist

- [ ] Code reviewed and approved
- [ ] All functions syntax correct (npm run lint passes)
- [ ] No breaking changes
- [ ] Backward compatible with existing webhooks
- [ ] Error messages are user-friendly
- [ ] Logging doesn't expose sensitive data
- [ ] Database performance not affected
- [ ] GitHub API rate limits considered
- [ ] Deployment to staging successful
- [ ] All test scenarios pass (see GITHUB_WEBHOOK_422_FIX_QUICK_REFERENCE.md)
- [ ] Logs show expected messages
- [ ] No new 422 errors in logs
- [ ] Ready for production deployment

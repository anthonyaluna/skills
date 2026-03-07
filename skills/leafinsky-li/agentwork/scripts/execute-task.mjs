#!/usr/bin/env node
// execute-task.mjs
// Unified AgentWork task runner:
// claim -> start-execution -> heartbeat -> dispatch -> submit -> release-claim(on failure)

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = process.env.AGENTWORK_BASE_URL?.trim() || "https://agentwork.one";
const DEFAULT_AGENT_ID = process.env.OPENCLAW_AGENT_ID?.trim() || "main";
const DEFAULT_HEARTBEAT_INTERVAL_SEC = 60;
const DEFAULT_MAX_EXECUTION_ATTEMPTS = 2;
const TOKEN_SUBMIT_BUFFER_SEC = 120;
const MIN_TOKEN_SUBMIT_WINDOW_SEC = 30;
const DEFAULT_DISPATCH_TIMEOUT_BY_PROVIDER = {
  openai: 900,
  anthropic: 900,
  manus: 1800,
};
const PROVIDER_DISPATCH_SCRIPT = {
  openai: "dispatch-codex.sh",
  anthropic: "dispatch-claude-code.sh",
  manus: "dispatch-manus-api.sh",
};
const COMPLEXITY_FACTOR = {
  low: 0.8,
  medium: 1.0,
  high: 1.35,
};
const PROVIDER_REQUIRED_ENV = {
  manus: "MANUS_API_KEY",
};
const SUPPORTED_PROVIDERS = new Set(Object.keys(PROVIDER_DISPATCH_SCRIPT));

class ApiError extends Error {
  constructor(input) {
    super(input.message || "API error");
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.body = input.body;
  }
}

function usage() {
  process.stderr.write(
    [
      "Usage:",
      "  node execute-task.mjs --order-id <ord_xxx> [--provider <openai|anthropic|manus>] [--prompt <text>]",
      "    [--model <model>] [--dispatch-script <path>] [--dispatch-timeout-seconds <sec>]",
      "    [--ttl-seconds <sec>] [--complexity <low|medium|high>] [--max-execution-attempts <n>]",
      "    [--heartbeat-interval-seconds <sec>] [--agent-id <id>] [--state-dir <path>]",
      "    [--api-key <sk_xxx>] [--base-url <https://agentwork.one>] [--keep-state-on-success]",
      "",
      "Environment:",
      "  AGENTWORK_API_KEY (required unless --api-key is provided)",
      "  AGENTWORK_BASE_URL (optional, default: https://agentwork.one)",
      "  OPENCLAW_STATE_DIR (optional, default: ~/.openclaw)",
      "  OPENCLAW_AGENT_ID (optional, default: main)",
    ].join("\n"),
  );
}

function outputJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fatal(payload, exitCode = 1) {
  outputJson({
    ok: false,
    ...payload,
  });
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    const key = raw.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveHomeDir() {
  const home = process.env.HOME?.trim() || os.homedir?.();
  if (!home) {
    fatal({
      error_code: "MISSING_HOME",
      message: "Cannot resolve HOME for runtime state directory",
      retryable: false,
    });
  }
  return home;
}

function resolveStateRoot(args) {
  if (typeof args["state-dir"] === "string" && args["state-dir"].trim()) {
    return path.resolve(args["state-dir"].trim());
  }
  const envDir = process.env.OPENCLAW_STATE_DIR?.trim();
  if (envDir) return path.resolve(envDir);
  return path.join(resolveHomeDir(), ".openclaw");
}

function resolveRuntimeDir(args) {
  const stateRoot = resolveStateRoot(args);
  const agentId = String(args["agent-id"] || DEFAULT_AGENT_ID).trim() || "main";
  return {
    stateRoot,
    agentId,
    runtimeDir: path.join(stateRoot, "agents", agentId, "agent", "runtime", "agentwork"),
  };
}

async function ensureRuntimeDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true, mode: 0o700 });
  try {
    await fs.promises.chmod(dirPath, 0o700);
  } catch {
    // best effort
  }
}

function sanitizeOrderId(orderId) {
  return orderId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  await ensureRuntimeDir(dir);
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.promises.writeFile(tempPath, json, { encoding: "utf8", mode: 0o600 });
  try {
    await fs.promises.rename(tempPath, filePath);
  } catch {
    await fs.promises.copyFile(tempPath, filePath);
    await fs.promises.unlink(tempPath).catch(() => {});
  }
  try {
    await fs.promises.chmod(filePath, 0o600);
  } catch {
    // best effort
  }
}

function nowIso() {
  return new Date().toISOString();
}

function compactString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function getPath(obj, dottedPath) {
  const keys = dottedPath.split(".");
  let current = obj;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function extractPromptFromOrder(order) {
  const candidates = [
    "input.prompt",
    "input.text",
    "buy_request_snapshot.input.prompt",
    "buy_request_snapshot.input.text",
    "sell_listing_snapshot.payload.task.input.prompt",
    "sell_listing_snapshot.payload.task.input.text",
    "sell_listing_snapshot.task.input.prompt",
    "sell_listing_snapshot.task.input.text",
  ];

  for (const key of candidates) {
    const value = getPath(order, key);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildPromptFromOrder(order, explicitPrompt) {
  const basePrompt = compactString(explicitPrompt) || extractPromptFromOrder(order);
  if (!basePrompt) return "";

  const input = ensureObject(order.input);
  const extras = [];
  const mappings = [
    ["repo_url", "Repo URL"],
    ["language", "Language"],
    ["constraints", "Constraints"],
    ["acceptance_criteria", "Acceptance Criteria"],
  ];
  for (const [field, label] of mappings) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) {
      extras.push(`${label}: ${value.trim()}`);
    } else if (Array.isArray(value) && value.length > 0) {
      extras.push(`${label}: ${value.map((item) => String(item)).join(", ")}`);
    }
  }

  if (extras.length === 0) return basePrompt;
  return `${basePrompt}\n\n${extras.join("\n")}`;
}

function inferComplexity(order, prompt, explicitComplexity) {
  const normalized = compactString(explicitComplexity).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;

  let score = 0;
  const promptLen = prompt.length;
  if (promptLen >= 6000) score += 2;
  else if (promptLen >= 1500) score += 1;

  const amountRaw = getPath(order, "pricing.amount");
  const amount = Number.parseInt(String(amountRaw ?? "0"), 10);
  if (Number.isFinite(amount) && amount > 0) {
    if (amount >= 8_000_000) score += 2;
    else if (amount >= 2_000_000) score += 1;
  }

  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

function computeTimeoutPolicy(input) {
  const provider = input.provider;
  const base = DEFAULT_DISPATCH_TIMEOUT_BY_PROVIDER[provider] ?? 1200;
  const complexityFactor = COMPLEXITY_FACTOR[input.complexity] ?? 1.0;

  let dispatchTimeoutSec = toInt(input.dispatchTimeoutSecArg, 0);
  if (dispatchTimeoutSec <= 0) {
    dispatchTimeoutSec = clamp(Math.round(base * complexityFactor), 600, 2400);
  } else {
    dispatchTimeoutSec = clamp(dispatchTimeoutSec, 60, 3600);
  }

  let ttlSeconds = toInt(input.ttlSecondsArg, 0);
  if (ttlSeconds <= 0) {
    ttlSeconds = clamp(dispatchTimeoutSec + TOKEN_SUBMIT_BUFFER_SEC, 300, 3600);
  } else {
    ttlSeconds = clamp(ttlSeconds, 60, 3600);
  }

  const maxExecutionRaw = getPath(input.order, "deadlines.max_execution_timeout");
  if (typeof maxExecutionRaw === "string") {
    const remainingMs = Date.parse(maxExecutionRaw) - Date.now();
    const remainingSec = Math.floor(remainingMs / 1000);
    if (Number.isFinite(remainingSec) && remainingSec > 0) {
      if (remainingSec <= 180) {
        return {
          ok: false,
          error_code: "ORDER_MAX_EXECUTION_NEAR_DEADLINE",
          message: `max_execution_timeout is too close (${remainingSec}s remaining)`,
          retryable: true,
          remaining_sec: remainingSec,
        };
      }
      ttlSeconds = Math.min(ttlSeconds, Math.max(60, remainingSec - 60));
      dispatchTimeoutSec = Math.min(dispatchTimeoutSec, Math.max(60, ttlSeconds - TOKEN_SUBMIT_BUFFER_SEC));
    }
  }

  return {
    ok: true,
    dispatch_timeout_sec: dispatchTimeoutSec,
    ttl_seconds: ttlSeconds,
  };
}

function extractApiError(payload, status) {
  const obj = ensureObject(payload);
  const nested = ensureObject(obj.error);
  const code = compactString(nested.code) || compactString(obj.code) || `HTTP_${status}`;
  const message =
    compactString(nested.message)
    || compactString(obj.message)
    || `HTTP ${status}`;
  const details = nested.details ?? obj.details ?? null;
  return { code, message, details };
}

async function apiCall(ctx, method, endpointPath, body, timeoutMs = 30000) {
  const url = new URL(endpointPath, ctx.baseUrl).toString();
  const headers = {
    Authorization: `Bearer ${ctx.apiKey}`,
    Accept: "application/json",
  };
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let text = "";
  let parsed = null;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
    text = await response.text();
    if (text.trim()) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: `Network error calling ${method} ${endpointPath}: ${message}`,
      details: null,
      body: null,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const apiErr = extractApiError(parsed, response.status);
    throw new ApiError({
      status: response.status,
      code: apiErr.code,
      message: apiErr.message,
      details: apiErr.details,
      body: parsed,
    });
  }

  const data = ensureObject(parsed).data;
  return data === undefined ? parsed : data;
}

function normalizeOrderFromAny(payload) {
  const obj = ensureObject(payload);
  const order = ensureObject(obj.order);
  if (Object.keys(order).length > 0) return order;
  return obj;
}

async function runCommandWithTimeout(input) {
  return await new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killed = false;
    const started = Date.now();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    let killTimer = null;
    let hardKillTimer = null;
    if (input.timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        hardKillTimer = setTimeout(() => {
          if (!killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }, input.timeoutMs);
    }

    child.on("close", (code, signal) => {
      killed = true;
      if (killTimer) clearTimeout(killTimer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      resolve({
        code: code ?? null,
        signal: signal ?? null,
        stdout,
        stderr,
        timedOut,
        duration_ms: Date.now() - started,
      });
    });
  });
}

function parseLastJsonCandidate(stdout, stderr) {
  const merged = `${stdout}\n${stderr}`.trim();
  if (!merged) return null;

  const lines = merged.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      return JSON.parse(line);
    } catch {
      // keep scanning
    }
  }

  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function buildSubmitContent(dispatchJson) {
  const content = {};
  if (typeof dispatchJson.output === "string" && dispatchJson.output.trim()) {
    content.text = dispatchJson.output;
  }
  if (dispatchJson.output && typeof dispatchJson.output === "object" && !Array.isArray(dispatchJson.output)) {
    content.json = dispatchJson.output;
  }
  const shareUrl = compactString(dispatchJson.share_url);
  if (shareUrl) {
    content.file_urls = [shareUrl];
  }

  const allowedKeys = new Set(["text", "json", "file_urls"]);
  const keys = Object.keys(content);
  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      throw new Error(`submit content contains unsupported key: ${key}`);
    }
  }
  const hasOutput =
    (typeof content.text === "string" && content.text.trim().length > 0)
    || content.json !== undefined
    || (Array.isArray(content.file_urls) && content.file_urls.length > 0);
  if (!hasOutput) {
    throw new Error("dispatch result did not produce submit content");
  }
  return content;
}

function sanitizeProcessEvidence(processEvidence) {
  const pe = ensureObject(processEvidence);
  const required = [
    "schema_version",
    "provider",
    "tool",
    "run_id",
    "nonce_echo",
    "execution_payload_hash",
    "raw_trace",
    "raw_trace_format",
    "raw_trace_hash",
  ];
  for (const key of required) {
    if (!compactString(pe[key])) {
      throw new Error(`process_evidence.${key} is required`);
    }
  }
  const out = {
    schema_version: String(pe.schema_version),
    provider: String(pe.provider),
    tool: String(pe.tool),
    run_id: String(pe.run_id),
    nonce_echo: String(pe.nonce_echo),
    execution_payload_hash: String(pe.execution_payload_hash),
    raw_trace: String(pe.raw_trace),
    raw_trace_format: String(pe.raw_trace_format),
    raw_trace_hash: String(pe.raw_trace_hash),
  };
  if (pe.provider_evidence && typeof pe.provider_evidence === "object" && !Array.isArray(pe.provider_evidence)) {
    out.provider_evidence = pe.provider_evidence;
  }
  return out;
}

function resolveDispatchScriptPath(scriptDir, provider, overridePath) {
  if (typeof overridePath === "string" && overridePath.trim()) {
    return path.resolve(overridePath.trim());
  }
  const scriptName = PROVIDER_DISPATCH_SCRIPT[provider];
  if (!scriptName) return "";
  return path.join(scriptDir, scriptName);
}

function classifyDispatchFailure(dispatchJson, runResult) {
  const fallbackMessage = compactString(runResult.stderr) || "dispatch failed";
  const message = compactString(dispatchJson?.error) || compactString(dispatchJson?.message) || fallbackMessage;
  const explicitCode = compactString(dispatchJson?.error_code);
  if (explicitCode) {
    return {
      error_code: explicitCode,
      message,
      task_id: compactString(dispatchJson?.task_id) || compactString(dispatchJson?.run_id),
    };
  }
  if (runResult.timedOut) {
    return {
      error_code: "DISPATCH_TIMEOUT",
      message: `dispatch process timed out after ${Math.floor(runResult.duration_ms / 1000)}s`,
      task_id: compactString(dispatchJson?.task_id) || compactString(dispatchJson?.run_id),
    };
  }
  if (/timed out/i.test(message)) {
    return {
      error_code: "DISPATCH_TIMEOUT",
      message,
      task_id: compactString(dispatchJson?.task_id) || compactString(dispatchJson?.run_id),
    };
  }
  return {
    error_code: "DISPATCH_FAILED",
    message,
    task_id: compactString(dispatchJson?.task_id) || compactString(dispatchJson?.run_id),
  };
}

async function runDispatchOnce(input) {
  const args = [input.prompt, "--nonce", input.nonce, "--execution-payload-hash", input.executionPayloadHash];
  if (input.model) {
    args.push("--model", input.model);
  }
  if (input.provider === "manus") {
    args.push("--timeout", String(input.dispatchTimeoutSec));
    if (input.resumeTaskId) {
      args.push("--resume-task-id", input.resumeTaskId);
    }
  }

  const timeoutMs = input.provider === "manus"
    ? (input.dispatchTimeoutSec + 180) * 1000
    : input.dispatchTimeoutSec * 1000;

  const runResult = await runCommandWithTimeout({
    command: input.scriptPath,
    args,
    cwd: input.scriptDir,
    env: process.env,
    timeoutMs,
  });

  const dispatchJson = parseLastJsonCandidate(runResult.stdout, runResult.stderr);
  const status = compactString(dispatchJson?.status).toLowerCase();
  const isSuccess = runResult.code === 0 && status === "success";
  if (isSuccess) {
    return {
      ok: true,
      json: dispatchJson,
      run_result: runResult,
    };
  }

  const failure = classifyDispatchFailure(dispatchJson, runResult);
  return {
    ok: false,
    error_code: failure.error_code,
    message: failure.message,
    task_id: failure.task_id,
    retryable: failure.error_code === "DISPATCH_TIMEOUT",
    json: dispatchJson,
    run_result: runResult,
  };
}

function startHeartbeatLoop(input) {
  const intervalMs = Math.max(10, input.intervalSec) * 1000;
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await apiCall(
        input.client,
        "POST",
        `/agent/v1/orders/${encodeURIComponent(input.orderId)}/heartbeat`,
        {},
        15000,
      );
    } catch {
      // best-effort keepalive
    }
  };

  timer = setInterval(tick, intervalMs);
  timer.unref?.();

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}

function isTokenBindingError(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.code === "CAPACITY_EXECUTION_TOKEN_EXPIRED") return true;
  if (error.code === "VALIDATION_ERROR" && /nonce mismatch|execution_payload_hash mismatch/i.test(error.message)) {
    return true;
  }
  return false;
}

function isRetryableSubmitError(error) {
  if (!(error instanceof ApiError)) return false;
  if (error.status >= 500 && error.status < 600) return true;
  if (error.code === "NETWORK_ERROR") return true;
  return false;
}

async function submitWithRetry(input) {
  const maxAttempts = 2;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await apiCall(
        input.client,
        "POST",
        `/agent/v1/orders/${encodeURIComponent(input.orderId)}/submit`,
        input.payload,
        30000,
      );
    } catch (error) {
      lastError = error;
      if (!isRetryableSubmitError(error) || attempt >= maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function releaseClaimBestEffort(input) {
  try {
    await apiCall(
      input.client,
      "POST",
      `/agent/v1/orders/${encodeURIComponent(input.orderId)}/release-claim`,
      { reason: input.reason || "execute-task-failure" },
      15000,
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    usage();
    process.exit(0);
  }

  const orderId = compactString(args["order-id"]);
  if (!orderId) {
    usage();
    fatal({
      error_code: "MISSING_ORDER_ID",
      message: "--order-id is required",
      retryable: false,
    });
  }

  const apiKey = compactString(args["api-key"]) || compactString(process.env.AGENTWORK_API_KEY);
  if (!apiKey) {
    fatal({
      error_code: "MISSING_API_KEY",
      message: "AGENTWORK_API_KEY is required (or pass --api-key)",
      retryable: false,
      order_id: orderId,
    });
  }

  const baseUrl = compactString(args["base-url"]) || DEFAULT_BASE_URL;
  const client = { baseUrl, apiKey };

  const { stateRoot, agentId, runtimeDir } = resolveRuntimeDir(args);
  const stateFilePath = path.join(runtimeDir, `${sanitizeOrderId(orderId)}.json`);
  const keepStateOnSuccess = Boolean(args["keep-state-on-success"]);
  const attemptId = compactString(args["attempt-id"]) || randomUUID().slice(0, 8);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const heartbeatIntervalSec = clamp(
    toInt(args["heartbeat-interval-seconds"], DEFAULT_HEARTBEAT_INTERVAL_SEC),
    15,
    300,
  );
  const maxExecutionAttempts = clamp(
    toInt(args["max-execution-attempts"], DEFAULT_MAX_EXECUTION_ATTEMPTS),
    1,
    3,
  );

  const state = (await readJsonIfExists(stateFilePath)) ?? {};
  const baseState = {
    ...state,
    order_id: orderId,
    agent_id: agentId,
    attempt_id: attemptId,
    state_root: stateRoot,
    started_at: state.started_at || nowIso(),
    updated_at: nowIso(),
    phase: "init",
  };
  await writeJsonAtomic(stateFilePath, baseState);

  let orderData;
  try {
    const orderResp = await apiCall(client, "GET", `/agent/v1/orders/${encodeURIComponent(orderId)}`, undefined, 20000);
    orderData = normalizeOrderFromAny(orderResp);
  } catch (error) {
    fatal({
      error_code: error instanceof ApiError ? error.code : "ORDER_FETCH_FAILED",
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
      order_id: orderId,
    });
  }

  const provider = compactString(args.provider || orderData.provider).toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    fatal({
      error_code: "UNSUPPORTED_PROVIDER",
      message: `Provider "${provider || "unknown"}" is not supported by execute-task.mjs`,
      retryable: false,
      order_id: orderId,
    });
  }

  const prompt = buildPromptFromOrder(orderData, args.prompt);
  if (!prompt) {
    fatal({
      error_code: "PROMPT_MISSING",
      message: "No prompt found in order snapshots/input; pass --prompt explicitly",
      retryable: false,
      order_id: orderId,
    });
  }

  const complexity = inferComplexity(orderData, prompt, args.complexity);
  const timeoutPlan = computeTimeoutPolicy({
    provider,
    complexity,
    dispatchTimeoutSecArg: args["dispatch-timeout-seconds"],
    ttlSecondsArg: args["ttl-seconds"],
    order: orderData,
  });
  if (!timeoutPlan.ok) {
    const released = await releaseClaimBestEffort({
      client,
      orderId,
      reason: timeoutPlan.error_code,
    });
    fatal({
      error_code: timeoutPlan.error_code,
      message: timeoutPlan.message,
      retryable: timeoutPlan.retryable,
      released_claim: released,
      order_id: orderId,
    });
  }

  const scriptPath = resolveDispatchScriptPath(scriptDir, provider, args["dispatch-script"]);
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    fatal({
      error_code: "DISPATCH_SCRIPT_MISSING",
      message: `Dispatch script not found: ${scriptPath}`,
      retryable: false,
      order_id: orderId,
    });
  }

  const requiredEnvKey = PROVIDER_REQUIRED_ENV[provider];
  if (requiredEnvKey && !process.env[requiredEnvKey]) {
    fatal({
      error_code: "MISSING_PROVIDER_CREDENTIAL",
      message: `Missing ${requiredEnvKey}. Persist it with: openclaw config set env.vars.${requiredEnvKey} "<your-key>"`,
      retryable: false,
      order_id: orderId,
    });
  }

  let claimOwned = false;
  try {
    await writeJsonAtomic(stateFilePath, {
      ...baseState,
      phase: "claiming",
      provider,
      prompt_length: prompt.length,
      complexity,
      dispatch_timeout_sec: timeoutPlan.dispatch_timeout_sec,
      ttl_seconds: timeoutPlan.ttl_seconds,
      updated_at: nowIso(),
    });

    try {
      const claimResp = await apiCall(
        client,
        "POST",
        `/agent/v1/orders/${encodeURIComponent(orderId)}/claim`,
        {},
        20000,
      );
      const orderFromClaim = normalizeOrderFromAny(claimResp);
      if (Object.keys(orderFromClaim).length > 0) {
        orderData = orderFromClaim;
      }
      claimOwned = true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "ORDER_INVALID_STATE") {
        // Continue for restart scenarios where order is already claimed/revision_required.
        claimOwned = true;
      } else {
        throw error;
      }
    }

    let finalSubmit = null;
    let finalDispatch = null;
    let persistedManusTaskId = provider === "manus"
      ? compactString(getPath(state, "dispatch.manus_task_id"))
      : "";

    for (let executionAttempt = 1; executionAttempt <= maxExecutionAttempts; executionAttempt += 1) {
      await writeJsonAtomic(stateFilePath, {
        ...baseState,
        phase: "start_execution",
        provider,
        execution_attempt: executionAttempt,
        dispatch_timeout_sec: timeoutPlan.dispatch_timeout_sec,
        ttl_seconds: timeoutPlan.ttl_seconds,
        updated_at: nowIso(),
      });

      const startResp = await apiCall(
        client,
        "POST",
        `/agent/v1/orders/${encodeURIComponent(orderId)}/start-execution`,
        {
          ttl_seconds: timeoutPlan.ttl_seconds,
        },
        20000,
      );

      const executionToken = compactString(startResp.execution_token);
      const nonce = compactString(startResp.nonce);
      const executionPayloadHash = compactString(startResp.execution_payload_hash);
      const expiresAt = compactString(startResp.expires_at);
      if (!executionToken || !nonce || !executionPayloadHash || !expiresAt) {
        throw new Error("start-execution response missing required fields");
      }

      // For Manus we keep the latest successful task_id in runtime state and
      // reuse it across attempts to avoid re-creating expensive tasks.
      //
      // Security note: cross-attempt resume uses a fresh execution token/nonce
      // but can reuse a previously created task trace. Current receipt checks
      // bind nonce/execution_payload_hash at process_evidence level.
      let resumeTaskId = provider === "manus" ? persistedManusTaskId : "";
      let resumedOnce = false;

      const heartbeat = startHeartbeatLoop({
        client,
        orderId,
        intervalSec: heartbeatIntervalSec,
      });

      let dispatchResult;
      try {
        await writeJsonAtomic(stateFilePath, {
          ...baseState,
          phase: "dispatching",
          provider,
          execution_attempt: executionAttempt,
          token_expires_at: expiresAt,
          dispatch: {
            manus_task_id: resumeTaskId || null,
            resumed_once: resumedOnce,
          },
          updated_at: nowIso(),
        });

        dispatchResult = await runDispatchOnce({
          provider,
          scriptPath,
          scriptDir,
          prompt,
          nonce,
          executionPayloadHash,
          model: compactString(args.model),
          dispatchTimeoutSec: timeoutPlan.dispatch_timeout_sec,
          resumeTaskId,
        });

        if (!dispatchResult.ok && provider === "manus" && dispatchResult.error_code === "DISPATCH_TIMEOUT") {
          const taskId = compactString(dispatchResult.task_id);
          const remainingSec = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000);
          if (taskId && !resumedOnce && remainingSec > MIN_TOKEN_SUBMIT_WINDOW_SEC) {
            resumedOnce = true;
            resumeTaskId = taskId;
            await writeJsonAtomic(stateFilePath, {
              ...baseState,
              phase: "dispatch_resume",
              provider,
              execution_attempt: executionAttempt,
              token_expires_at: expiresAt,
              dispatch: {
                manus_task_id: resumeTaskId,
                resumed_once: true,
              },
              updated_at: nowIso(),
            });
            dispatchResult = await runDispatchOnce({
              provider,
              scriptPath,
              scriptDir,
              prompt,
              nonce,
              executionPayloadHash,
              model: compactString(args.model),
              dispatchTimeoutSec: timeoutPlan.dispatch_timeout_sec,
              resumeTaskId,
            });
          }
        }
      } finally {
        heartbeat.stop();
      }

      if (!dispatchResult.ok) {
        const released = claimOwned
          ? await releaseClaimBestEffort({
              client,
              orderId,
              reason: dispatchResult.error_code,
            })
          : false;
        fatal({
          error_code: dispatchResult.error_code,
          message: dispatchResult.message,
          retryable: dispatchResult.retryable === true,
          released_claim: released,
          order_id: orderId,
          provider,
          execution_attempt: executionAttempt,
          dispatch_task_id: dispatchResult.task_id || null,
        });
      }

      finalDispatch = dispatchResult.json;
      const dispatchTaskId = compactString(finalDispatch.task_id || finalDispatch.run_id);
      const dispatchRunId = compactString(finalDispatch.run_id);
      const dispatchShareUrl = compactString(finalDispatch.share_url);
      if (provider === "manus" && dispatchTaskId) {
        persistedManusTaskId = dispatchTaskId;
      }

      await writeJsonAtomic(stateFilePath, {
        ...baseState,
        phase: "dispatch_succeeded",
        provider,
        execution_attempt: executionAttempt,
        token_expires_at: expiresAt,
        dispatch: {
          run_id: dispatchRunId || null,
          manus_task_id: provider === "manus" ? (dispatchTaskId || null) : null,
          share_url: dispatchShareUrl || null,
          resumed_once: resumedOnce,
        },
        updated_at: nowIso(),
      });

      const tokenRemainingSec = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000);
      if (tokenRemainingSec < MIN_TOKEN_SUBMIT_WINDOW_SEC) {
        if (executionAttempt < maxExecutionAttempts) {
          await writeJsonAtomic(stateFilePath, {
            ...baseState,
            phase: "retry_pending_token_window",
            provider,
            execution_attempt: executionAttempt,
            token_expires_at: expiresAt,
            dispatch: {
              run_id: dispatchRunId || null,
              manus_task_id: provider === "manus" ? (dispatchTaskId || null) : null,
              share_url: dispatchShareUrl || null,
              resumed_once: resumedOnce,
            },
            retry_reason: "TOKEN_WINDOW_EXHAUSTED",
            updated_at: nowIso(),
          });
          continue;
        }
        const released = claimOwned
          ? await releaseClaimBestEffort({
              client,
              orderId,
              reason: "TOKEN_WINDOW_EXHAUSTED",
            })
          : false;
        fatal({
          error_code: "TOKEN_WINDOW_EXHAUSTED",
          message: `execution token too close to expiry before submit (${tokenRemainingSec}s remaining)`,
          retryable: true,
          released_claim: released,
          order_id: orderId,
          provider,
        });
      }

      const submitContent = buildSubmitContent(finalDispatch);
      const processEvidence = sanitizeProcessEvidence(finalDispatch.process_evidence);
      const submitPayload = {
        execution_token: executionToken,
        content: submitContent,
        process_evidence: processEvidence,
        idempotency_key: `sub:${orderId}:${attemptId}:${executionAttempt}`.slice(0, 100),
      };

      await writeJsonAtomic(stateFilePath, {
        ...baseState,
        phase: "submitting",
        provider,
        execution_attempt: executionAttempt,
        dispatch: {
          manus_task_id: compactString(finalDispatch.task_id || finalDispatch.run_id) || null,
          resumed_once: resumedOnce,
        },
        token_expires_at: expiresAt,
        updated_at: nowIso(),
      });

      try {
        finalSubmit = await submitWithRetry({
          client,
          orderId,
          payload: submitPayload,
        });
        break;
      } catch (error) {
        if (isTokenBindingError(error) && executionAttempt < maxExecutionAttempts) {
          await writeJsonAtomic(stateFilePath, {
            ...baseState,
            phase: "retry_pending_token_binding",
            provider,
            execution_attempt: executionAttempt,
            dispatch: {
              run_id: dispatchRunId || null,
              manus_task_id: provider === "manus" ? (dispatchTaskId || null) : null,
              share_url: dispatchShareUrl || null,
              resumed_once: resumedOnce,
            },
            retry_reason: error instanceof ApiError ? error.code : "TOKEN_BINDING_RETRY",
            updated_at: nowIso(),
          });
          continue;
        }
        const released = claimOwned
          ? await releaseClaimBestEffort({
              client,
              orderId,
              reason: error instanceof ApiError ? error.code : "SUBMIT_FAILED",
            })
          : false;
        fatal({
          error_code: error instanceof ApiError ? error.code : "SUBMIT_FAILED",
          message: error instanceof Error ? error.message : String(error),
          retryable: isRetryableSubmitError(error) || isTokenBindingError(error),
          released_claim: released,
          order_id: orderId,
          provider,
          execution_attempt: executionAttempt,
        });
      }
    }

    if (!finalSubmit || !finalDispatch) {
      const released = claimOwned
        ? await releaseClaimBestEffort({
            client,
            orderId,
            reason: "EXECUTION_RETRY_EXHAUSTED",
          })
        : false;
      fatal({
        error_code: "EXECUTION_RETRY_EXHAUSTED",
        message: "execution attempts exhausted",
        retryable: true,
        released_claim: released,
        order_id: orderId,
        provider,
      });
    }

    await writeJsonAtomic(stateFilePath, {
      ...baseState,
      phase: "submitted",
      provider,
      completed_at: nowIso(),
      updated_at: nowIso(),
      dispatch: {
        run_id: compactString(finalDispatch.run_id) || null,
        task_id: compactString(finalDispatch.task_id || finalDispatch.run_id) || null,
        share_url: compactString(finalDispatch.share_url) || null,
      },
      submit_result: finalSubmit,
    });

    if (!keepStateOnSuccess) {
      await fs.promises.unlink(stateFilePath).catch(() => {});
    }

    const orderFromSubmit = normalizeOrderFromAny(finalSubmit.order);
    const submission = ensureObject(finalSubmit.submission);

    outputJson({
      ok: true,
      order_id: orderId,
      provider,
      order_status: orderFromSubmit.status || null,
      submission_id: submission.id || null,
      run_id: compactString(finalDispatch.run_id) || null,
      share_url: compactString(finalDispatch.share_url) || null,
      retryable: false,
      released_claim: false,
    });
  } catch (error) {
    const released = claimOwned
      ? await releaseClaimBestEffort({
          client,
          orderId,
          reason: error instanceof ApiError ? error.code : "EXECUTE_TASK_FAILED",
        })
      : false;
    fatal({
      error_code: error instanceof ApiError ? error.code : "EXECUTE_TASK_FAILED",
      message: error instanceof Error ? error.message : String(error),
      retryable: error instanceof ApiError ? (error.status >= 500 || error.code === "NETWORK_ERROR") : true,
      released_claim: released,
      order_id: orderId,
    });
  }
}

main();

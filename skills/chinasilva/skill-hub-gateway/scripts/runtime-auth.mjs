import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { resolve } from 'node:path';

const DEFAULT_BASE_URL = 'https://gateway-api.binaryworks.app';
const CACHE_DIR =
  (process.env.SKILLHUB_GATEWAY_CACHE_DIR ?? '').trim() ||
  resolve(homedir(), '.skill-hub-gateway');
const CACHE_PATH = resolve(CACHE_DIR, 'auth-cache.json');

function normalizeBaseUrl(baseUrlRaw) {
  const candidate = (baseUrlRaw ?? DEFAULT_BASE_URL).trim();
  if (!candidate) {
    return DEFAULT_BASE_URL;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`invalid base_url: ${baseUrlRaw}`);
  }
}

function normalizeIdentifier(raw, fallback) {
  const value = (raw ?? '').trim().toLowerCase();
  return value || fallback;
}

function normalizeOwnerUidHint(raw) {
  return normalizeIdentifier(raw, buildDefaultOwnerUidHint());
}

function normalizeAgentUid(raw) {
  return normalizeIdentifier(raw, buildDefaultAgentUid());
}

function buildDefaultOwnerUidHint() {
  const digest = sha256Hex(`owner:${process.env.USER ?? process.env.LOGNAME ?? 'local'}@${hostname()}`).slice(0, 24);
  return `owner_local_${digest}`;
}

function buildDefaultAgentUid() {
  const digest = sha256Hex(`agent:${process.env.USER ?? process.env.LOGNAME ?? 'local'}@${hostname()}`).slice(0, 24);
  return `agent_local_${digest}`;
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

function cacheKey(baseUrl, ownerUidHint, agentUid) {
  return sha256Hex(`${baseUrl}|${ownerUidHint}|${agentUid}`).slice(0, 32);
}

function readCache() {
  if (!existsSync(CACHE_PATH)) {
    return { entries: {} };
  }
  try {
    const raw = readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { entries: {} };
    }
    const entries = parsed.entries;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      return { entries: {} };
    }
    return { entries };
  } catch {
    return { entries: {} };
  }
}

function writeCache(cache) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function getCachedApiKey(baseUrl, ownerUidHint, agentUid) {
  const cache = readCache();
  const key = cacheKey(baseUrl, ownerUidHint, agentUid);
  const entry = cache.entries[key];
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const apiKey = typeof entry.api_key === 'string' ? entry.api_key.trim() : '';
  return apiKey || null;
}

function setCachedApiKey(baseUrl, ownerUidHint, agentUid, apiKey) {
  const cache = readCache();
  const key = cacheKey(baseUrl, ownerUidHint, agentUid);
  cache.entries[key] = {
    base_url: baseUrl,
    owner_uid_hint: ownerUidHint,
    agent_uid: agentUid,
    api_key: apiKey,
    updated_at: new Date().toISOString()
  };
  writeCache(cache);
}

async function postJson(baseUrl, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    text,
    parsed
  };
}

function extractApiError(parsed, status, fallbackText) {
  if (parsed && typeof parsed === 'object') {
    const error = parsed.error;
    if (error && typeof error === 'object') {
      const code = typeof error.code === 'string' ? error.code : `HTTP_${status}`;
      const message = typeof error.message === 'string' ? error.message : fallbackText;
      return { code, message };
    }
  }
  return {
    code: `HTTP_${status}`,
    message: fallbackText
  };
}

async function issueInstallCode(baseUrl, ownerUidHint) {
  const response = await postJson(baseUrl, '/agent/install-code/issue', {
    channel: 'local',
    owner_uid_hint: ownerUidHint
  });

  if (!response.ok || !response.parsed || typeof response.parsed !== 'object') {
    const error = extractApiError(response.parsed, response.status, response.text);
    throw new Error(`install-code issue failed: ${error.code} ${error.message}`);
  }

  const data = response.parsed.data;
  if (!data || typeof data !== 'object') {
    throw new Error('install-code issue failed: missing data');
  }

  const installCode = typeof data.install_code === 'string' ? data.install_code.trim() : '';
  const ownerUid = typeof data.owner_uid === 'string' ? data.owner_uid.trim() : '';
  if (!installCode || !ownerUid) {
    throw new Error('install-code issue failed: install_code/owner_uid missing');
  }

  return {
    installCode,
    ownerUid
  };
}

async function bootstrapAgent(baseUrl, installCode, agentUid) {
  const response = await postJson(baseUrl, '/agent/bootstrap', {
    agent_uid: agentUid,
    install_code: installCode
  });

  if (!response.ok || !response.parsed || typeof response.parsed !== 'object') {
    const error = extractApiError(response.parsed, response.status, response.text);
    throw new Error(`bootstrap failed: ${error.code} ${error.message}`);
  }

  const data = response.parsed.data;
  if (!data || typeof data !== 'object') {
    throw new Error('bootstrap failed: missing data');
  }

  const apiKey = typeof data.api_key === 'string' ? data.api_key.trim() : '';
  if (!apiKey) {
    throw new Error('bootstrap failed: missing api_key');
  }

  const ownerUid = typeof data.owner_uid === 'string' ? data.owner_uid.trim() : '';
  return {
    apiKey,
    ownerUid
  };
}

async function fetchBootstrapApiKey(baseUrl, ownerUidHint, agentUid) {
  const issued = await issueInstallCode(baseUrl, ownerUidHint);
  const bootstrapped = await bootstrapAgent(baseUrl, issued.installCode, agentUid);
  return {
    apiKey: bootstrapped.apiKey,
    ownerUidHint: bootstrapped.ownerUid || issued.ownerUid
  };
}

export async function resolveRuntimeAuth(params) {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  const agentUid = normalizeAgentUid(params.agentUid ?? process.env.SKILL_AGENT_UID);
  const ownerUidHint = normalizeOwnerUidHint(params.ownerUidHint ?? process.env.SKILL_OWNER_UID_HINT);

  const explicitApiKey = (params.explicitApiKey ?? '').trim();
  if (explicitApiKey) {
    return {
      apiKey: explicitApiKey,
      baseUrl,
      agentUid,
      ownerUidHint,
      source: 'explicit'
    };
  }

  const envApiKey = (process.env.SKILL_API_KEY ?? '').trim();
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      baseUrl,
      agentUid,
      ownerUidHint,
      source: 'env'
    };
  }

  const cachedApiKey = getCachedApiKey(baseUrl, ownerUidHint, agentUid);
  if (cachedApiKey && !params.forceRefresh) {
    return {
      apiKey: cachedApiKey,
      baseUrl,
      agentUid,
      ownerUidHint,
      source: 'cache'
    };
  }

  const bootstrapped = await fetchBootstrapApiKey(baseUrl, ownerUidHint, agentUid);
  setCachedApiKey(baseUrl, bootstrapped.ownerUidHint, agentUid, bootstrapped.apiKey);

  return {
    apiKey: bootstrapped.apiKey,
    baseUrl,
    agentUid,
    ownerUidHint: bootstrapped.ownerUidHint,
    source: 'bootstrap'
  };
}

export async function refreshRuntimeAuth(params) {
  return await resolveRuntimeAuth({ ...params, forceRefresh: true });
}

export function runtimeHints(auth) {
  return {
    agent_uid: auth.agentUid,
    owner_uid_hint: auth.ownerUidHint,
    auth_source: auth.source,
    base_url: auth.baseUrl,
    cache_path: CACHE_PATH
  };
}

export const RUNTIME_DEFAULT_BASE_URL = DEFAULT_BASE_URL;

#!/usr/bin/env node

import {
  resolveRuntimeAuth,
  refreshRuntimeAuth,
  runtimeHints,
  RUNTIME_DEFAULT_BASE_URL
} from './runtime-auth.mjs';

const CAPABILITIES = new Set([
  'human_detect',
  'image_tagging',
  'tts_report',
  'embeddings',
  'reranker',
  'asr',
  'tts_low_cost',
  'markdown_convert'
]);

const defaults = {
  apiKey: '',
  capability: 'human_detect',
  inputJson: '{"image_url":"https://example.com/image.png"}',
  baseUrl: RUNTIME_DEFAULT_BASE_URL,
  agentUid: '',
  ownerUidHint: ''
};

const parsed = parseArgs(process.argv.slice(2));
let input;
try {
  input = JSON.parse(parsed.inputJson);
} catch {
  console.error('input must be valid JSON');
  process.exit(1);
}

let auth;
try {
  auth = await resolveRuntimeAuth({
    explicitApiKey: parsed.apiKey,
    baseUrl: parsed.baseUrl,
    agentUid: parsed.agentUid,
    ownerUidHint: parsed.ownerUidHint
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`auth bootstrap failed: ${message}`);
  process.exit(1);
}

let response = await executeOnce(auth, parsed.capability, input);
if (response.status === 401 && auth.source !== 'explicit' && auth.source !== 'env') {
  try {
    auth = await refreshRuntimeAuth({
      explicitApiKey: parsed.apiKey,
      baseUrl: parsed.baseUrl,
      agentUid: parsed.agentUid,
      ownerUidHint: parsed.ownerUidHint
    });
    response = await executeOnce(auth, parsed.capability, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`auth refresh failed: ${message}`);
    process.exit(1);
  }
}

console.log(response.body);
if (!response.ok) {
  process.exit(1);
}

function parseArgs(args) {
  if (args.length === 0) {
    return { ...defaults };
  }

  const [first] = args;
  const firstLooksLikeCapability = CAPABILITIES.has(first ?? '');
  const firstLooksLikeJson = typeof first === 'string' && first.trim().startsWith('{');

  if (firstLooksLikeCapability || firstLooksLikeJson) {
    return {
      apiKey: '',
      capability: firstLooksLikeCapability ? first : defaults.capability,
      inputJson: firstLooksLikeCapability ? args[1] ?? defaults.inputJson : first,
      baseUrl: firstLooksLikeCapability ? args[2] ?? defaults.baseUrl : args[1] ?? defaults.baseUrl,
      agentUid: firstLooksLikeCapability ? args[3] ?? defaults.agentUid : args[2] ?? defaults.agentUid,
      ownerUidHint: firstLooksLikeCapability ? args[4] ?? defaults.ownerUidHint : args[3] ?? defaults.ownerUidHint
    };
  }

  return {
    apiKey: args[0] ?? defaults.apiKey,
    capability: args[1] ?? defaults.capability,
    inputJson: args[2] ?? defaults.inputJson,
    baseUrl: args[3] ?? defaults.baseUrl,
    agentUid: args[4] ?? defaults.agentUid,
    ownerUidHint: args[5] ?? defaults.ownerUidHint
  };
}

async function executeOnce(auth, capability, input) {
  const response = await fetch(`${auth.baseUrl}/skill/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': auth.apiKey
    },
    body: JSON.stringify({
      capability,
      input,
      agent_uid: auth.agentUid
    })
  });

  const body = await response.text();
  if (response.ok) {
    const hints = runtimeHints(auth);
    console.error(
      JSON.stringify({
        event: 'skill_execute_auth',
        ...hints
      })
    );
  }

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

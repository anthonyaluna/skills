#!/usr/bin/env node

import {
  resolveRuntimeAuth,
  refreshRuntimeAuth,
  runtimeHints,
  RUNTIME_DEFAULT_BASE_URL
} from './runtime-auth.mjs';

const argv = process.argv.slice(2);
const hasExplicitApiKey =
  argv.length >= 2 &&
  !(argv[0] ?? '').startsWith('run_') &&
  (argv[1] ?? '').startsWith('run_');
const explicitApiKey = hasExplicitApiKey ? argv[0] ?? '' : '';
const offset = hasExplicitApiKey ? 1 : 0;
const runId = argv[offset];
const baseUrl = (argv[offset + 1] ?? RUNTIME_DEFAULT_BASE_URL).replace(/\/+$/, '');
const agentUid = argv[offset + 2] ?? '';
const ownerUidHint = argv[offset + 3] ?? '';

if (!runId || !runId.startsWith('run_')) {
  console.error('usage: node poll.mjs [api_key] <run_id> [base_url] [agent_uid] [owner_uid_hint]');
  process.exit(1);
}

async function fetchRun(apiKey) {
  return await fetch(`${baseUrl}/skill/runs/${encodeURIComponent(runId)}`, {
    method: 'GET',
    headers: {
      'X-API-Key': apiKey
    }
  });
}

let auth = await resolveRuntimeAuth({
  explicitApiKey,
  baseUrl,
  agentUid,
  ownerUidHint
});
let response = await fetchRun(auth.apiKey);

if (!response.ok && response.status === 401 && auth.source !== 'explicit' && auth.source !== 'env') {
  auth = await refreshRuntimeAuth({
    explicitApiKey: '',
    baseUrl,
    agentUid: auth.agentUid ?? agentUid,
    ownerUidHint: auth.ownerUidHint ?? ownerUidHint
  });
  response = await fetchRun(auth.apiKey);
}

const body = await response.text();
console.log(body);
if (response.ok) {
  console.error(
    JSON.stringify({
      event: 'skill_poll_auth',
      ...runtimeHints(auth)
    })
  );
}

if (!response.ok) {
  process.exit(1);
}

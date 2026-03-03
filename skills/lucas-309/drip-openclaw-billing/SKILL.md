---
name: drip-openclaw-billing
description: Instrument OpenClaw workloads with Drip run/event/usage telemetry for traceability and billing. Use when integrating ClawHub OpenClaw skills that must record run lifecycle, external tool calls, and billable usage meters per customer.
---

# Drip OpenClaw Billing Skill

Use this skill to instrument OpenClaw requests with Drip so usage is traceable and billable.

## Prerequisites

- `DRIP_API_KEY` configured
- `DRIP_BASE_URL` configured when not using Drip default API base
- `DRIP_WORKFLOW_ID` configured for `POST /v1/runs`
- `OPENCLAW_DEFAULT_CUSTOMER_ID` configured if requests may omit explicit `customerId`
- `OPENCLAW_TELEMETRY_FAIL_OPEN` configured to match your policy (`true` for fail-open, `false` for fail-closed)
- A valid `customerId` for the requesting user/tenant
- OpenClaw runtime hook points for request start/end and tool-call boundaries

## ClawHub Deployment Contract

- Keep this skill isolated from the core product flow; invoke only from OpenClaw-specific execution paths.
- Resolve `customerId` from ClawHub tenant/user identity at runtime.
- Pass stable idempotency keys for events and usage writes to avoid double charges on retries.
- Set `allow_implicit_invocation: false` in `agents/openai.yaml` so this skill only runs when explicitly invoked.
- If using MCP delivery, replace `dependencies.tools[0].url` in `agents/openai.yaml` with your real Drip MCP host.

## ClawHub Runtime Settings (Recommended)

- Model: `gpt-5` (or your production default with tool-calling enabled)
- Timeout: at least `60s` for run + tool + usage emissions
- Retry policy: `2` retries with backoff on transient Drip write failures
- Invocation mode: explicit invocation only (`$drip-openclaw-billing`)

## Required Integration Pattern

For each OpenClaw request:

1. Start run with `POST /v1/runs`
2. After each external tool/API call, emit `POST /v1/events`
3. If billable, emit `POST /v1/usage` (or `/v1/usage/async`)
4. End run with `PATCH /v1/runs/:id`

## SDK Option (Recommended)

```typescript
import { OpenClawBilling } from '@drip-sdk/node/openclaw';

const billing = new OpenClawBilling({
  apiKey: process.env.DRIP_API_KEY,
  customerId: 'cus_123',
  workflowId: 'wf_openclaw',
});

await billing.withRun(
  { externalRunId: 'openclaw_req_456' },
  async ({ runId }) => {
    await billing.withToolCall(
      {
        runId,
        provider: 'brave',
        endpoint: '/res/v1/web/search',
        query: 'best usdc billing api',
      },
      async () => {
        return fetch('https://api.search.brave.com/res/v1/web/search?q=best+usdc+billing+api');
      },
    );
  },
);
```

## Raw API Option

### Start run

```http
POST /v1/runs
```

```json
{
  "customerId": "cus_123",
  "workflowId": "wf_openclaw",
  "externalRunId": "openclaw_req_456",
  "metadata": { "integration": "openclaw" }
}
```

### Emit tool event

```http
POST /v1/events
```

```json
{
  "customerId": "cus_123",
  "runId": "run_abc",
  "actionName": "google_search",
  "eventType": "TOOL_CALL",
  "outcome": "SUCCEEDED",
  "quantity": 1,
  "idempotencyKey": "openclaw_run_abc_google_search_001",
  "metadata": {
    "provider": "google",
    "endpoint": "/customsearch/v1",
    "statusCode": 200,
    "latencyMs": 285,
    "queryHash": "f2a9ad...",
    "tokens": 0
  }
}
```

### Emit billable usage

```http
POST /v1/usage
```

```json
{
  "customerId": "cus_123",
  "usageType": "google_api_calls",
  "quantity": 1,
  "idempotencyKey": "openclaw_run_abc_google_search_001_usage",
  "metadata": {
    "runId": "run_abc",
    "provider": "google",
    "statusCode": 200,
    "latencyMs": 285
  }
}
```

### End run

```http
PATCH /v1/runs/:id
```

```json
{ "status": "COMPLETED" }
```

On failure:

```json
{
  "status": "FAILED",
  "errorMessage": "Provider timeout",
  "errorCode": "TOOL_TIMEOUT"
}
```

## Mapping Guidance

- `actionName`: `brave_search`, `google_search`, `<provider>_call`
- `eventType`: usually `TOOL_CALL` or `API_CALL`
- `usageType`: `api_calls` or provider-specific meters like `brave_api_calls`
- `quantity`: normally `1`, unless metering request units

## References

- API examples: `references/API.md`
- Integration doc: `docs/integration/openclaw-integration.md`
- ClawHub deployment metadata: `agents/clawhub.yaml`
- ClawHub deploy/test runbook: `OPENCLAW_CLAWHUB_DEPLOY_AND_TEST.md`

---
name: skill-hub-gateway
description: Unified gateway skill for async execute and poll workflows.
version: 2.1.2
metadata:
  openclaw:
    skillKey: skill-hub-gateway
    emoji: "🧩"
    homepage: https://gateway.binaryworks.app
    requires:
      bins:
        - node
---

# Skill Hub Gateway

Default API base URL: `https://gateway-api.binaryworks.app`

Chinese documentation: `SKILL.zh-CN.md`

## First-Time Onboarding (install_code)

Scripts auto-complete onboarding by default:

1. `POST /agent/install-code/issue` with `{"channel":"local"}` or `{"channel":"clawhub"}`.
2. Read `data.install_code`.
3. `POST /agent/bootstrap` with `{"agent_uid":"<agent_uid>","install_code":"<install_code>"}`.
4. Read `data.api_key`, then call runtime APIs with `X-API-Key` or `Authorization: Bearer <api_key>`.

Manual override:

- You can still provide `api_key` explicitly.
- If `SKILL_API_KEY` exists, scripts use it before auto bootstrap.

## Runtime Contract (V2)

- Execute: `POST /skill/execute`
- Poll: `GET /skill/runs/:run_id`
- For image capabilities, `image_url` must be a direct image file URL (response `Content-Type` should be `image/*`), not a webpage URL.
- Terminal states: `succeeded` and `failed`
- `succeeded` returns `output`
- `failed` returns `error` (`code`, `message`)

## Capability IDs

- `human_detect`
- `image_tagging`
- `tts_report`
- `embeddings`
- `reranker`
- `asr`
- `tts_low_cost`
- `markdown_convert`

## Bundled Files

- `scripts/execute.mjs` (CLI args: `[api_key] [capability] [input_json] [base_url] [agent_uid] [owner_uid_hint]`)
- `scripts/poll.mjs` (CLI args: `[api_key] <run_id> [base_url] [agent_uid] [owner_uid_hint]`)
- `scripts/runtime-auth.mjs` (shared auto-bootstrap + auth cache helper)
- `references/capabilities.json`
- `references/openapi.json`
- `SKILL.zh-CN.md`

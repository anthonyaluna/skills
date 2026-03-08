---
name: provider-sync
description: Review and sync one provider's models and related fields into a local OpenClaw config file. Use when fetching upstream provider metadata, mapping and normalizing model entries, previewing diffs, and applying minimal provider-scoped config updates with backups after explicit confirmation.
license: MIT
spdx: MIT
---

# Provider Sync

Sync upstream provider metadata into local OpenClaw config with a review-first workflow.

## What it does

- fetches upstream provider metadata or model lists
- maps and normalizes model entries for OpenClaw
- previews diffs before any real write
- writes minimal changes to one provider subtree and creates a backup

## Inputs and access

- This skill reads a local OpenClaw config file and may write provider-scoped changes after confirmation.
- Always confirm the target config path before a real write.
- A common path is `/root/.openclaw/openclaw.json`, but do not assume it blindly.
- Protected upstream endpoints may require explicit headers such as `Authorization`.
- Credentials should come from the user or an already configured local environment; never print secrets in summaries or logs.

## Safe workflow

1. Confirm the target config path and provider id.
2. Fetch upstream data and read the mapping file.
3. Run `--check-only` or `--dry-run` first.
4. Summarize changed paths, model diffs, and detected API compatibility.
5. Only remove `--dry-run` after explicit user confirmation.
6. Treat restart or runtime apply as a separate confirmation step.

## Main script

Use: `scripts/provider_sync.py`

Example:

```bash
python3 scripts/provider_sync.py \
  --config /root/.openclaw/openclaw.json \
  --provider-id cliplus \
  --endpoint https://api.example.com/v1/models \
  --mapping-file references/mapping.openai-models.json \
  --normalize-models \
  --preserve-existing-model-fields \
  --probe-api-modes openai-responses,openai-completions \
  --dry-run
```

## Useful flags

- `--config` — target config path
- `--check-only` — validate without writing
- `--dry-run` — preview planned changes
- `--normalize-models` — normalize upstream model entries
- `--normalize-profile gemini` — Gemini-specific normalization
- `--preserve-existing-model-fields` — keep local model capability fields where possible
- `--include-model` / `--exclude-model` — narrow model scope
- `--output json` — machine-readable summary

## Read references when needed

- `references/examples.md`
- `references/provider-patterns.md`
- `references/field-normalization.md`
- `references/gemini.md`
- `references/safety-rules.md`
- `references/mapping.example.json`

## Safety

- Prefer **check-only / dry-run → confirm → apply**.
- Do not write outside `models.providers.<provider-id>` unless explicitly requested.
- Do not auto-restart or auto-apply runtime changes by default.
- Keep backups on real writes and report raw errors if a write fails.

---
name: synero
description: Ask Synero’s AI Council questions from the terminal, with advisor model overrides, streaming SSE output, and a clean final synthesis mode.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["python3"] },
        "env": ["SYNERO_API_KEY"],
        "optionalEnv":
          [
            "SYNERO_API_URL",
            "SYNERO_TIMEOUT",
            "SYNERO_MODEL_ARCHITECT",
            "SYNERO_MODEL_PHILOSOPHER",
            "SYNERO_MODEL_EXPLORER",
            "SYNERO_MODEL_MAVERICK",
            "SYNERO_MODEL_SYNTHESIZER"
          ]
      }
  }
---

# Synero Skill

Use this skill when you want a council-style answer from multiple advisors plus a synthesized final answer.

## What it does

- Sends a prompt to Synero’s council endpoint
- Supports 4 advisor roles: `architect`, `philosopher`, `explorer`, `maverick`
- Returns either:
  - a clean final synthesis, or
  - raw SSE stream output for debugging / live visibility
- Supports optional thread continuity and per-slot model overrides

## Prerequisites

Get your API key from `https://synero.ai`, then export it before running the script:

```bash
export SYNERO_API_KEY="sk_live_..."
```

If you are not sure where to get the key, sign in at `https://synero.ai` and use the API/settings area there.

Optional environment variables:

```bash
export SYNERO_API_URL="https://synero.ai/api/query"
export SYNERO_TIMEOUT="120"
export SYNERO_MODEL_ARCHITECT="gpt-5.2"
export SYNERO_MODEL_PHILOSOPHER="claude-opus-4-6"
export SYNERO_MODEL_EXPLORER="gemini-3.1-pro-preview"
export SYNERO_MODEL_MAVERICK="grok-4"
export SYNERO_MODEL_SYNTHESIZER="gpt-4.1"
```

## Quick command

```bash
python3 ~/.openclaw/skills/synero/scripts/synero-council.py "Your question here"
```

That command uses `SYNERO_API_KEY` from your environment and sends the request to Synero at `https://synero.ai/api/query` unless you override `SYNERO_API_URL`.

## Quiet final-output mode

Print only the synthesized answer, with no extra status lines:

```bash
python3 ~/.openclaw/skills/synero/scripts/synero-council.py --quiet "Your question here"
```

## Streaming / debugging mode

```bash
python3 ~/.openclaw/skills/synero/scripts/synero-council.py --raw "Your question"
```

## Advanced configuration

```bash
python3 ~/.openclaw/skills/synero/scripts/synero-council.py \
  --thread-id "your-thread-id" \
  --advisor-model architect=gpt-5.2 \
  --advisor-model philosopher=claude-opus-4-6 \
  --advisor-model explorer=gemini-3.1-pro-preview \
  --advisor-model maverick=grok-4 \
  --synthesizer-model gpt-4.1 \
  "Your question"
```

## Output behavior

Default mode prints:
- HTTP status line
- final synthesized answer

`--quiet` prints:
- final synthesized answer only

`--raw` prints:
- raw SSE events from the API

## Optional reference

For reusable question templates, read:
- `references/prompt-patterns.md`

Use it when the user wants better prompting patterns for product strategy, architecture, hiring, or content positioning.

## Error handling

- Missing key → exits with clear guidance to set `SYNERO_API_KEY`
- HTTP failure → prints status and response body
- Network failure → prints a clear network error
- Empty synthesis → exits non-zero instead of pretending things are fine

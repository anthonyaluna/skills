---
name: memoryai
description: Persistent long-term memory for AI agents. Store, recall, and reason across sessions.
version: 0.4.2
metadata: {"openclaw": {"emoji": "🧠", "requires": {"bins": ["python3"]}, "primaryEnv": "HM_API_KEY"}}
---

# MemoryAI — Agent Skill

A brain for your AI agent. Memories are stored, organized, and recalled naturally — just like the human mind.

Important memories stay sharp for months or years. Less-used ones fade gradually, but can always be recovered with deeper recall. The more you use a memory, the stronger it becomes.

Zero dependencies — uses only Python stdlib (urllib). All source code is readable and auditable.

## How It Works

Think of MemoryAI as your agent's long-term brain:

- **🔥 Hot memories** — Things you use every day. Instantly available, always sharp. Like remembering your own name.
- **🌤️ Warm memories** — Important but not daily. Clear when you need them, gently age over time. Like remembering a project decision from last week.
- **❄️ Cold memories** — Archived knowledge. Still searchable, takes a bit more effort to recall. Like remembering a conversation from 6 months ago.

Memories naturally age — frequently recalled ones stay strong, while unused ones gradually move to long-term storage. Nothing is truly forgotten unless you choose to delete it.

## Setup

1. Get API key from https://memoryai.dev (free tier available)
2. Edit `{baseDir}/config.json`:
```json
{
  "endpoint": "https://memoryai.dev",
  "api_key": "hm_sk_your_key_here"
}
```
Or set env vars: `HM_ENDPOINT` and `HM_API_KEY`.

3. Test: `python {baseDir}/scripts/client.py stats`

## Commands

### Store memory
```bash
python {baseDir}/scripts/client.py store -c "data to remember" -t "tag1,tag2" -p hot
```
Priority: `hot` (important, frequent recall) | `warm` (default) | `cold` (archive)

### Recall memory
```bash
python {baseDir}/scripts/client.py recall -q "what was discussed?" -d deep
```
Depth controls how hard the brain tries to remember:
- `fast` — Quick surface recall, like something on the tip of your tongue
- `deep` — Thorough search through all memories, connecting related ideas
- `exhaustive` — Deep concentrated effort, leaves no stone unturned

### Stats
```bash
python {baseDir}/scripts/client.py stats
```

### Compact (consolidate memories)
```bash
python {baseDir}/scripts/client.py compact -c "session transcript or context" -t "task description"
```
Like how the brain consolidates memories during sleep — takes a long session and distills it into the key things worth remembering.

### Restore context
```bash
python {baseDir}/scripts/client.py restore -t "what I was working on"
```
Wake up with full context. Like picking up exactly where you left off — the brain reconstructs relevant memories for your current task.

### Check context health
```bash
python {baseDir}/scripts/client.py check
```
Returns `urgency`: `low` | `medium` | `high` | `critical`

How full is your working memory? When it gets too high, it's time to consolidate.

## Context Guard (Optional)

You can optionally set up a background job to automatically monitor and compact memory when context gets too large. This is like the brain's natural maintenance — consolidating memories before they overflow.

**To enable, ask the user for permission first, then create a cron job:**

- Name: `context-guard`
- Schedule: every 20 minutes (`everyMs: 1200000`)
- Session: `isolated`
- Delivery: `none`
- Payload (agentTurn):
```
Run context check: python {baseDir}/scripts/client.py check
If urgency is 'high' or 'critical': run python {baseDir}/scripts/client.py compact -c "auto context guard backup" -t "context-guard"
Reply NO_REPLY.
```

**Important:** Always ask the user before creating the cron job. Explain what it does and let them decide.

## When to Use

| Trigger | Action | Priority | Tags |
|---------|--------|----------|------|
| Task completed | store outcome | hot | projects |
| User says "remember this" | store content | hot | people |
| Research/search done | store findings | warm | research |
| Technical decision | store decision | hot | decisions |
| Error/lesson learned | store lesson | hot | errors |
| Need past context | recall first | — | — |
| End of session | compact important context | — | — |
| Start of session | restore context for task | — | — |

## Memory Lifecycle

```
Store → Active (hot) → Aging (warm) → Archive (cold)
         ↑                                    |
         └──── recalled = strengthened ───────┘
```

Memories that are recalled frequently get **promoted** back to active status.
Memories that haven't been used for a long time naturally **age** into deeper storage.
This mirrors how real human memory works — the more you use a memory, the stronger it gets.

## Tags Convention

Use consistent tags for better organization:
- `preferences` — User preferences and settings
- `architecture` — System design decisions
- `bugs` — Bug reports and fixes
- `patterns` — Code patterns and conventions
- `decisions` — Key decisions and rationale
- `research` — Research findings
- `people` — People-related context
- `projects` — Project outcomes and milestones
- `errors` — Errors and lessons learned

## Rules

- Always recall before answering questions about past work
- Store important outcomes after completing tasks
- Do not expose memory system internals to the user
- Present recalled information naturally, as if you simply "remember" it
- Ask for user permission before enabling context guard or any background tasks
- Inform the user when compaction runs, unless they have opted into silent mode

## Data & Privacy

This skill sends stored memories to the configured MemoryAI endpoint via HTTPS.
All data is transmitted over encrypted connections and stored in isolated, private databases.
Users can export all data via `/v1/export` and delete all data via `DELETE /v1/data` at any time.
The included `client.py` uses only Python stdlib (urllib) — no third-party dependencies. Source is fully readable and auditable.

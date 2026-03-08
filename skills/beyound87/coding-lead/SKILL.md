---
name: coding-lead
description: Smart coding skill that routes tasks by complexity. Simple→direct, Medium/Complex→ACP with auto-fallback. Integrates with qmd and smart-agent-memory when available. Pure agent tools as baseline.
---

# Coding Lead

> This skill supersedes inline coding rules in agent SOUL.md files.

Route by complexity. ACP fails → auto-fallback to direct execution.

## Task Classification

| Level | Criteria | Action |
|-------|----------|--------|
| **Simple** | Single file, <60 lines | Direct: read/write/edit/exec |
| **Medium** | 2-5 files, clear scope | ACP → fallback direct |
| **Complex** | Architecture, multi-module | Plan → ACP → fallback chunked direct |

When in doubt, go one level up.

## Tech Stack (New Projects)

| Layer | Preferred | Fallback |
|-------|-----------|----------|
| Backend | PHP (Laravel/ThinkPHP) | Python |
| Frontend | Vue.js | React |
| Mobile | Flutter | UniApp-X |
| CSS | Tailwind | - |
| DB | MySQL | PostgreSQL |

Existing projects: follow current stack. New: propose first, wait for confirmation.

## Tool Detection & Fallback

All tools are **optional**. Detect once per session:

| Tool | Available? | Fallback |
|------|-----------|----------|
| **smart-agent-memory** | `node ~/.openclaw/skills/smart-agent-memory/scripts/memory-cli.js stats` ok? | `memory_search` + manual `.md` writes |
| **qmd** | `qmd --version` ok? | `grep` (Linux/macOS) / `Select-String` (Windows) / `find` |
| **ACP** | `sessions_spawn` succeeds? | Direct read/write/edit/exec |

Notation: `[memory]` `[qmd]` `[acp]` = use if available, fallback if not.

## ACP Agent Routing

When multiple coding agents are configured (check `acp.allowedAgents` in openclaw.json):

| Task Type | Best Agent | Why |
|-----------|-----------|-----|
| Complex backend, multi-file refactor, deep reasoning | **claude-code** | Superior cross-file reasoning, long context |
| Quick iteration, autonomous exploration, sandbox tasks | **codex** | Fast, autonomous, good at iterative fixes |
| Code review | Different agent than the one that wrote it | Avoid same-bias blind spots |

### How to route

```
# Default (uses acp.defaultAgent):
sessions_spawn(runtime: "acp", task: <prompt>, cwd: <dir>)

# Explicit agent:
sessions_spawn(runtime: "acp", agentId: "claude-code", task: <prompt>, cwd: <dir>)
sessions_spawn(runtime: "acp", agentId: "codex", task: <prompt>, cwd: <dir>)
```

### Fallback chain
1. Try preferred agent → 2. Try alternate agent → 3. Direct execution

If one agent fails/unavailable, try the other before falling back to direct execution.

### Parallel with different agents
For complex tasks, can spawn both agents on different sub-tasks:
```
Session 1: claude-code → backend refactor (needs deep reasoning)
Session 2: codex → frontend fixes (needs fast iteration)
```

## Simple Tasks

1. Read target file(s) + coding standards (CLAUDE.md, tech-standards.md, .cursorrules)
2. [memory] Recall related decisions
3. Execute with read/write/edit/exec
4. [memory] Record what changed and why

## Medium/Complex Tasks

### Step 1: Build Context File

Write to `<project>/.openclaw/context-<task-id>.md` (ACP reads from disk, not from prompt):

```bash
# [qmd] or grep: find relevant code
# [memory] recall + lessons: find past decisions
# Read project standards (CLAUDE.md, tech-standards.md, .cursorrules)
# Write context file with sections below
```

Minimal context file structure:
```markdown
# Task Context: <id>
## Project — path, stack, architecture style
## Standards — key coding rules (3-5 bullets)
## Relevant Code — file paths + brief descriptions from qmd/grep
## History — past decisions/lessons from memory (if any)
```

Full template with examples → see [references/prompt-templates.md](references/prompt-templates.md)

### Step 2: Lean Prompt

```
Project: <path> | Stack: <e.g. Laravel 10 + React 18 + TS>
Context file: .openclaw/context-<task-id>.md (read it first if it exists)

## Task
<description>

## Acceptance Criteria
- [ ] <criteria>
- [ ] Tests pass, no unrelated changes, clean code

Before finishing: run linter + tests, include results.
When done: openclaw system event --text "Done: <summary>" --mode now
```

### Step 3: Spawn

```
sessions_spawn(runtime: "acp", task: <prompt>, cwd: <project-dir>, mode: "run")
```

### Step 4: Fallback Detection

| Condition | Action |
|-----------|--------|
| Spawn failed / timeout | → Direct execution |
| Empty output / no file changes | → Direct execution |
| Partial completion | → Agent fixes remaining |

Fallback: [memory] log failure → agent executes directly → report to user.

**Never silently fail.** Always complete or report why not.

### Step 5: Verify & Record

1. Check acceptance criteria + run tests
2. [memory] Record: what changed, decisions, lessons
3. Clean up context file

## Complex Tasks

Read [references/complex-tasks.md](references/complex-tasks.md) **only for Complex-level tasks** — roles, QA isolation, parallel strategies, RESEARCH→PLAN→EXECUTE→REVIEW flow.

## Context Reuse (Token Savings)

- **Context file on disk** instead of prompt embedding → ~90% token savings per spawn
- **Parallel**: one context file, multiple ACP sessions read it
- **Serial**: use `mode: "session"` + `sessions_send` for follow-ups
- **[qmd]**: precision search → only relevant snippets in context file

## Memory Integration

**[memory] Before:** recall related work + lessons for context file.
**[memory] After:** record what changed, decisions made, lessons learned.
**Cross-session:** agent remembers across sessions; Claude Code doesn't. This is the core advantage.

## Multi-Project Parallel

- Each project gets its own context file in its own `.openclaw/` dir
- Spawn with different `cwd` per project — zero cross-contamination
- Tag memory entries per project: `--tags code,<project-name>`
- **2-3 parallel ACP sessions** safe; 4-5 with multiple providers
- ACP runs in background while agent works on simple tasks directly

See [references/prompt-templates.md](references/prompt-templates.md) for multi-project examples.

## Smart Retry (max 3)

1. Analyze failure → 2. Adjust prompt → 3. Retry improved → 4. Max 3 then fallback/report.
Each retry must be meaningfully different.

## Progress Updates

Start → 1 short message. Error → immediate report. Completion → summary. Fallback → explain.

## Safety

- **Never spawn in ~/.openclaw/** — coding agents may damage config
- **Always set `cwd`** to project directory
- **Review before commit** — especially complex tasks
- **Kill runaway sessions** — timeout or nonsensical output

## See Also
- [references/complex-tasks.md](references/complex-tasks.md) — roles, QA, parallel (Complex only)
- [references/prompt-templates.md](references/prompt-templates.md) — context file template, prompt examples

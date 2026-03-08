# Complex Tasks — Roles, QA Isolation, Parallel Strategies

> **Only read this file for Complex-level tasks.** Simple and Medium tasks don't need any of this.

## Complex Task Flow

```
RESEARCH → PLAN → EXECUTE → REVIEW → QA → FIX → RECORD
```

Skip steps that don't apply. Not every complex task needs all steps.

## Coding Roles

For complex multi-layer tasks, spawn separate ACP sessions with role-specific prompts:

| Role | When to Use | Prompt Prefix |
|------|------------|---------------|
| **Architect** | System design, DB schema, API contracts | "You are a senior software architect. Design scalable, maintainable systems. Output: design doc with file structure, DB schema, API contracts, and implementation notes." |
| **Frontend** | UI components, pages, responsive design | "You are a frontend specialist. Write clean, accessible, performant UI code. Follow the project's frontend patterns." |
| **Backend** | API endpoints, business logic, data layer | "You are a backend specialist. Write secure, efficient server-side code. Follow the project's backend patterns." |
| **Reviewer** | Code review after implementation | "You are a senior code reviewer. Review for: logic errors, security issues, performance problems, style violations. Be specific, cite line numbers." |
| **QA** | Test writing, edge case analysis | "You are an independent QA engineer. You have NOT seen the implementation code. Based on requirements and interface definitions, write thorough tests." |

### Flow with Roles

```
1. RESEARCH (agent reads code, searches memory + qmd)
2. PLAN (agent designs approach, gets confirmation)
3. ARCHITECT (spawn) — if task needs design decisions
   → output: design doc, schema, API contracts
4. IMPLEMENT (spawn, can be parallel)
   → Frontend session (if UI involved)
   → Backend session (if API/logic involved)
   → Or single fullstack session for smaller scope
5. REVIEW (spawn) — independent reviewer session
6. QA (spawn) — isolated test writing (see below)
7. FIX (spawn or sessions_send) — address findings
8. RECORD (agent logs to memory)
```

### Parallel Spawning

Frontend and backend can run in parallel when independent:

```
# Parallel — both read same context file
Session 1: Frontend → "Read .openclaw/context-xxx.md. Build FavoriteButton component..."
Session 2: Backend → "Read .openclaw/context-xxx.md. Build favorites API endpoint..."

# Sequential — must wait for both
Session 3: Reviewer → "Review all changes from sessions above..."
```

Write ONE context file. All parallel sessions read it. Zero redundancy.

**Limit: 2-3 parallel sessions** to stay within API rate limits.

## QA Isolation Rule

> **Critical**: QA sessions must be isolated from implementation to avoid "testing your own homework."

### QA Prompt Structure

```
You are an independent QA engineer. You have NOT seen the implementation.

## What to Test
[Requirements / user story / acceptance criteria]

## Interfaces
[Function signatures, API endpoints, DB schema — NO implementation details]

## Project Test Setup
[Test framework, how to run tests, existing test patterns]

## Write Tests For
- Happy paths (normal usage)
- Edge cases (empty input, max values, unicode, special chars)
- Error paths (invalid input, network failure, timeout)
- Boundary conditions (off-by-one, pagination limits)
- Business logic edges (concurrent access, partial failure)

Do NOT assume implementation details. Test the contract, not the code.
```

### Why Isolation Matters
When AI writes code and tests in the same session, tests mirror the implementation — including its bugs. Isolation forces tests from "what should happen" not "what does happen."

## RESEARCH Phase (No Changes)

Spawn in session mode, investigation only:

```
Investigate <project-dir> for <task description>.

DO NOT make any changes. Only report:
1. Files that need changes
2. Dependencies and call chains
3. Reusable existing code
4. Risks and edge cases
5. Test coverage status

Use qmd/grep/find to explore. Read .openclaw/context-xxx.md for project context.
```

## Agent & Model Routing

When multiple ACP agents are configured (`acp.allowedAgents`):

| Task Type | Agent | Why |
|-----------|-------|-----|
| Complex backend, architecture, multi-file | **claude-code** | Deep reasoning, long context |
| Quick fixes, iteration, exploration | **codex** | Fast, autonomous |
| Code review | Different agent than writer | Avoid same-bias |

Route via `agentId` in `sessions_spawn`. If only one agent available, skip routing.
Fallback: preferred → alternate → direct execution.

## Review by Complexity

| Level | Review Action |
|-------|--------------|
| Simple (agent did it) | No formal review |
| Medium (ACP) | Quick check: success reported? Tests pass? Skim for obvious errors |
| Complex (ACP multi-file) | Full checklist: logic, security, performance, style, tests |

## Definition of Done

### Medium Tasks
- [ ] ACP reported success (or fallback completed)
- [ ] Linter passed (if available)
- [ ] Existing tests pass
- [ ] No unrelated file changes
- [ ] Logged in memory

### Complex Tasks
- [ ] All acceptance criteria met
- [ ] Linter + tests pass
- [ ] Code review passed
- [ ] QA tests written and passing (if applicable)
- [ ] UI changes: screenshots/descriptions included
- [ ] No debug logs, unused imports, temp files
- [ ] Logged in memory with decisions and lessons

## Task Registry

Track active tasks in `<project>/.openclaw/active-tasks.json`:

```json
{
  "id": "feat-favorites",
  "task": "Add favorites feature",
  "status": "running",
  "sessionKey": "acp:run:abc123",
  "startedAt": 1740268800000,
  "complexity": "complex"
}
```

Update on completion/failure. Clean up entries older than 7 days.
Add `.openclaw/` to `.gitignore`.

## Claude Code Tool Tips

Remind in spawned prompts:
- LSP (goToDefinition, findReferences) for code structure
- Grep/Glob for finding files
- mcp__context7 for library docs
- mcp__mcp-deepwiki for open-source project docs

These are Claude Code tools, not OpenClaw tools.

## Prompt Pattern Library

After successful tasks, record what worked:

```bash
# [memory] Record lesson (skip if smart-agent-memory not installed)
node ~/.openclaw/skills/smart-agent-memory/scripts/memory-cli.js learn \
  --action "Built favorites feature" \
  --context "Laravel+React, medium complexity" \
  --outcome positive \
  --insight "Including full DB schema context in prompt upfront made ACP get it right first try" \
  2>/dev/null || echo "memory skip: smart-agent-memory not found"
```

Before spawning, search for similar past tasks (if smart-agent-memory installed): `node ~/.openclaw/skills/smart-agent-memory/scripts/memory-cli.js lessons --context "<similar task type>"`

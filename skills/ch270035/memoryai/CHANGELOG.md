# Changelog

## 0.4.2 (2026-03-08)

### Changed
- **Context Guard is now opt-in** — Agent must ask user permission before creating the background cron job. No more silent auto-creation.
- **Removed `always: true`** — Skill is no longer force-enabled on every session. Users enable it when needed.
- **Installer scripts moved to separate section** — README now recommends reviewing scripts before running, with ClaWHub as the primary install method.
- **Added Security & Privacy section** — Documents data handling, auditability, and key rotation guidance.

## 0.4.1 (2026-03-08)

### Added
- **One-liner installer** — `iwr -useb https://memoryai.dev/install.ps1 | iex` (Windows) or `curl -fsSL https://memoryai.dev/install.sh | bash` (Mac/Linux). Auto-downloads skill, prompts for API key, verifies connection.
- **"How It Works" section** — Brain metaphor documentation explaining memory lifecycle (hot → warm → cold), natural aging, and recall strengthening.

### Fixed
- **Cloudflare 403 fix** — Added `User-Agent` header to all API requests. Previously blocked by Cloudflare bot protection.

## 0.4.0 (2026-03-08)

### Added
- **Context Guard** — Auto-setup cron job monitors brain health every 20 min, consolidates memories when urgency is high/critical
- **Check command** — `client.py check` returns brain urgency level (low/medium/high/critical)
- Agent auto-creates `context-guard` cron on first session (no manual setup needed)

### Changed
- SKILL.md rewritten with `{baseDir}` paths for proper skill resolution
- Added metadata for OpenClaw gating (always: true, emoji: 🧠)
- Improved "When to Use" table with triggers, actions, priorities, and tags
- Updated tags convention section

## 0.3.0 (2026-03-07)

### Changed
- Migrated to cloud-backed memory server for reliability and cross-device sync
- Store/recall/compact/restore commands updated for server API

## 0.2.0 (2026-03-07)

Initial public release — **A Brain for Your AI Agent**.

### Features
- **Store** — Save decisions, patterns, preferences with priority levels (hot / warm / cold)
- **Recall** — Intelligent multi-signal search (fast / deep / exhaustive)
- **Perfect Recall** — Deep reasoning mode for synthesized, detailed answers (Pro)
- **Compact** — Consolidate long sessions into key memories automatically
- **Restore** — Start new sessions with full context from previous work
- **Stats** — Monitor brain health and memory usage

### Technical
- Zero dependencies — Python stdlib only (3.10+)
- Configure via config.json or environment variables
- Supports hosted (memoryai.dev) and self-hosted deployments

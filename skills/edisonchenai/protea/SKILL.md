---
name: protea
description: >
  Self-evolving artificial life system. Three-ring architecture: Ring 0 (Sentinel) supervises,
  Ring 1 (Intelligence) drives LLM-powered evolution, Ring 2 (Evolvable Code) is the living program
  that self-restructures, self-reproduces, and self-evolves. Supports Anthropic, OpenAI, DeepSeek,
  and Qwen as LLM providers. Includes fitness scoring, gene pool inheritance, tiered memory,
  skill crystallization, Telegram bot, and web dashboard.
---

# Protea — Self-Evolving Artificial Life System

A living program that evolves itself. Three-ring architecture running on a single machine.

## Architecture

- **Ring 0 (Sentinel)** — Immutable physics layer. Heartbeat monitoring, git snapshots, rollback, fitness tracking. Pure Python stdlib.
- **Ring 1 (Intelligence)** — LLM-driven evolution engine, task executor, Telegram bot, skill crystallizer, web dashboard. Multi-LLM support (Anthropic, OpenAI, DeepSeek, Qwen).
- **Ring 2 (Evolvable Code)** — The living code that evolves, managed in its own git repo by Ring 0.

## Prerequisites

- Python 3.11+
- Git
- At least one LLM API key (Anthropic, OpenAI, DeepSeek, or Qwen)

## Quick Start

```bash
# Install
curl -sSL https://raw.githubusercontent.com/EdisonChenAI/protea/main/setup.sh | bash
cd protea && .venv/bin/python run.py
```

Or clone manually:

```bash
git clone https://github.com/EdisonChenAI/protea.git
cd protea
bash setup.sh
.venv/bin/python run.py
```

## Key Features

- **Self-Evolution** — LLM generates code mutations each generation; survivors are kept, failures roll back
- **Fitness Scoring** — 6-component scoring (survival, output volume/diversity, novelty, structure, function)
- **Gene Pool** — Top 100 code patterns stored in SQLite, injected into evolution prompts
- **Tiered Memory** — Hot → Warm → Cold → Forgotten, with LLM-assisted curation
- **Skill Crystallization** — Surviving code patterns are extracted as reusable skills
- **Multi-LLM** — Anthropic, OpenAI, DeepSeek, Qwen via unified interface
- **Telegram Bot** — Commands + free-text interaction
- **Web Dashboard** — Local UI at `http://localhost:8899`
- **1098 Tests** — Comprehensive test coverage across Ring 0 and Ring 1

## Configuration

Edit `config/config.toml` to set LLM provider:

```toml
# Anthropic (default)
# Set CLAUDE_API_KEY env var

# Or use DeepSeek
[ring1.llm]
provider = "deepseek"
api_key_env = "DEEPSEEK_API_KEY"
model = "deepseek-chat"
```

## Project Structure

```
protea/
├── ring0/          # Sentinel (pure stdlib)
├── ring1/          # Intelligence layer + tools
├── ring2/          # Evolvable code
├── config/         # Configuration
├── tests/          # 1098 tests
└── run.py          # Entry point
```

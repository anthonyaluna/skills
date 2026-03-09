# MemoryAI — OpenClaw Skill

A brain for your AI agent. Store context, recall it across sessions, and never lose important information.

Your agent's memories work just like the human brain — important things stay sharp for months or years, while less-used memories gently fade into long-term storage. Nothing is truly lost — deeper recall can always bring them back.

## Installation

### Option 1: ClawhHub (recommended)
```bash
clawhub install memoryai
```
Edit `skills/memoryai/config.json` with your API key, done.

### Option 2: Manual
Copy the `skill/` folder into your OpenClaw workspace:

```
~/.openclaw/workspace/skills/memoryai/
├── SKILL.md
├── config.json
└── scripts/
    └── client.py
```

Edit `config.json`:
```json
{
  "endpoint": "https://memoryai.dev",
  "api_key": "hm_sk_your_key_here"
}
```

Test: `python skills/memoryai/scripts/client.py stats`

### Option 3: Installer scripts

For convenience, installer scripts are available at https://memoryai.dev. These download skill files, prompt for your API key, and verify the connection. **Review the scripts before running:**

- Windows: `https://memoryai.dev/install.ps1`
- macOS/Linux: `https://memoryai.dev/install.sh`

## How It Works

MemoryAI gives your agent a brain that works like yours:

| 🔥 Hot | 🌤️ Warm | ❄️ Cold |
|--------|---------|---------|
| Daily-use memories | Important but not daily | Long-term archive |
| Instantly available | Clear when needed | Searchable with effort |
| Like your own name | Like last week's decision | Like a chat from 6 months ago |

**Memories naturally age** — frequently recalled ones stay strong, unused ones gradually move to deeper storage. The more you use a memory, the stronger it gets. Just like the real brain.

## What's Included

- **Store** — Save memories with priority levels (hot / warm / cold)
- **Recall** — Remember things with adjustable effort (fast / deep / exhaustive)
- **Compact** — Brain consolidation — distill long sessions into key memories (like sleeping on it)
- **Restore** — Wake up with full context for your current task
- **Check** — Monitor brain health, prevent memory overflow
- **Context Guard** — Optional background maintenance (with user consent)

## CLI Reference

```bash
# Store a memory
python scripts/client.py store -c "Important fact" -t "tag1,tag2" -p hot

# Recall memories
python scripts/client.py recall -q "search query" -d deep

# Check brain health
python scripts/client.py stats

# Consolidate session
python scripts/client.py compact -c "session transcript" -t "task description"

# Restore context
python scripts/client.py restore -t "task description"

# Check urgency
python scripts/client.py check
```

## Security & Privacy

- All data is transmitted via HTTPS and stored in isolated databases
- `client.py` uses only Python stdlib (urllib) — no third-party dependencies
- Source code is fully readable and auditable
- API key (`HM_API_KEY`) should be treated as sensitive — rotate regularly
- Context Guard requires explicit user permission before activation
- Export your data anytime via `/v1/export`, delete via `DELETE /v1/data`

## Requirements

- Python 3.10+ (no pip install needed)
- A MemoryAI API key (get one at https://memoryai.dev)

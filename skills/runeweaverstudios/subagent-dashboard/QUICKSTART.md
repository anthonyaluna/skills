# Quick Start Guide

## Start the Dashboard

```bash
cd workspace/skills/subagent-dashboard/scripts
./start_dashboard.sh
```

Then open **http://127.0.0.1:8080** in your browser.

The dashboard is unauthenticated and intended only for this machine. Do not expose it through a proxy, tunnel, or shared host. Its Git controls trust the configured repository's metadata, hooks, and remotes.

## What You'll See

- **Agent Cards** - One card per active subagent showing:
  - Model name (e.g., "google/gemini-2.5-flash")
  - Age (how long it's been running)
  - Token usage (input/output)
  - Task progress (if available, e.g., "Task 2/5")
  - Task description

- **Status Indicators**:
  - 🟢 Green = Active
  - 🟠 Orange = Stalled (>30 min inactive)

- **Actions**:
  - **📋 Transcript** - View recent activity
  - **🔄 Refresh** - Update status
  - **⚡ Restart** - Restart stalled agents

## Auto-Refresh

The dashboard refreshes every 3 seconds automatically. Click "Pause" to stop, "Resume" to restart.

## Troubleshooting

**Port already in use?**
```bash
PORT=9000 python3 dashboard.py
```

**Dependencies missing?**
```bash
pip install -r ../requirements.txt
```

**No agents showing?**
- Check that subagents are actually running
- Verify `~/.openclaw/agents/main/sessions/sessions.json` exists
- Ensure subagent-tracker skill is installed

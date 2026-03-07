---
name: imap-mail
description: Personal email via your own IMAP/SMTP server. Send and receive emails, manage folders, and search messages using standard protocols — no third-party email platform required. Use when you need to check inbox, send emails, move messages between folders, search by sender/subject/date, list all mailboxes, schedule emails for future delivery, save attachments, or get push notifications for new mail (IMAP IDLE).
metadata: {"openclaw":{"requires":{"bins":["python3"]},"install":{"uv":{"packages":["fastapi","uvicorn"]}}}}
---

# IMAP Mail Skill

Send and receive email through your own IMAP/SMTP server.

A lightweight local REST API (FastAPI) runs as a bridge between the agent and your mail server — no third-party email platform needed.

## Setup (first time)

### 1. Install dependencies

```bash
pip3 install fastapi uvicorn
```

### 2. Configure credentials

Create `/etc/imap-mail.env` (or any path, then set `IMAP_MAIL_ENV`):

```env
MAIL_IMAP_HOST=mail.example.com
MAIL_IMAP_PORT=993
MAIL_SMTP_HOST=mail.example.com
MAIL_SMTP_PORT=465
MAIL_USER=agent@example.com
MAIL_PASS=yourpassword
MAIL_FROM_NAME=MyAgent
```

### 3. Start the API server

```bash
# One-time / foreground
python3 {baseDir}/scripts/mail-api.py

# Or as a systemd service (recommended)
# See: {baseDir}/references/systemd.md
```

The API listens on `http://127.0.0.1:8025` by default.

## Checking Email

```bash
# List recent messages
python3 {baseDir}/scripts/check_inbox.py --inbox agent@example.com

# Unread only
python3 {baseDir}/scripts/check_inbox.py --inbox agent@example.com --unseen

# Specific folder
python3 {baseDir}/scripts/check_inbox.py --inbox agent@example.com --folder Sent

# Read a specific message (use UID from list output)
python3 {baseDir}/scripts/check_inbox.py --inbox agent@example.com --message 42

# Read message and save all its attachments
python3 {baseDir}/scripts/check_inbox.py --inbox agent@example.com --message 42 --save-attachments /tmp/mail/

# List threads
python3 {baseDir}/scripts/check_inbox.py --inbox agent@example.com --threads

# List all folders
python3 {baseDir}/scripts/check_inbox.py --inbox agent@example.com --folders
```

## Searching Email

```bash
# Search by keyword (subject + body)
python3 {baseDir}/scripts/search.py --inbox agent@example.com --q "invoice"

# Search by sender
python3 {baseDir}/scripts/search.py --inbox agent@example.com --from "alice@example.com"

# Search by subject + date range
python3 {baseDir}/scripts/search.py --inbox agent@example.com --subject "meeting" --since 2026-01-01

# Find unread messages
python3 {baseDir}/scripts/search.py --inbox agent@example.com --unseen

# Find messages with attachments and save them
python3 {baseDir}/scripts/search.py --inbox agent@example.com --has-attachments --save-attachments /tmp/mail/

# Find messages from VIP senders only
python3 {baseDir}/scripts/search.py --inbox agent@example.com --vip

# Combined filters: unread messages from a specific sender since a date
python3 {baseDir}/scripts/search.py --inbox agent@example.com --from "alice@example.com" --since 2026-03-01 --unseen

# Unread messages with a specific subject keyword
python3 {baseDir}/scripts/search.py --inbox agent@example.com --subject "invoice" --unseen

# Search in a specific folder
python3 {baseDir}/scripts/search.py --inbox agent@example.com --q "report" --folder Archive
```

## Folder Management

```bash
# List all folders
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --list

# Create a folder
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --create Archive

# Delete a folder
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --delete OldFolder

# Move a message to another folder (use UID from check_inbox output)
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --move 42 --to Archive

# Move from a specific source folder
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --move 5 --to INBOX --from-folder Junk

# Delete a message
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --delete-msg 42

# Mark all messages in INBOX as read
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --mark-seen

# Mark all messages in a specific folder as read
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --mark-seen --from-folder Sent

# Mark one specific message as read (use UID from check_inbox output)
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --mark-seen-uid 42

# Mark several specific messages as read (space-separated UIDs)
python3 {baseDir}/scripts/manage_folders.py --inbox agent@example.com --mark-seen-uid 42 55 73
```

## Sending Email

```bash
# Send a plain text email
python3 {baseDir}/scripts/send_email.py \
  --to recipient@example.com \
  --subject "Hello" \
  --text "Message body here"

# Send to multiple recipients
python3 {baseDir}/scripts/send_email.py \
  --to alice@example.com \
  --to bob@example.com \
  --subject "Hello everyone" \
  --text "Hi all!"

# Reply to a message (preserves thread)
python3 {baseDir}/scripts/send_email.py \
  --to sender@example.com \
  --subject "Re: Original Subject" \
  --text "My reply" \
  --reply-to "<original-message-id>"
```

## Scheduled Send

Queue emails for future delivery. The API background scheduler checks every 60 seconds.

```bash
# Schedule via API directly (ISO datetime, UTC recommended)
# POST /inboxes/{inbox}/scheduled
# Body: {"to": ["user@example.com"], "subject": "...", "text": "...", "send_at": "2026-03-10T09:00:00Z"}

# List all scheduled messages
# GET /inboxes/{inbox}/scheduled

# Cancel a scheduled message
# DELETE /inboxes/{inbox}/scheduled/{id}
```

## IMAP IDLE (Push Notifications)

Instead of polling every N minutes, IDLE keeps a persistent connection open so the server pushes notifications immediately when new mail arrives.

Add to your env file:

```env
# Required: webhook URL to POST new mail events to
MAIL_IDLE_WEBHOOK=http://127.0.0.1:8080/mail-event

# Optional: folder to watch (default: INBOX)
MAIL_IDLE_FOLDER=INBOX
```

When new mail arrives, the API POSTs to the webhook:
```json
{
  "event": "new_mail",
  "uid": "123",
  "subject": "Hello",
  "from_": [{"name": "Alice", "email": "alice@example.com"}],
  "vip": false,
  ...full message fields...
}
```

Check IDLE status:
```bash
# GET http://127.0.0.1:8025/idle/status
```

## VIP Sender List

Mark specific senders as VIP — their messages will have `"vip": true` in the API response and in IDLE webhook payloads, enabling urgent/priority handling.

Add to your env file:

```env
MAIL_VIP_SENDERS=boss@company.com,important@client.com
```

Messages from VIP senders are flagged in all responses (`"vip": true`) and can be filtered:

```bash
# Show only VIP messages
python3 {baseDir}/scripts/search.py --inbox agent@example.com --vip
```

## API Endpoints

The local REST API at `http://127.0.0.1:8025` exposes:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Check API status (includes IDLE state, VIP list) |
| GET | `/idle/status` | IMAP IDLE watcher status |
| GET | `/inboxes/{inbox}/folders` | List folders |
| POST | `/inboxes/{inbox}/folders` | Create folder |
| DELETE | `/inboxes/{inbox}/folders/{name}` | Delete folder |
| GET | `/inboxes/{inbox}/messages` | List messages (`?folder=INBOX&limit=N&unseen=true`) |
| GET | `/inboxes/{inbox}/messages/{uid}` | Get full message (`?folder=INBOX`) |
| GET | `/inboxes/{inbox}/messages/{uid}/attachments/{index}` | Download attachment (base64) |
| POST | `/inboxes/{inbox}/messages` | Send email |
| POST | `/inboxes/{inbox}/messages/{uid}/move` | Move message (`?folder=src`) |
| DELETE | `/inboxes/{inbox}/messages/{uid}` | Delete message |
| GET | `/inboxes/{inbox}/search` | Search (`?q=&from=&subject=&since=&vip_only=true`) |
| GET | `/inboxes/{inbox}/threads` | List threads |
| POST | `/inboxes/{inbox}/scheduled` | Schedule email for future delivery |
| GET | `/inboxes/{inbox}/scheduled` | List scheduled messages |
| DELETE | `/inboxes/{inbox}/scheduled/{id}` | Cancel scheduled message |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIL_IMAP_HOST` | — | IMAP server hostname |
| `MAIL_IMAP_PORT` | `993` | IMAP port (TLS) |
| `MAIL_SMTP_HOST` | — | SMTP server hostname |
| `MAIL_SMTP_PORT` | `465` | SMTP port (TLS) |
| `MAIL_USER` | — | Email login / address |
| `MAIL_PASS` | — | Password |
| `MAIL_FROM_NAME` | `Agent` | Display name in From header |
| `MAIL_IDLE_WEBHOOK` | — | Webhook URL for IMAP IDLE push events |
| `MAIL_IDLE_FOLDER` | `INBOX` | Folder to watch with IDLE |
| `MAIL_VIP_SENDERS` | — | Comma-separated VIP email addresses |
| `MAIL_SCHEDULED_DB` | `/tmp/imap-mail-scheduled.db` | SQLite path for scheduled sends |
| `IMAP_MAIL_API` | `http://127.0.0.1:8025` | API base URL (for scripts) |
| `IMAP_MAIL_ENV` | `/etc/imap-mail.env` | Path to env file |
| `IMAP_MAIL_PORT` | `8025` | API listen port |

## Compatibility

Works with any standard IMAP/SMTP server:
- Self-hosted: Dovecot, Postfix, Exim, Maddy
- Hosted: Gmail (App Password), Outlook/Hotmail, Yahoo Mail, Fastmail, ProtonMail Bridge, and any provider that supports IMAP

> **Note:** Self-signed TLS certificates are accepted automatically.

## References

- [Systemd service setup]({baseDir}/references/systemd.md)
- [Full API reference]({baseDir}/references/api.md)

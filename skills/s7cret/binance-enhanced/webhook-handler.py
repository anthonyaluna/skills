#!/usr/bin/env python3
"""Receive authenticated GitHub events and update one configured OpenClaw skill."""

import hashlib
import hmac
import os
import re
import subprocess
from pathlib import Path
from threading import Lock

from flask import Flask, jsonify, request

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024

GITHUB_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")
ALLOWED_REPOSITORY = os.getenv("GITHUB_ALLOWED_REPOSITORY", "").strip()
ALLOWED_BRANCH = "main"
OPENCLAW_PATH = os.getenv("OPENCLAW_PATH", "/usr/local/bin/openclaw").strip()
SKILLS_DIR = os.getenv("OPENCLAW_SKILLS_DIR", "/home/moltbot1/.openclaw/skills")

MIN_SECRET_BYTES = 32
SUBPROCESS_TIMEOUT_SECONDS = 120
OPENCLAW_TIMEOUT_SECONDS = 60
REPOSITORY_PATTERN = re.compile(
    r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}"
)
SKILL_NAME_PATTERN = re.compile(r"[a-z0-9](?:[a-z0-9.-]{0,98}[a-z0-9])?")
COMMIT_PATTERN = re.compile(r"(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})")
SIGNATURE_PATTERN = re.compile(r"sha256=[0-9a-f]{64}")
UPDATE_LOCK = Lock()


def configuration_is_valid():
    """Require a strong shared secret, one repository, and an absolute skill path."""
    return (
        len(GITHUB_SECRET.encode("utf-8")) >= MIN_SECRET_BYTES
        and REPOSITORY_PATTERN.fullmatch(ALLOWED_REPOSITORY) is not None
        and Path(SKILLS_DIR).expanduser().is_absolute()
        and bool(OPENCLAW_PATH)
    )


def verify_signature(payload_body, secret_token, signature_header):
    """Verify GitHub's SHA-256 HMAC over the exact raw request body."""
    if (
        not isinstance(secret_token, str)
        or len(secret_token.encode("utf-8")) < MIN_SECRET_BYTES
        or not isinstance(signature_header, str)
        or SIGNATURE_PATTERN.fullmatch(signature_header) is None
    ):
        return False

    expected_signature = "sha256=" + hmac.new(
        secret_token.encode("utf-8"), payload_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected_signature, signature_header)


def repository_url():
    """Build the only permitted clone URL from the configured repository slug."""
    return f"https://github.com/{ALLOWED_REPOSITORY}.git"


def _git(skill_dir, *args, **kwargs):
    git_env = os.environ.copy()
    git_env["GIT_TERMINAL_PROMPT"] = "0"
    kwargs.setdefault("timeout", SUBPROCESS_TIMEOUT_SECONDS)
    return subprocess.run(
        ["git", "-c", "core.hooksPath=/dev/null", "-C", str(skill_dir), *args],
        check=True,
        env=git_env,
        **kwargs,
    )


def update_skill(skill_name, commit_sha):
    """Serialize updates so overlapping deliveries cannot restore an older commit."""
    with UPDATE_LOCK:
        return _update_skill(skill_name, commit_sha)


def _update_skill(skill_name, commit_sha):
    """Fetch and check out only an allowlisted main-branch commit, then reload it."""
    if not configuration_is_valid():
        raise ValueError("Webhook configuration is invalid")
    if SKILL_NAME_PATTERN.fullmatch(skill_name) is None:
        raise ValueError("Invalid skill name")
    if COMMIT_PATTERN.fullmatch(commit_sha) is None:
        raise ValueError("Invalid commit SHA")

    skills_root = Path(SKILLS_DIR).expanduser().resolve()
    skills_root.mkdir(parents=True, exist_ok=True)
    skill_dir = skills_root / skill_name
    if skill_dir.is_symlink():
        raise ValueError("Skill directory must not be a symlink")

    repo_url = repository_url()
    git_env = os.environ.copy()
    git_env["GIT_TERMINAL_PROMPT"] = "0"

    if skill_dir.exists():
        if not skill_dir.is_dir() or not (skill_dir / ".git").exists():
            raise ValueError("Existing skill path is not a Git checkout")
        remote = subprocess.run(
            ["git", "-c", "core.hooksPath=/dev/null", "-C", str(skill_dir),
             "remote", "get-url", "origin"],
            check=True,
            capture_output=True,
            text=True,
            env=git_env,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )
        if remote.stdout.strip() != repo_url:
            raise ValueError("Existing skill checkout has an unexpected origin")
    else:
        subprocess.run(
            ["git", "-c", "core.hooksPath=/dev/null", "clone", "--no-checkout",
             "--", repo_url, str(skill_dir)],
            check=True,
            env=git_env,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )

    _git(skill_dir, "fetch", "--no-tags", "origin", f"refs/heads/{ALLOWED_BRANCH}")
    branch_tip = _git(
        skill_dir, "rev-parse", "FETCH_HEAD", capture_output=True, text=True
    ).stdout.strip()
    if branch_tip.lower() != commit_sha.lower():
        return False

    _git(skill_dir, "checkout", "--detach", commit_sha)
    subprocess.run(
        [OPENCLAW_PATH, "skill", "reload", skill_name],
        check=True,
        timeout=OPENCLAW_TIMEOUT_SECONDS,
    )
    return True


@app.route("/webhook/github", methods=["POST"])
def github_webhook():
    """Handle signed events for the single configured GitHub repository."""
    if not configuration_is_valid():
        return jsonify({"error": "Webhook is not configured"}), 503

    signature = request.headers.get("X-Hub-Signature-256")
    if not verify_signature(request.get_data(cache=True), GITHUB_SECRET, signature):
        return jsonify({"error": "Invalid signature"}), 401

    event = request.headers.get("X-GitHub-Event", "")
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid JSON payload"}), 400

    repository = payload.get("repository")
    repository_name = repository.get("full_name") if isinstance(repository, dict) else None
    if (
        not isinstance(repository_name, str)
        or repository_name.casefold() != ALLOWED_REPOSITORY.casefold()
    ):
        return jsonify({"error": "Repository is not allowed"}), 403

    if event == "push":
        ref = payload.get("ref")
        if ref != f"refs/heads/{ALLOWED_BRANCH}":
            return jsonify({"status": "ignored", "reason": "branch is not allowed"}), 200

        commit_sha = payload.get("after")
        if not isinstance(commit_sha, str) or COMMIT_PATTERN.fullmatch(commit_sha) is None:
            return jsonify({"error": "Invalid commit SHA"}), 400
        if set(commit_sha) == {"0"}:
            return jsonify({"status": "ignored", "reason": "branch deletion"}), 200

        skill_name = repository_name.rsplit("/", 1)[1].replace("_", "-").lower()
        if SKILL_NAME_PATTERN.fullmatch(skill_name) is None:
            return jsonify({"error": "Configured repository name is invalid"}), 503

        try:
            updated = update_skill(skill_name, commit_sha.lower())
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
            app.logger.exception("Failed to update allowlisted skill %s", skill_name)
            return jsonify({"error": "Skill update failed"}), 500
        if not updated:
            return jsonify({
                "status": "ignored",
                "reason": "commit is no longer the main branch tip",
            }), 200

        return jsonify({
            "status": "success",
            "skill": skill_name,
            "action": "updated",
            "repository": ALLOWED_REPOSITORY,
            "branch": ALLOWED_BRANCH,
            "commit": commit_sha.lower(),
        }), 200

    if event == "release":
        release = payload.get("release")
        release_tag = release.get("tag_name") if isinstance(release, dict) else None
        return jsonify({
            "status": "success",
            "event": "release",
            "repository": ALLOWED_REPOSITORY,
            "tag": release_tag,
        }), 200

    return jsonify({"status": "ignored", "event": event}), 200


@app.route("/health", methods=["GET"])
def health():
    """Expose configuration health without disclosing secret values."""
    if not configuration_is_valid():
        return jsonify({"status": "not_configured"}), 503
    return jsonify({"status": "healthy", "service": "openclaw-github-webhook"}), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    host = os.getenv("WEBHOOK_HOST", "127.0.0.1")
    print(f"Starting GitHub webhook handler on {host}:{port}")
    app.run(host=host, port=port, debug=False)

import hashlib
import hmac
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HANDLER_PATH = Path(__file__).resolve().parents[1] / "webhook-handler.py"
HANDLER_SPEC = importlib.util.spec_from_file_location("webhook_handler", HANDLER_PATH)
handler = importlib.util.module_from_spec(HANDLER_SPEC)
HANDLER_SPEC.loader.exec_module(handler)


class WebhookHandlerTests(unittest.TestCase):
    def setUp(self):
        self.original = {
            "GITHUB_SECRET": handler.GITHUB_SECRET,
            "ALLOWED_REPOSITORY": handler.ALLOWED_REPOSITORY,
            "OPENCLAW_PATH": handler.OPENCLAW_PATH,
            "SKILLS_DIR": handler.SKILLS_DIR,
            "testing": handler.app.config.get("TESTING"),
        }
        self.temp_dir = tempfile.TemporaryDirectory()
        handler.GITHUB_SECRET = "s" * 32
        handler.ALLOWED_REPOSITORY = "s7cret/binance-enhanced"
        handler.OPENCLAW_PATH = "openclaw-test-double"
        handler.SKILLS_DIR = self.temp_dir.name
        handler.app.config["TESTING"] = True
        self.client = handler.app.test_client()

    def tearDown(self):
        handler.GITHUB_SECRET = self.original["GITHUB_SECRET"]
        handler.ALLOWED_REPOSITORY = self.original["ALLOWED_REPOSITORY"]
        handler.OPENCLAW_PATH = self.original["OPENCLAW_PATH"]
        handler.SKILLS_DIR = self.original["SKILLS_DIR"]
        handler.app.config["TESTING"] = self.original["testing"]
        self.temp_dir.cleanup()

    def post_event(self, event="push", payload=None, secret=None):
        if payload is None:
            payload = {
                "repository": {
                    "full_name": "s7cret/binance-enhanced",
                    "clone_url": "https://attacker.example/other.git",
                },
                "ref": "refs/heads/main",
                "after": "a" * 40,
            }
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        signing_secret = handler.GITHUB_SECRET if secret is None else secret
        signature = "sha256=" + hmac.new(
            signing_secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
        return self.client.post(
            "/webhook/github",
            data=body,
            content_type="application/json",
            headers={
                "X-GitHub-Event": event,
                "X-Hub-Signature-256": signature,
            },
        )

    def test_empty_secret_cannot_validate_empty_key_signature(self):
        body = b"{}"
        signature = "sha256=" + hmac.new(b"", body, hashlib.sha256).hexdigest()
        self.assertFalse(handler.verify_signature(body, "", signature))

    def test_missing_or_short_secret_fails_closed(self):
        handler.GITHUB_SECRET = "short"
        response = self.post_event(secret="short")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.client.get("/health").status_code, 503)

    def test_missing_repository_allowlist_fails_closed(self):
        handler.ALLOWED_REPOSITORY = ""
        response = self.post_event()
        self.assertEqual(response.status_code, 503)

    def test_invalid_signature_does_not_update(self):
        with mock.patch.object(handler, "update_skill") as update:
            response = self.client.post(
                "/webhook/github",
                data=b"{}",
                content_type="application/json",
                headers={"X-GitHub-Event": "push", "X-Hub-Signature-256": "sha256=" + "0" * 64},
            )
        self.assertEqual(response.status_code, 401)
        update.assert_not_called()

    def test_signed_payload_from_other_repository_is_rejected(self):
        payload = {
            "repository": {"full_name": "attacker/other", "clone_url": "https://attacker.example/x.git"},
            "ref": "refs/heads/main",
            "after": "a" * 40,
        }
        with mock.patch.object(handler, "update_skill") as update:
            response = self.post_event(payload=payload)
        self.assertEqual(response.status_code, 403)
        update.assert_not_called()

    def test_non_main_push_is_ignored(self):
        payload = {
            "repository": {"full_name": "s7cret/binance-enhanced"},
            "ref": "refs/heads/attacker-branch",
            "after": "a" * 40,
        }
        with mock.patch.object(handler, "update_skill") as update:
            response = self.post_event(payload=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["status"], "ignored")
        update.assert_not_called()

    def test_invalid_commit_sha_is_rejected(self):
        payload = {
            "repository": {"full_name": "s7cret/binance-enhanced"},
            "ref": "refs/heads/main",
            "after": "not-a-commit",
        }
        with mock.patch.object(handler, "update_skill") as update:
            response = self.post_event(payload=payload)
        self.assertEqual(response.status_code, 400)
        update.assert_not_called()

    def test_deleted_main_branch_is_ignored(self):
        payload = {
            "repository": {"full_name": "s7cret/binance-enhanced"},
            "ref": "refs/heads/main",
            "after": "0" * 40,
        }
        with mock.patch.object(handler, "update_skill") as update:
            response = self.post_event(payload=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["reason"], "branch deletion")
        update.assert_not_called()

    def test_valid_push_updates_only_allowlisted_skill_and_commit(self):
        payload = {
            "repository": {
                "full_name": "s7cret/binance-enhanced",
                "clone_url": "https://attacker.example/other.git",
            },
            "ref": "refs/heads/main",
            "after": "A" * 40,
        }
        with mock.patch.object(handler, "update_skill") as update:
            response = self.post_event(payload=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["commit"], "a" * 40)
        update.assert_called_once_with("binance-enhanced", "a" * 40)

    def test_stale_push_delivery_is_ignored(self):
        with mock.patch.object(handler, "update_skill", return_value=False) as update:
            response = self.post_event()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["status"], "ignored")
        update.assert_called_once_with("binance-enhanced", "a" * 40)

    def test_release_event_is_acknowledged_without_updating(self):
        payload = {
            "repository": {"full_name": "s7cret/binance-enhanced"},
            "release": {"tag_name": "v1.2.3"},
        }
        with mock.patch.object(handler, "update_skill") as update:
            response = self.post_event(event="release", payload=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["tag"], "v1.2.3")
        update.assert_not_called()

    def test_update_checks_out_exact_commit_without_running_installer_or_changing_cwd(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            remote = root / "remote.git"
            skills = root / "skills"
            source.mkdir()

            subprocess.run(["git", "init", str(source)], check=True, capture_output=True)
            subprocess.run(["git", "-C", str(source), "config", "user.email", "test@example.com"], check=True)
            subprocess.run(["git", "-C", str(source), "config", "user.name", "Webhook Test"], check=True)
            (source / "README.md").write_text("trusted test content\n", encoding="utf-8")
            (source / "install.sh").write_text(
                "#!/bin/sh\nprintf ran > installer-ran\n", encoding="utf-8"
            )
            subprocess.run(["git", "-C", str(source), "add", "README.md", "install.sh"], check=True)
            subprocess.run(["git", "-C", str(source), "commit", "-m", "fixture"], check=True, capture_output=True)
            subprocess.run(["git", "-C", str(source), "branch", "-M", "main"], check=True)
            subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
            subprocess.run(["git", "-C", str(remote), "symbolic-ref", "HEAD", "refs/heads/main"], check=True)
            subprocess.run(["git", "-C", str(source), "remote", "add", "origin", remote.as_uri()], check=True)
            subprocess.run(["git", "-C", str(source), "push", "-u", "origin", "main"], check=True, capture_output=True)
            commit_sha = subprocess.run(
                ["git", "-C", str(source), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()

            original_run = subprocess.run
            commands = []

            def run_with_openclaw_double(command, *args, **kwargs):
                commands.append(command)
                if command[0] == "openclaw-test-double":
                    return subprocess.CompletedProcess(command, 0)
                return original_run(command, *args, **kwargs)

            previous_cwd = os.getcwd()
            with (
                mock.patch.object(handler, "ALLOWED_REPOSITORY", "testowner/testskill"),
                mock.patch.object(handler, "OPENCLAW_PATH", "openclaw-test-double"),
                mock.patch.object(handler, "SKILLS_DIR", str(skills)),
                mock.patch.object(handler, "repository_url", return_value=remote.as_uri()),
                mock.patch.object(handler.subprocess, "run", side_effect=run_with_openclaw_double),
            ):
                self.assertTrue(handler.update_skill("testskill", commit_sha))

                (source / "README.md").write_text("new main tip\n", encoding="utf-8")
                original_run(["git", "-C", str(source), "add", "README.md"], check=True)
                original_run(
                    ["git", "-C", str(source), "commit", "-m", "advance main"],
                    check=True,
                    capture_output=True,
                )
                original_run(
                    ["git", "-C", str(source), "push", "origin", "main"],
                    check=True,
                    capture_output=True,
                )
                new_commit_sha = original_run(
                    ["git", "-C", str(source), "rev-parse", "HEAD"],
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout.strip()
                self.assertTrue(handler.update_skill("testskill", new_commit_sha))
                self.assertFalse(handler.update_skill("testskill", commit_sha))

            skill_dir = skills / "testskill"
            actual_sha = subprocess.run(
                ["git", "-C", str(skill_dir), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            self.assertEqual(actual_sha, new_commit_sha)
            self.assertFalse((skill_dir / "installer-ran").exists())
            self.assertFalse(any("install.sh" in command for command in commands))
            self.assertEqual(
                sum(command[0] == "openclaw-test-double" for command in commands), 2
            )
            self.assertEqual(os.getcwd(), previous_cwd)


if __name__ == "__main__":
    unittest.main()

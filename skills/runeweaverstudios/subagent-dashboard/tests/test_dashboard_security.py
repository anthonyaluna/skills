import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


DASHBOARD_PATH = Path(__file__).parents[1] / "scripts" / "dashboard.py"
SPEC = importlib.util.spec_from_file_location("subagent_dashboard", DASHBOARD_PATH)
dashboard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(dashboard)


class DashboardSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.base = Path(self.temp_dir.name)
        self.workspace = self.base / "workspace"
        self.workspace.mkdir()
        self.outside_file = self.base / "outside.txt"
        self.outside_file.write_text("outside", encoding="utf-8")

        workspace_patch = patch.object(dashboard, "WORKSPACE_PATH", self.workspace)
        workspace_patch.start()
        self.addCleanup(workspace_patch.stop)

        dashboard.app.config.update(TESTING=True)
        self.client = dashboard.app.test_client()

    @staticmethod
    def same_origin_headers():
        return {
            "Origin": "http://localhost",
            "Sec-Fetch-Site": "same-origin",
        }

    def test_api_rejects_non_loopback_host_and_peer(self):
        bad_host = self.client.get(
            "/api/files/tree",
            headers={"Host": "dashboard.attacker.test"},
        )
        malformed_host = self.client.get(
            "/api/files/tree",
            headers={"Host": "localhost:8080:attacker"},
        )
        bad_peer = self.client.get(
            "/api/files/tree",
            environ_overrides={"REMOTE_ADDR": "192.0.2.10"},
        )

        self.assertEqual(bad_host.status_code, 403)
        self.assertEqual(malformed_host.status_code, 403)
        self.assertEqual(bad_peer.status_code, 403)

    def test_unsafe_api_rejects_missing_origin_and_ui_cannot_be_framed(self):
        with patch.object(dashboard.subprocess, "run") as run_git:
            missing_origin = self.client.post("/api/git/pull", json={})
            self.assertEqual(missing_origin.status_code, 403)
            run_git.assert_not_called()

        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(
            response.headers["Content-Security-Policy"],
            "frame-ancestors 'none'",
        )

    def test_api_rejects_cross_origin_requests_and_emits_no_cors_header(self):
        with patch.object(dashboard.subprocess, "run") as run_git:
            cross_origin = self.client.post(
                "/api/git/pull",
                json={},
                headers={
                    "Origin": "http://attacker.test",
                    "Sec-Fetch-Site": "cross-site",
                },
            )
            self.assertEqual(cross_origin.status_code, 403)
            run_git.assert_not_called()

        same_origin = self.client.get(
            "/api/files/tree",
            headers={
                "Origin": "http://localhost",
                "Sec-Fetch-Site": "same-origin",
            },
        )
        self.assertEqual(same_origin.status_code, 200)
        self.assertNotIn("Access-Control-Allow-Origin", same_origin.headers)

    def test_file_apis_reject_parent_traversal_and_absolute_roots(self):
        original_outside_content = self.outside_file.read_text(encoding="utf-8")
        encoded_traversal = self.client.get(
            "/api/files/content?path=%2e%2e%2Foutside.txt"
        )
        windows_traversal = self.client.get(
            "/api/files/content",
            query_string={"path": r"..\outside.txt"},
        )
        absolute_root = self.client.get(
            "/api/files/tree",
            query_string={"root": str(self.base)},
        )
        traversal_root = self.client.get(
            "/api/files/tree",
            query_string={"root": "../"},
        )
        write_outside = self.client.put(
            "/api/files/content",
            json={"path": "../outside.txt", "content": "changed"},
            headers=self.same_origin_headers(),
        )
        delete_outside = self.client.delete(
            "/api/files/content",
            json={"path": "../outside.txt"},
            headers=self.same_origin_headers(),
        )
        rename_outside = self.client.post(
            "/api/files/rename",
            json={"oldPath": "inside.txt", "newPath": "../outside.txt"},
            headers=self.same_origin_headers(),
        )
        windows_absolute = self.client.put(
            "/api/files/content",
            json={"path": r"C:\Windows\win.ini", "content": "changed"},
            headers=self.same_origin_headers(),
        )

        for response in (
            encoded_traversal,
            windows_traversal,
            absolute_root,
            traversal_root,
            write_outside,
            delete_outside,
            rename_outside,
            windows_absolute,
        ):
            self.assertEqual(response.status_code, 400)
        self.assertEqual(
            self.outside_file.read_text(encoding="utf-8"),
            original_outside_content,
        )

    def test_file_api_keeps_valid_workspace_operations(self):
        create = self.client.put(
            "/api/files/content",
            json={"path": "nested/new.txt", "content": "safe"},
            headers=self.same_origin_headers(),
        )
        read = self.client.get(
            "/api/files/content",
            query_string={"path": "nested/new.txt"},
        )
        rename = self.client.post(
            "/api/files/rename",
            json={"oldPath": "nested/new.txt", "newPath": "nested/moved.txt"},
            headers=self.same_origin_headers(),
        )
        tree = self.client.get(
            "/api/files/tree",
            query_string={"root": "nested"},
        )
        delete = self.client.delete(
            "/api/files/content",
            json={"path": "nested/moved.txt"},
            headers=self.same_origin_headers(),
        )

        self.assertEqual(create.status_code, 200)
        self.assertEqual(read.get_json()["content"], "safe")
        self.assertEqual(rename.status_code, 200)
        self.assertEqual(tree.status_code, 200)
        self.assertEqual(tree.get_json()[0]["name"], "moved.txt")
        self.assertEqual(delete.status_code, 200)
        self.assertFalse((self.workspace / "nested" / "moved.txt").exists())

    def test_file_api_rejects_symlink_escape_and_tree_skips_link(self):
        link = self.workspace / "external"
        try:
            link.symlink_to(self.base, target_is_directory=True)
        except (OSError, NotImplementedError) as exc:
            if os.name != "nt":
                self.skipTest("symlink creation is unavailable: {0}".format(exc))
            junction = subprocess.run(
                ["cmd.exe", "/c", "mklink", "/J", str(link), str(self.base)],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if junction.returncode != 0:
                self.skipTest(
                    "symlink and junction creation are unavailable: {0}".format(
                        junction.stderr or junction.stdout
                    )
                )

        read = self.client.get(
            "/api/files/content",
            query_string={"path": "external/outside.txt"},
        )
        write = self.client.put(
            "/api/files/content",
            json={"path": "external/new.txt", "content": "changed"},
            headers=self.same_origin_headers(),
        )
        delete = self.client.delete(
            "/api/files/content",
            json={"path": "external/outside.txt"},
            headers=self.same_origin_headers(),
        )
        tree = self.client.get("/api/files/tree")

        self.assertEqual(read.status_code, 400)
        self.assertEqual(write.status_code, 400)
        self.assertEqual(delete.status_code, 400)
        self.assertEqual(self.outside_file.read_text(encoding="utf-8"), "outside")
        self.assertNotIn("external", [entry["name"] for entry in tree.get_json()])

    def test_git_status_rejects_paths_outside_workspace_before_subprocess(self):
        with patch.object(dashboard.subprocess, "run") as run_git:
            response = self.client.get(
                "/api/git/status",
                query_string={"path": "../"},
            )

        self.assertEqual(response.status_code, 400)
        run_git.assert_not_called()

    def test_git_status_uses_configured_workspace(self):
        (self.workspace / "project").mkdir()
        with patch.object(
            dashboard.subprocess,
            "run",
            return_value=SimpleNamespace(returncode=0, stdout="## main\n", stderr=""),
        ) as run_git:
            response = self.client.get(
                "/api/git/status",
                query_string={"path": "project"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(run_git.call_args.kwargs["cwd"], str(self.workspace / "project"))

    def test_git_pathspecs_are_confined_and_options_are_separated(self):
        with patch.object(
            dashboard.subprocess,
            "run",
            return_value=SimpleNamespace(returncode=0, stderr=""),
        ) as run_git:
            response = self.client.post(
                "/api/git/stage",
                json={"paths": ["--all"]},
                headers=self.same_origin_headers(),
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(run_git.call_args.args[0], ["git", "add", "--", "--all"])
        self.assertEqual(run_git.call_args.kwargs["cwd"], str(self.workspace))

        with patch.object(dashboard.subprocess, "run") as run_git:
            escape = self.client.post(
                "/api/git/stage",
                json={"paths": ["../../outside.txt"]},
                headers=self.same_origin_headers(),
            )
        self.assertEqual(escape.status_code, 400)
        run_git.assert_not_called()

    def test_git_rejects_option_like_branch_before_subprocess(self):
        with patch.object(dashboard.subprocess, "run") as run_git:
            response = self.client.post(
                "/api/git/checkout",
                json={"branch": "--orphan"},
                headers=self.same_origin_headers(),
            )

        self.assertEqual(response.status_code, 400)
        run_git.assert_not_called()


if __name__ == "__main__":
    unittest.main()

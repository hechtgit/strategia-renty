"""Regresia pre chýbajúci binárny WebKit po aktualizácii Playwrightu."""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


SPEC = importlib.util.spec_from_file_location("e2e_app", Path(__file__).with_name("e2e_app.py"))
assert SPEC and SPEC.loader
e2e_app = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(e2e_app)


class BrowserInstallTest(unittest.TestCase):
    def test_missing_webkit_is_installed_before_launch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            browser_type = Mock(executable_path=str(Path(directory) / "pw_run.sh"))
            with patch.object(e2e_app.subprocess, "run") as install:
                browser = e2e_app.launch_browser(browser_type, "webkit")

        install.assert_called_once_with(
            [sys.executable, "-m", "playwright", "install", "webkit"], check=True
        )
        browser_type.launch.assert_called_once_with(headless=True)
        self.assertIs(browser, browser_type.launch.return_value)

    def test_installed_webkit_is_not_downloaded_again(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "pw_run.sh"
            executable.touch()
            browser_type = Mock(executable_path=str(executable))
            with patch.object(e2e_app.subprocess, "run") as install:
                e2e_app.launch_browser(browser_type, "webkit")

        install.assert_not_called()
        browser_type.launch.assert_called_once_with(headless=True)


if __name__ == "__main__":
    unittest.main()

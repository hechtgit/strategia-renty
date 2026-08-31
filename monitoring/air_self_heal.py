#!/usr/bin/env python3
"""Deterministický dohľad a bezpečne ohraničená samooprava na MacBooku Air."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATE_ROOT = Path.home() / ".local" / "state" / "strategia-renty-self-heal"
STATE_FILE = STATE_ROOT / "state.json"
LOG_DIR = STATE_ROOT / "logs"
LOCK_FILE = STATE_ROOT / "run.lock"
REMOTE = "origin"
BRANCH = "main"
MAX_REPAIR_ATTEMPTS = 3
PATH_VALUE = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PYTHON = sys.executable


@dataclass
class Check:
    name: str
    command: list[str]
    live: bool = False
    auto_fixable: bool = True


CHECKS = [
    Check("build", [PYTHON, "zostav.py"], auto_fixable=False),
    Check("generated-sync", ["git", "diff", "--exit-code", "--", "cara-zivota.html", "vysledok.html"], auto_fixable=False),
    Check("shared-core", ["node", "tests/shared-core-parity.mjs"], auto_fixable=False),
    Check("frontend-contract", ["node", "tests/frontend-review-fixes.mjs"]),
    Check("direct-input-static", ["node", "tests/direct-input-controls.mjs"]),
    Check("cma", ["node", "tests/cma-view.mjs"], auto_fixable=False),
    Check("channel-consistency", ["node", "audit-konzistencia-kanalov.mjs"], auto_fixable=False),
    Check("financial-core", ["node", "audit-financne-jadro.mjs"], auto_fixable=False),
    Check("ui-contract", ["node", "audit-ui-kontrakt.mjs"]),
    Check("pdf", ["node", "audit-pdf-alternativa.mjs"], auto_fixable=False),
    Check("local-browser", [PYTHON, "tests/e2e_app.py", "--target", "local", "--browser", "chromium"]),
    Check("local-webkit", [PYTHON, "tests/e2e_app.py", "--target", "local", "--browser", "webkit"]),
    Check("live-browser", [PYTHON, "tests/e2e_app.py", "--target", "live", "--browser", "chromium"], live=True),
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def env() -> dict[str, str]:
    value = dict(os.environ)
    value["PATH"] = PATH_VALUE
    value["PYTHONUNBUFFERED"] = "1"
    return value


def run(command: list[str], cwd: Path, timeout: int = 900) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, env=env(), text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          timeout=timeout, check=False)


def atomic_json(path: Path, value: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_state() -> dict[str, object]:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def fingerprint(root: Path) -> str:
    proc = run(["git", "rev-parse", "HEAD"], root)
    payload = proc.stdout.strip() if proc.returncode == 0 else "unknown"
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def execute_checks(root: Path, include_live: bool = True) -> tuple[list[dict[str, object]], Check | None]:
    results: list[dict[str, object]] = []
    for check in CHECKS:
        if check.live and not include_live:
            continue
        started = time.monotonic()
        proc = run(check.command, root)
        item = {
            "name": check.name,
            "returncode": proc.returncode,
            "seconds": round(time.monotonic() - started, 2),
            "output": proc.stdout[-12_000:],
        }
        results.append(item)
        if proc.returncode:
            time.sleep(2)
            retry = run(check.command, root)
            item["retry_returncode"] = retry.returncode
            item["retry_output"] = retry.stdout[-12_000:]
            if retry.returncode:
                return results, check
    return results, None


def changed_paths(root: Path) -> list[str]:
    proc = run(["git", "status", "--porcelain"], root)
    return [line[3:] for line in proc.stdout.splitlines() if len(line) > 3]


def safe_diff(paths: list[str]) -> tuple[bool, str]:
    blocked_parts = {"data", ".github", "monitoring", "secrets"}
    allowed_suffixes = (".html", ".js", ".mjs", ".css", ".py")
    for path in paths:
        clean = path.split(" -> ")[-1]
        parts = set(Path(clean).parts)
        if parts & blocked_parts or any(part.startswith(".env") for part in parts) or not clean.endswith(allowed_suffixes):
            return False, f"Automatická oprava zasiahla nepovolenú cestu: {clean}"
    return bool(paths), ""


def repair_prompt(failed: Check, output: str, base: str) -> str:
    return f"""Oprav reprodukovateľnú technickú chybu v aplikácii Stratégia privátnej renty.

Zlyhaná kontrola: {failed.name}
Výchozí commit: {base}
Výstup kontroly:
{output[-8000:]}

Pravidlá:
- Ide iba o lokálny izolovaný git worktree. Produkciu, remote ani git históriu nemeň.
- Najprv chybu reprodukuj. Potom oprav najmenší jednoznačný technický problém a pridaj alebo uprav regresný test.
- Nemeň finančnú metodiku, vzorce, CMA dáta, právne texty, bezpečnostné hranice, formuláre ani produktovú logiku.
- Nepoužívaj osobné údaje a neposielaj formuláre. Testuj iba syntetické hodnoty.
- Edituj mastre, nie iba generované súbory; po zmene spusti python3 zostav.py.
- Nespúšťaj git commit, push ani deploy. Na konci stručne uveď príčinu, zmenené súbory a testy.
"""


def attempt_repair(failed: Check, failure_output: str) -> tuple[bool, dict[str, object]]:
    if not failed.auto_fixable:
        return False, {"blocked": f"Kontrola {failed.name} chráni metodiku alebo generovanie a nepatrí do automatickej opravy."}
    fetch = run(["git", "fetch", REMOTE, BRANCH], ROOT)
    if fetch.returncode:
        return False, {"blocked": "Nepodarilo sa načítať origin/main.", "output": fetch.stdout}
    base_proc = run(["git", "rev-parse", f"{REMOTE}/{BRANCH}"], ROOT)
    base = base_proc.stdout.strip()
    worktrees = STATE_ROOT / "worktrees"
    worktrees.mkdir(parents=True, exist_ok=True)
    worktree = Path(tempfile.mkdtemp(prefix="repair-", dir=worktrees))
    branch = f"self-heal/{int(time.time())}"
    add = run(["git", "worktree", "add", "-b", branch, str(worktree), base], ROOT)
    if add.returncode:
        shutil.rmtree(worktree, ignore_errors=True)
        return False, {"blocked": "Nepodarilo sa vytvoriť opravný worktree.", "output": add.stdout}
    report: dict[str, object] = {"base": base, "branch": branch, "worktree": str(worktree)}
    try:
        prompt = repair_prompt(failed, failure_output, base)
        last_message = worktree / ".self-heal-last-message.txt"
        codex = subprocess.run(
            ["/opt/homebrew/bin/codex", "exec", "--ephemeral", "--sandbox", "workspace-write",
             "-c", 'approval_policy="never"', "-C", str(worktree), "-o", str(last_message), "-"],
            input=prompt, cwd=worktree, env=env(), text=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, timeout=2700, check=False)
        report["codex_returncode"] = codex.returncode
        report["codex_output"] = codex.stdout[-12_000:]
        if codex.returncode:
            return False, report
        paths = changed_paths(worktree)
        safe, reason = safe_diff(paths)
        report["changed_paths"] = paths
        if not safe:
            report["blocked"] = reason or "Codex nevytvoril žiadnu opravu."
            return False, report
        results, still_failed = execute_checks(worktree, include_live=False)
        report["validation"] = results
        if still_failed:
            report["blocked"] = f"Oprava neprešla kontrolou {still_failed.name}."
            return False, report
        if run(["git", "rev-parse", f"{REMOTE}/{BRANCH}"], ROOT).stdout.strip() != base:
            report["blocked"] = "Origin/main sa počas opravy zmenil; oprava sa nenasadila."
            return False, report
        commit = run(["git", "add", "--all"], worktree)
        if commit.returncode:
            report["blocked"] = commit.stdout
            return False, report
        commit = run(["git", "commit", "-m", f"Self-heal: repair {failed.name}"], worktree)
        if commit.returncode:
            report["blocked"] = commit.stdout
            return False, report
        new_head = run(["git", "rev-parse", "HEAD"], worktree).stdout.strip()
        push = run(["git", "push", REMOTE, f"{new_head}:refs/heads/{BRANCH}"], worktree, timeout=300)
        report["push_output"] = push.stdout
        report["new_head"] = new_head
        if push.returncode:
            return False, report
        # GitHub Pages môže nasadzovať niekoľko minút. Za úspech sa ráta až živý test.
        for wait_seconds in (30, 60, 90, 120, 180):
            time.sleep(wait_seconds)
            live_results, live_failed = execute_checks(worktree, include_live=True)
            live_only = [item for item in live_results if item["name"] == "live-browser"]
            report["live_validation"] = live_only
            if not live_failed:
                return True, report
        report["blocked"] = "Oprava prešla lokálne, ale živá stránka ju nepotvrdila."
        remote_now = run(["git", "ls-remote", REMOTE, f"refs/heads/{BRANCH}"], worktree).stdout.split()
        if remote_now and remote_now[0] == new_head:
            revert = run(["git", "revert", "--no-edit", new_head], worktree)
            report["rollback_output"] = revert.stdout
            if revert.returncode == 0:
                rollback_head = run(["git", "rev-parse", "HEAD"], worktree).stdout.strip()
                rollback_push = run(["git", "push", REMOTE, f"{rollback_head}:refs/heads/{BRANCH}"], worktree)
                report["rollback_push_output"] = rollback_push.stdout
                report["rolled_back"] = rollback_push.returncode == 0
                if rollback_push.returncode:
                    report["critical"] = "Rollback push zlyhal; nasadená oprava nie je potvrdená živým testom."
            else:
                report["critical"] = "Git revert zlyhal; nasadená oprava nie je potvrdená živým testom."
        else:
            report["rollback_blocked"] = "Origin/main sa po nasadení zmenil; automatický rollback by nebol bezpečný."
            report["critical"] = report["rollback_blocked"]
        return False, report
    finally:
        run(["git", "worktree", "remove", "--force", str(worktree)], ROOT)
        run(["git", "branch", "-D", branch], ROOT)
        shutil.rmtree(worktree, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-repair", action="store_true")
    parser.add_argument("--skip-live", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    STATE_ROOT.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with LOCK_FILE.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0

        if args.self_test:
            assert safe_diff(["vylepsenia.js", "tests/direct-input-controls.mjs"])[0]
            assert not safe_diff(["data/cma-assumptions.json"])[0]
            assert not safe_diff(["monitoring/air_self_heal.py"])[0]
            assert not safe_diff(["src/data/metodika.js"])[0]
            print("OK: zámok, hranice samoopravy a fail-closed politika fungujú.")
            return 0

        state = read_state()
        started = now()
        results, failed = execute_checks(ROOT, include_live=not args.skip_live)
        payload: dict[str, object] = {
            "started_at": started,
            "finished_at": now(),
            "head_fingerprint": fingerprint(ROOT),
            "checks": results,
            "status": "healthy" if not failed else "failed",
        }
        if not failed:
            payload["consecutive_failures"] = 0
            payload["last_success_at"] = now()
            atomic_json(STATE_FILE, payload)
            return 0

        consecutive = int(state.get("consecutive_failures", 0)) + 1
        payload["consecutive_failures"] = consecutive
        payload["failed_check"] = failed.name
        failure_output = str(results[-1].get("retry_output") or results[-1].get("output") or "")
        if not args.no_repair:
            repaired, report = attempt_repair(failed, failure_output)
            payload["repair"] = report
            payload["status"] = "repaired" if repaired else "repair_failed"
            if repaired:
                payload["consecutive_failures"] = 0
                payload["last_success_at"] = now()
            if report.get("critical"):
                payload["needs_attention"] = True
        if consecutive >= MAX_REPAIR_ATTEMPTS and payload["status"] != "repaired":
            payload["needs_attention"] = True
        atomic_json(STATE_FILE, payload)
        return 0 if payload["status"] == "repaired" else 1


if __name__ == "__main__":
    raise SystemExit(main())

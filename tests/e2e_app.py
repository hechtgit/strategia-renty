#!/usr/bin/env python3
"""Browserový kontrakt klientskej aplikácie bez osobných údajov.

Testuje reálne ovládanie, nie iba prítomnosť kódu. Dá sa spustiť proti lokálne
zostavenej stránke aj proti živej stránke vloženej v Squarespace.
"""
from __future__ import annotations

import argparse
import datetime
import ipaddress
import json
import re
import ssl
import sys
import tempfile
import time
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from typing import Iterator
from urllib.parse import urljoin

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from playwright.sync_api import Browser, BrowserContext, Frame, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
LIVE_URL = "https://www.hechtberger.com/strategia-privatnej-renty"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args: object) -> None:
        return


def _generate_local_tls_cert(directory: Path) -> tuple[Path, Path]:
    """Krátkodobý samopodpísaný certifikát pre 127.0.0.1.

    Appka si cez CSP (upgrade-insecure-requests) vynucuje zabezpečené
    pripojenie a WebKit toto pravidlo dodrží doslovne aj na 127.0.0.1 —
    bez skutočného TLS by sa jej skripty v lokálnej skúške vôbec nenačítali.
    """
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "127.0.0.1")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(hours=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    cert_path = directory / "local-e2e-cert.pem"
    key_path = directory / "local-e2e-key.pem"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )
    return cert_path, key_path


@contextmanager
def local_server() -> Iterator[str]:
    class Handler(QuietHandler):
        def __init__(self, *args: object, **kwargs: object) -> None:
            super().__init__(*args, directory=str(ROOT), **kwargs)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    with tempfile.TemporaryDirectory() as cert_dir:
        try:
            cert_path, key_path = _generate_local_tls_cert(Path(cert_dir))
        except Exception as exc:
            server.server_close()
            raise RuntimeError(
                "Lokálny testovací server potrebuje certifikát pre HTTPS "
                "(appka si to cez CSP vynucuje aj na 127.0.0.1) a jeho "
                f"vygenerovanie zlyhalo: {exc}"
            ) from exc
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
        server.socket = ssl_context.wrap_socket(server.socket, server_side=True)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"https://127.0.0.1:{server.server_port}/cara-zivota.html?frame=1"
        finally:
            server.shutdown()
            thread.join(timeout=3)


def number(text: str) -> float:
    clean = re.sub(r"[^0-9,.-]", "", re.sub(r"[\s\u00a0\u202f]", "", text))
    return float(clean.replace(",", "."))


def app_frame(page: Page, direct: bool) -> Frame:
    if direct:
        return page.main_frame
    page.wait_for_selector('iframe[src*="cara-zivota"]', timeout=30_000)
    stable_url = ""
    stable_count = 0
    for _ in range(120):
        for frame in page.frames:
            if "cara-zivota" in frame.url and not frame.is_detached():
                frame.wait_for_selector("#c-today", timeout=20_000)
                if frame.url == stable_url:
                    stable_count += 1
                else:
                    stable_url, stable_count = frame.url, 1
                if stable_count >= 3:
                    return frame
        page.wait_for_timeout(250)
    raise AssertionError("Nenašiel sa rám živej aplikácie.")


def set_exact(frame: Frame, value_id: str, expected: float) -> None:
    display = frame.locator(f"#{value_id}")
    display.scroll_into_view_if_needed()
    display.click()
    field = display.locator("input")
    field.fill(str(expected).replace(".", ","))
    field.press("Enter")
    actual = number(display.inner_text())
    assert actual == expected, f"{value_id}: zadané {expected}, zobrazené {actual}"
    display.click()
    reopened = number(display.locator("input").input_value())
    assert reopened == expected, f"{value_id}: po opätovnom otvorení {reopened}, čakalo sa {expected}"
    display.locator("input").press("Escape")


def click(frame: Frame, selector: str) -> None:
    frame.locator(selector).click()


def desktop_contract(page: Page, url: str, direct: bool) -> dict[str, object]:
    page.set_viewport_size({"width": 1440, "height": 900})
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    frame = app_frame(page, direct)
    frame.wait_for_selector("#c-today")

    click(frame, '[data-mode="combo"]')
    click(frame, '[data-combo-dir="known"]')
    set_exact(frame, "combo-v", 123_456)
    set_exact(frame, "monthly-known-v", 2_345)

    click(frame, '[data-sit="have"]')
    set_exact(frame, "c0-v", 765_432)
    click(frame, '[data-goal="duration"]')
    assert frame.locator('[data-goal="duration"]').get_attribute("aria-checked") == "true"
    click(frame, '[data-goal="rent"]')

    click(frame, '[data-sit="build"]')
    click(frame, '[data-mode="lump"]')
    set_exact(frame, "rent-v", 4_321)
    set_exact(frame, "vynos-v", 7.4)
    set_exact(frame, "infl-v", 2.5)
    set_exact(frame, "vynos-rent-v", 5.5)

    click(frame, '[data-pension="perpetuity"]')
    assert frame.locator('[data-pension="perpetuity"]').get_attribute("aria-checked") == "true"
    click(frame, '[data-pension="temporary"]')

    inflation = frame.locator("#in-inflon")
    inflation.uncheck()
    assert inflation.is_checked() is False
    inflation.check()

    before = number(frame.locator("#rent-v").inner_text())
    controls = frame.locator("#rent-v").locator("xpath=..").locator("button")
    controls.last.click()
    after = number(frame.locator("#rent-v").inner_text())
    assert after > before, f"Tlačidlo + pri rente nezvýšilo hodnotu: {before} -> {after}."
    set_exact(frame, "rent-v", 4_321)
    controls.first.click()
    lowered = number(frame.locator("#rent-v").inner_text())
    assert lowered < 4_321, f"Tlačidlo − pri rente neznížilo hodnotu: 4321 -> {lowered}."

    assert not errors, "Chyby JavaScriptu: " + " | ".join(errors)
    return {"exact_inputs": 7, "toggles": 5, "console_errors": 0}


def mobile_contract(page: Page, url: str, direct: bool) -> dict[str, object]:
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    frame = app_frame(page, direct)
    frame.wait_for_selector("#map-start", state="visible")
    frame.locator("#map-start").click()
    frame.wait_for_selector(".mobile-editor-done", state="visible")

    done = frame.locator(".mobile-editor-done")
    box = done.bounding_box()
    assert box, "Tlačidlo Hotovo nemá viditeľný rozmer."
    assert box["y"] >= 0 and box["y"] + box["height"] <= 844, \
        "Tlačidlo Hotovo je mimo mobilného viewportu."
    assert frame.locator("body").evaluate("el => el.classList.contains('mobile-editor-open')")
    done.click()
    assert not frame.locator("body").evaluate("el => el.classList.contains('mobile-editor-open')")
    return {"editor_opened": True, "done_in_viewport": True, "editor_closed": True}


def run(browser: Browser | BrowserContext, url: str, direct: bool) -> dict[str, object]:
    desktop_page = browser.new_page()
    mobile_page = browser.new_page()
    try:
        return {
            "url": url,
            "desktop": desktop_contract(desktop_page, url, direct),
            "mobile": mobile_contract(mobile_page, url, direct),
        }
    finally:
        desktop_page.close()
        mobile_page.close()


def live_app_url(browser: Browser) -> str:
    """Zistí presnú verziu aplikácie, ktorú práve vkladá živý Squarespace."""
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    try:
        page.goto(LIVE_URL, wait_until="domcontentloaded", timeout=60_000)
        deadline = time.monotonic() + 30
        previous = ""
        stable = 0
        while time.monotonic() < deadline:
            iframe = page.locator('iframe[src*="cara-zivota"]').first
            try:
                src = iframe.get_attribute("src", timeout=2_000) or ""
            except Exception:
                src = ""
            if src and src == previous:
                stable += 1
            else:
                previous, stable = src, 1 if src else 0
            if stable >= 3:
                return urljoin(LIVE_URL, src)
            page.wait_for_timeout(500)
        raise AssertionError("Živá stránka nemá stabilný zdroj rámu aplikácie.")
    finally:
        page.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=("local", "live"), default="local")
    parser.add_argument("--browser", choices=("chromium", "webkit"), default="chromium")
    args = parser.parse_args()

    with sync_playwright() as pw:
        browser_type = getattr(pw, args.browser)
        browser = browser_type.launch(headless=True)
        try:
            if args.target == "live":
                deployed_url = live_app_url(browser)
                result = run(browser, deployed_url, direct=True)
                result["landing_url"] = LIVE_URL
            else:
                with local_server() as url:
                    # Lokálny server beží na samopodpísanom certifikáte —
                    # túto výnimku dostane iba tento kontext, nie prehliadač
                    # vyššie použitý pre živú kontrolu (tá musí TLS chyby
                    # na webe naďalej vidieť).
                    context = browser.new_context(ignore_https_errors=True)
                    try:
                        result = run(context, url, direct=True)
                    finally:
                        context.close()
        finally:
            browser.close()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"E2E CHYBA: {exc}", file=sys.stderr)
        raise

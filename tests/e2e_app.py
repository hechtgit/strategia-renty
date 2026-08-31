#!/usr/bin/env python3
"""Browserový kontrakt klientskej aplikácie bez osobných údajov.

Testuje reálne ovládanie, nie iba prítomnosť kódu. Dá sa spustiť proti lokálne
zostavenej stránke aj proti živej stránke vloženej v Squarespace.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from typing import Iterator
from urllib.parse import urljoin

from playwright.sync_api import Browser, Frame, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
LIVE_URL = "https://www.hechtberger.com/strategia-privatnej-renty"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args: object) -> None:
        return


@contextmanager
def local_server() -> Iterator[str]:
    class Handler(QuietHandler):
        def __init__(self, *args: object, **kwargs: object) -> None:
            super().__init__(*args, directory=str(ROOT), **kwargs)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/cara-zivota.html?frame=1"
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
    # Squarespace po načítaní ešte raz skladá blok stránky a môže prvý iframe
    # nahradiť. Počkáme na túto jednorazovú hydratáciu, aby monitor nehlásil
    # odpojený rám ako chybu aplikácie.
    page.wait_for_timeout(4_000)
    for _ in range(120):
        for frame in page.frames:
            if "cara-zivota" in frame.url:
                frame.wait_for_selector("#c-today", timeout=20_000)
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
    frame.locator("#rent-v").locator("xpath=..").locator("button").last.click()
    after = number(frame.locator("#rent-v").inner_text())
    assert after > before, f"Tlačidlo + pri rente nezvýšilo hodnotu: {before} -> {after}."

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


def run(browser: Browser, url: str, direct: bool) -> dict[str, object]:
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
        iframe = page.locator('iframe[src*="cara-zivota"]').first
        iframe.wait_for(state="attached", timeout=30_000)
        page.wait_for_timeout(4_000)
        src = iframe.get_attribute("src")
        assert src, "Živá stránka nemá zdroj rámu aplikácie."
        return urljoin(LIVE_URL, src)
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
                    result = run(browser, url, direct=True)
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

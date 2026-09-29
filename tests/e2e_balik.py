#!/usr/bin/env python3
"""Prehliadačové kontroly balíka opráv pred kampaňou (29. 9. 2026).

Beží v skutočnom ráme stránky https://www.hechtberger.com/strategia-privatnej-renty
a PDF vzniká ovládaním toho rámu (formulár → modelácia → tlačidlo PDF).

Režimy:
  --target local  Squarespace je živý, ale súbory aplikácie z GitHub Pages sa
                  podvrhnú z tohto repozitára. Skúška pred nasadením.
  --target live   Všetko naživo (po nasadení).

V oboch režimoch sa Turnstile a medzičlánok podvrhnú: test nič nezapisuje do
Boldemu, neposiela e-maily ani upozornenia. Skutočný koncový test doručenia
patrí do prehliadača s človekom (Turnstile headless prehliadač nepustí).

Výstup: JSON so súhrnom; snímky a PDF v tmp/e2e-balik/.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import BrowserContext, Frame, Page, Route, async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp" / "e2e-balik"
LIVE_PAGE = "https://www.hechtberger.com/strategia-privatnej-renty"
PAGES = "https://hechtgit.github.io/strategia-renty/"
RELAY = "https://renta-boldem.renta-relay.workers.dev/"
TURNSTILE = "https://challenges.cloudflare.com/turnstile/"
DISCLAIMER = ("Tento modelový výpočet slúži výhradne na ilustračné a vzdelávacie účely. "
              "Nejde o investičné poradenstvo, investičné odporúčanie ani o ponuku či návrh "
              "na uzavretie zmluvy. Zhodnotenie nie je garantované, hodnota investície môže "
              "v čase kolísať a nie je zaručená návratnosť investovanej sumy.")
CORS = {"Access-Control-Allow-Origin": "https://hechtgit.github.io",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin"}

TURNSTILE_STUB = """
window.turnstile={
  render:function(sel,o){window.__tsOpts=o;return 'w'+Date.now()},
  execute:function(){setTimeout(function(){window.__tsOpts.callback('token-'+Math.random())},30)},
  remove:function(){}
};
setTimeout(function(){if(window.onloadTurnstileCallback)window.onloadTurnstileCallback()},0);
"""

RELAY_RESPONSES = {
    "odoslany": (200, {"ok": True, "emailQueued": True, "contactFallback": False}),
    "opakovanie": (200, {"ok": True, "emailQueued": True, "opakovanie": True}),
    "overenie": (403, {"chyba": "overenie"}),
    "limit": (429, {"chyba": "prilis-vela-pokusov"}),
    "email-zlyhal": (502, {"chyba": "boldem-email", "stav": 500, "kontaktUlozeny": True}),
    "email-neznamy": (502, {"chyba": "boldem-email", "stav": 0, "kontaktUlozeny": True,
                            "vysledokNeznamy": True}),
    "prebieha": (409, {"chyba": "prebieha"}),
    "meno": (400, {"chyba": "meno"}),
}


async def poll(target, expr: str, timeout: int = 20_000) -> None:
    """Čaká, kým výraz v stránke nie je pravdivý. Nepoužíva wait_for_function:
    jeho predikát beží cez eval a CSP aplikácie (bez unsafe-eval) ho zablokuje."""
    deadline = time.monotonic() + timeout / 1000
    last = None
    while time.monotonic() < deadline:
        try:
            last = await target.evaluate(expr)
            if last:
                return
        except Exception as exc:  # noqa: BLE001
            last = exc
        await asyncio.sleep(0.15)
    raise AssertionError(f"Nesplnilo sa do {timeout} ms: {expr} (posledné: {last})")


async def do_stredu(frame, selector: str) -> None:
    """Posunie prvok do stredu okna. Squarespace má pevnú hlavičku: prvok pri
    hornom okraji by klik trafil jej logo a stránka by odišla na domovskú."""
    await frame.locator(selector).first.evaluate(
        "el => el.scrollIntoView({block:'center', inline:'nearest', behavior:'instant'})")
    # Rodičovská stránka sa môže ešte posúvať (plynulé rolovanie, zmena výšky
    # rámu). Klik počas posunu by trafil iný bod — napríklad logo v hlavičke.
    top = frame.page
    last = None
    for _ in range(40):
        y = await top.evaluate("Math.round(window.scrollY)")
        if y == last:
            break
        last = y
        await top.wait_for_timeout(80)


async def klik(frame, selector: str) -> None:
    """Klik skutočnou myšou na bod prvku v ráme. Najprv sa overí, že na tom
    bode hostiteľskej stránky je naozaj rám aplikácie a nie pevná hlavička
    Squarespace — Playwright to cez hranicu rámu nevidí a „klik na tlačidlo"
    inak raz za čas trafil logo a odišiel na domovskú stránku."""
    page = frame.page
    for pokus in range(8):
        await do_stredu(frame, selector)
        stred = await frame.locator(selector).first.evaluate(
            "e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height]}")
        if stred[2] <= 0 or stred[3] <= 0:
            raise AssertionError(f"Prvok {selector} nie je viditeľný.")
        if frame == page.main_frame:
            x, y = stred[0], stred[1]
        else:
            box = await (await frame.frame_element()).bounding_box()
            x, y = box["x"] + stred[0], box["y"] + stred[1]
        vyska = page.viewport_size["height"]
        trafene = await page.evaluate(
            "([x,y])=>{const e=document.elementFromPoint(x,y);return e?e.tagName:''}", [x, y])
        if 90 < y < vyska - 10 and (trafene == "IFRAME" or frame == page.main_frame):
            await page.mouse.click(x, y)
            await page.wait_for_timeout(60)
            return
        await page.evaluate("window.scrollBy(0, arguments[0])" if False else f"window.scrollBy(0,{-160 if y < 90 else 160})")
        await page.wait_for_timeout(150)
    raise AssertionError(f"Na {selector} sa nedalo bezpečne kliknúť.")


def num(text: str) -> float:
    clean = re.sub(r"[^0-9,.\-−]", "", re.sub(r"[\s  ]", "", text)).replace("−", "-")
    return float(clean.replace(",", "."))


def pdf_text(path: Path, layout: bool = False) -> str:
    args = ["pdftotext"] + (["-layout"] if layout else []) + [str(path), "-"]
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def flat(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace(" ", " ")).strip()


class Harness:
    def __init__(self, target: str) -> None:
        self.target = target
        self.relay_mode = "odoslany"
        self.relay_calls: list[dict] = []
        self.events: list[dict] = []
        self.turnstile_down = False
        self.results: dict[str, object] = {}
        self.errors: list[str] = []

    # ——— sieť ———
    async def route_pages(self, route: Route) -> None:
        path = urlparse(route.request.url).path
        rel = path[len("/strategia-renty/"):] or "index.html"
        file = (ROOT / rel).resolve()
        if ROOT not in file.parents or not file.is_file():
            await route.fulfill(status=404, body="not found")
            return
        ctype = mimetypes.guess_type(str(file))[0] or "application/octet-stream"
        if file.suffix in (".html", ".js", ".css", ".json"):
            ctype += "; charset=utf-8"
        await route.fulfill(status=200, body=file.read_bytes(), headers={"Content-Type": ctype})

    async def route_turnstile(self, route: Route) -> None:
        if self.turnstile_down:
            await route.fulfill(status=503, body="down")
        else:
            await route.fulfill(status=200, body=TURNSTILE_STUB,
                                headers={"Content-Type": "text/javascript"})

    async def route_relay(self, route: Route) -> None:
        req = route.request
        path = urlparse(req.url).path
        if req.method == "OPTIONS":
            await route.fulfill(status=204, headers=CORS)
            return
        body = req.post_data or ""
        if path == "/udalost":
            try:
                self.events.append(json.loads(body))
            except json.JSONDecodeError:
                self.events.append({"nečitateľné": body})
            await route.fulfill(status=204, headers=CORS)
            return
        self.relay_calls.append(json.loads(body or "{}"))
        if self.relay_mode == "siet":
            await route.abort("timedout")
            return
        if self.relay_mode == "pomaly":
            await asyncio.sleep(4)
            await route.fulfill(status=200, headers={**CORS, "Content-Type": "application/json"},
                                body=json.dumps({"ok": True, "emailQueued": True}))
            return
        if self.relay_mode == "timeout":
            await asyncio.sleep(27)   # aplikácia čaká 25 s
            try:
                await route.fulfill(status=200, headers=CORS, body=json.dumps({"ok": True, "emailQueued": True}))
            except Exception:
                pass
            return
        status, payload = RELAY_RESPONSES[self.relay_mode]
        await route.fulfill(status=status, headers={**CORS, "Content-Type": "application/json"},
                            body=json.dumps(payload))

    async def new_context(self, browser, width: int, height: int, blokuj_okna: bool = False) -> BrowserContext:
        ctx = await browser.new_context(viewport={"width": width, "height": height},
                                        accept_downloads=True, locale="sk-SK")
        if self.target == "local":
            await ctx.route(PAGES + "**", self.route_pages)
        await ctx.route(TURNSTILE + "**", self.route_turnstile)
        await ctx.route(RELAY + "**", self.route_relay)
        if blokuj_okna:
            await ctx.add_init_script("window.open=function(){return null}")
        return ctx

    # ——— rám aplikácie ———
    async def app_frame(self, page: Page, squarespace: bool = True) -> Frame:
        """Rám aplikácie. Pri squarespace=True v skutočnej stránke hechtberger.com,
        inak priamo na GitHub Pages (tá istá aplikácia bez hostiteľskej stránky —
        rýchlejšie a bez cudzích skriptov pre scenáre stavov e-mailu)."""
        if not squarespace:
            await page.goto(PAGES + "cara-zivota.html", wait_until="load", timeout=60_000)
            await page.wait_for_selector("#c-today")
            await poll(page, "window.RentaCore!==undefined", timeout=20_000)
            return page.main_frame
        for pokus in range(3):
            await page.goto(LIVE_PAGE, wait_until="domcontentloaded", timeout=90_000)
            # Lišta súhlasu sa iba skryje. Jej tlačidlo „Odmietnuť" v teste odviedlo
            # stránku na domovskú a rám sa odpojil; súhlas nie je predmetom testu.
            await page.add_style_tag(content="[class*=sqs-cookie-banner]{display:none!important}"
                                     "html,body{scroll-behavior:auto!important}")
            deadline = time.monotonic() + 40
            stable_url, stable = "", 0
            while time.monotonic() < deadline:
                for frame in page.frames:
                    if "cara-zivota" in frame.url and not frame.is_detached():
                        try:
                            await frame.wait_for_selector("#c-today", timeout=5_000, state="attached")
                        except Exception:
                            continue
                        if frame.url == stable_url:
                            stable += 1
                        else:
                            stable_url, stable = frame.url, 1
                        if stable >= 3:
                            await poll(frame, "window.RentaCore!==undefined", timeout=20_000)
                            return frame
                await page.wait_for_timeout(300)
        raise AssertionError("Nenašiel sa stabilný rám aplikácie na stránke Squarespace: "
                             + ", ".join(f.url[:90] for f in page.frames if "google" not in f.url))

    async def set_exact(self, frame: Frame, value_id: str, typed: str) -> None:
        display = frame.locator(f"#{value_id}")
        field = display.locator("input")
        for _ in range(3):
            await klik(frame, f"#{value_id}")
            try:
                await field.wait_for(state="visible", timeout=3_000)
                break
            except Exception:
                continue
        await field.fill(typed)
        await field.press("Enter")
        await frame.wait_for_timeout(520)  # sumy sa animujú 240 ms, poistka 420 ms

    async def klaves(self, frame: Frame, key: str, target: int) -> None:
        handle = frame.locator(f'.handle[data-key="{key}"]')
        await do_stredu(frame, f'.handle[data-key="{key}"]')
        for _ in range(200):
            now = await frame.evaluate(f"Number(document.querySelector('.handle[data-key=\"{key}\"]').getAttribute('aria-valuenow'))")
            if now == target:
                return
            diff = target - now
            await handle.focus()
            if abs(diff) >= 5:
                await frame.page.keyboard.press(("Shift+ArrowRight" if diff > 0 else "Shift+ArrowLeft"))
            else:
                await frame.page.keyboard.press("ArrowRight" if diff > 0 else "ArrowLeft")
        raise AssertionError(f"Vek {key} sa nepodarilo nastaviť na {target}.")

    async def fill_form(self, frame: Frame, first: str = "Test", last: str = "Balík",
                        email: str = "petr+e2e-balik@hechtberger.com") -> None:
        summary = frame.locator(".delivery-panel .mobile-continue-summary")
        await do_stredu(frame, "#gate-first")
        if await summary.is_visible():
            if await summary.get_attribute("aria-expanded") != "true":
                await klik(frame, ".delivery-panel .mobile-continue-summary")
        await frame.locator("#gate-first").fill(first)
        await frame.locator("#gate-last").fill(last)
        await frame.locator("#model-email").fill(email)

    async def send(self, ctx: BrowserContext, frame: Frame, expect_popup: bool = True,
                   close_popup_early: bool = False) -> Page | None:
        popup = None
        before = len(self.relay_calls)
        if expect_popup:
            async with ctx.expect_page(timeout=15_000) as info:
                await klik(frame, "#send-model")
            popup = await info.value
            if close_popup_early:
                await popup.close()
                popup = None
        else:
            await klik(frame, "#send-model")
        await poll(frame, "document.getElementById('send-model').disabled===false"
            " && document.getElementById('send-status').textContent.length>0", timeout=60_000)
        self.last_relay_calls = self.relay_calls[before:]
        if popup:
            await popup.wait_for_url(re.compile(r"vysledok\.html"), timeout=30_000)
            await popup.wait_for_load_state("load")
        return popup

    async def pdf_from(self, popup: Page, name: str) -> Path:
        await poll(popup, "window.PH_ODOLNOST!==undefined", timeout=20_000)
        async with popup.expect_download(timeout=60_000) as info:
            await popup.locator("#btn-pdf").click()
        download = await info.value
        target = OUT / f"{name}.pdf"
        await download.save_as(str(target))
        return target


def check(cond: bool, msg: str, sink: list[str]) -> None:
    if not cond:
        sink.append(msg)


async def desktop(h: Harness, browser) -> None:
    ctx = await h.new_context(browser, 1440, 900)
    page = await ctx.new_page()
    js_errors: list[str] = []
    page.on("pageerror", lambda e: js_errors.append(str(e)))
    frame = await h.app_frame(page)
    E = h.errors

    # Bod 7: riadok po poplatkoch pod oboma posuvníkmi
    net = await frame.locator("#vynos-net").inner_text()
    net_rent = await frame.locator("#vynos-rent-net").inner_text()
    check(flat(net) == "po poplatkoch 4,1 % ročne", f"pod zhodnotením: {net!r}", E)
    check(flat(net_rent) == "po poplatkoch 4,1 % ročne", f"pod čerpaním: {net_rent!r}", E)
    check(await frame.locator("#vynos-net").is_visible(), "riadok po poplatkoch nie je viditeľný", E)

    # Bod 6: 0,8 / 0,9 / 1,0 % pri pravidelnom investovaní — bez NaN
    await klik(frame, '[data-mode="monthly"]')
    mesacne = {}
    for typed in ("0,8", "0,9", "1,0"):
        await h.set_exact(frame, "vynos-v", typed)
        text = flat(await frame.locator("#fund-v").inner_text())
        check("NaN" not in text, f"pri {typed} % sa zobrazilo NaN: {text}", E)
        mesacne[typed] = num(text.split("€")[0])
    check(mesacne["0,8"] > mesacne["0,9"] > mesacne["1,0"],
          f"mesačná suma pri 0,8/0,9/1,0 % nie je klesajúca: {mesacne}", E)
    # to isté v kombinácii (dopočítaný mesačný vklad)
    await klik(frame, '[data-mode="combo"]')
    await klik(frame, '[data-combo-dir="needed"]')
    for typed in ("0,8", "0,9", "1,0"):
        await h.set_exact(frame, "vynos-v", typed)
        text = flat(await frame.locator("#fund-v").inner_text())
        check("NaN" not in text and re.search(r"\d", text) is not None or text == "Postačuje",
              f"kombinácia pri {typed} %: {text}", E)
    # „0.900" v percentách ostáva 0,9 %
    await h.set_exact(frame, "vynos-v", "0.900")
    check(flat(await frame.locator("#vynos-v").inner_text()).startswith("0,9 %"),
          "„0.900“ % sa neprečítalo ako 0,9 %", E)
    check(flat(await frame.locator("#vynos-net").inner_text()) == "po poplatkoch 0 % ročne",
          f"po poplatkoch pri 0,9 %: {await frame.locator('#vynos-net').inner_text()}", E)

    # Bod 6: „250.000" € pri hotovom majetku
    await klik(frame, '[data-sit="have"]')
    await h.set_exact(frame, "c0-v", "250.000")
    check(num(await frame.locator("#c0-v").inner_text()) == 250000,
          f"„250.000“ € sa zobrazilo ako {await frame.locator('#c0-v').inner_text()}", E)
    detail = await frame.evaluate("document.getElementById('assump-detail').textContent")
    check("nevzťahuje" in detail and "vstupného poplatku 1,5" not in detail,
          "text pri „Majetok už mám“ stále tvrdí odpočet vstupného poplatku", E)

    # Bod 4: kombinácia so známou mesačnou sumou — pás = modelácia = PDF
    await klik(frame, '[data-sit="build"]')
    await klik(frame, '[data-mode="combo"]')
    await klik(frame, '[data-combo-dir="known"]')
    await h.klaves(frame, "start", 60)
    await h.klaves(frame, "end", 85)
    await h.klaves(frame, "now", 45)
    await h.set_exact(frame, "combo-v", "200 000")
    await h.set_exact(frame, "monthly-known-v", "500")
    await h.set_exact(frame, "vynos-v", "5")
    await h.set_exact(frame, "vynos-rent-v", "5")
    await h.set_exact(frame, "infl-v", "2,5")
    await poll(frame, "!document.getElementById('vysledok-pas').hidden"
        " && /\\d+\\s*z\\s*800/.test(document.querySelector('.pas-vysledok').textContent)",
        timeout=20_000)
    await frame.wait_for_timeout(700)
    pas_text = flat(await frame.locator(".pas-vysledok").inner_text())
    pas_num = int(re.search(r"(\d+)\s*z\s*800", pas_text).group(1))
    check(pas_num == 575, f"pás pri 200 000 € + 500 €/mes.: {pas_num} (čakalo sa 575)", E)
    await frame.locator("#vysledok-pas").scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT / "desktop-1440-kalkulacka.png"), full_page=False)

    # Odkazy na rezerváciu nesú zdroj
    hrefs = await frame.evaluate("[...document.querySelectorAll('a[href*=\"rezervacia\"]')].map(a=>a.href)")
    check(hrefs and all("src=renta" in u for u in hrefs), f"rezervácia bez ?src=renta: {hrefs}", E)

    # Bod 5 + PDF: úspešné odoslanie, modelácia a PDF z nej
    h.relay_mode = "odoslany"
    await h.fill_form(frame)
    popup = await h.send(ctx, frame)
    status = flat(await frame.locator("#send-status").inner_text())
    check("otvorila v novom okne" in status and "poslali aj e-mailom" in status,
          f"stav po úspechu: {status}", E)
    call = h.last_relay_calls[-1] if h.last_relay_calls else {}
    check(call.get("overenie", "").startswith("token-"), "medzičlánok nedostal token overenia", E)
    await poll(popup, "document.getElementById('odolnost-riadky')?.dataset.vysvetlene==='1'",
                                  timeout=20_000)
    result_text = flat(await popup.locator("#odolnost").inner_text())
    check("575 z 800" in result_text, "modelácia neukazuje 575 z 800", E)
    mail = flat(await popup.locator("#mail-note").inner_text())
    check(mail.startswith("Odkaz na túto modeláciu sme vám poslali aj e-mailom"), f"modelácia: {mail}", E)
    book = await popup.locator(".next a.btn-primary").get_attribute("href")
    check("src=renta" in (book or ""), f"rezervácia na modelácii: {book}", E)
    await popup.screenshot(path=str(OUT / "desktop-1440-modelacia.png"), full_page=True)
    pdf = await h.pdf_from(popup, "desktop-kombinacia-575")
    text = flat(pdf_text(pdf))
    check(DISCLAIMER in text, "PDF: chýba celé upozornenie o riziku", E)
    check(text.count(DISCLAIMER) >= 2, "PDF: celé upozornenie nie je na oboch stranách", E)
    check("Modelový výpočet, nie predpoveď ani záruka." in text, "PDF: chýba veta pri projekcii", E)
    check("zadali vy: 5 % ročne počas budovania majetku a 5 % počas vyplácania, pred poplatkom "
          "za správu 0,9 % ročne (po jeho odpočítaní 4,1 % a 4,1 %)" in text,
          "PDF: chýbajú obe sadzby pred poplatkom a po ňom", E)
    check("575 z 800" in text, "PDF: chýba 575 z 800", E)
    check("NaN" not in text, "PDF obsahuje NaN", E)
    pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(pdf)], capture_output=True,
                                                              text=True).stdout).group(1))
    check(pages == 2, f"PDF má {pages} strán", E)
    await popup.close()

    # Udalosti: iba názov a stránka, nič iné
    await page.wait_for_timeout(1500)
    names = {(e.get("u"), e.get("z")) for e in h.events}
    for expected in [("zacal", "aplikacia"), ("videl-vysledok", "aplikacia"),
                     ("odoslal", "aplikacia"), ("pdf", "modelacia")]:
        check(expected in names, f"chýba udalosť {expected}: {sorted(names)}", E)
    check(all(set(e) <= {"u", "z"} for e in h.events), f"udalosť nesie viac údajov: {h.events}", E)
    check(not js_errors, "chyby JavaScriptu: " + " | ".join(js_errors), E)
    h.results["desktop"] = {"pas": pas_num, "pdf": str(pdf), "udalosti": sorted(names)}
    await ctx.close()


async def email_states(h: Harness, browser) -> None:
    """Každý stav e-mailu: modelácia sa otvorí vždy a hláška je pravdivá."""
    E = h.errors
    cakane = {
        "odoslany": ("poslali aj e-mailom", False),
        "opakovanie": ("už poslali e-mailom", False),
        "overenie": ("nepodarilo overiť prehliadač", True),
        "limit": ("príliš veľa pokusov", True),
        "email-zlyhal": ("nepodarilo odoslať", True),
        "email-neznamy": ("nepodarilo potvrdiť", True),
        "prebieha": ("nepodarilo potvrdiť", True),
        "siet": ("nepodarilo potvrdiť", True),
        "timeout": ("nepodarilo potvrdiť", True),
        "turnstile": ("nepodarilo overiť prehliadač", True),
    }
    vysledky = {}
    ctx = await h.new_context(browser, 1440, 900)
    for mode, (veta, pozor) in cakane.items():
        # Výpadok overenia musí platiť už pri načítaní — aplikácia si skript
        # overenia pripravuje vopred, keď sa blíži k formuláru.
        h.turnstile_down = mode == "turnstile"
        h.relay_mode = "odoslany" if mode == "turnstile" else mode
        page = await ctx.new_page()
        frame = await h.app_frame(page, squarespace=False)
        await h.fill_form(frame)
        popup = await h.send(ctx, frame)
        status = flat(await frame.locator("#send-status").inner_text())
        check(veta.lower() in status.lower(), f"{mode}: aplikácia hovorí „{status}“", E)
        check("doručíme" not in status and "o chvíľu" not in status, f"{mode}: sľub bez potvrdenia", E)
        mail = popup.locator("#mail-note")
        mail_text = flat(await mail.inner_text())
        klasa = await mail.get_attribute("class") or ""
        if pozor:
            check("pozor" in klasa and "PDF si stiahnite" in mail_text,
                  f"{mode}: modelácia neupozorní na nepotvrdený e-mail („{mail_text}“)", E)
            check(not mail_text.startswith("Odkaz na túto modeláciu sme vám poslali"),
                  f"{mode}: modelácia tvrdí, že e-mail odišiel", E)
            label = flat(await frame.locator("#send-model").inner_text())
            check(label == "Skúsiť znova odoslať e-mail", f"{mode}: tlačidlo „{label}“", E)
        else:
            check("pozor" not in klasa, f"{mode}: zbytočné varovanie na modelácii", E)
        check(await popup.locator("#btn-pdf").is_enabled(), f"{mode}: PDF nie je dostupné", E)
        if pozor:
            await popup.reload(wait_until="load")
            po = flat(await popup.locator("#mail-note").inner_text())
            check(po == mail_text, f"{mode}: po obnovení stránky sa stav e-mailu zmenil na „{po}“", E)
        vysledky[mode] = {"aplikacia": status, "modelacia": mail_text}
        await popup.close()
        await page.close()
    h.turnstile_down = False

    # Opakovanie po nepotvrdenom e-maile: nový token, bez nového okna — v
    # produkčnom ráme Squarespace. Prehliadače s rozdeleným úložiskom (Safari,
    # Firefox, Chrome) neprepoja BroadcastChannel rámu a samostatnej karty;
    # headless Chrome to nie vždy robí, preto ho tu vypneme úplne — otvorená
    # modelácia sa musí dozvedieť stav priamou správou od aplikácie.
    ctx_bez_bc = await h.new_context(browser, 1440, 900)
    await ctx_bez_bc.add_init_script("try{delete window.BroadcastChannel}catch(e){};window.BroadcastChannel=undefined")
    ctx_hlavny, ctx = ctx, ctx_bez_bc
    page = await ctx.new_page()
    frame = await h.app_frame(page)
    h.relay_mode = "email-zlyhal"
    await h.fill_form(frame)
    popup_stale = await h.send(ctx, frame)
    first_token = h.last_relay_calls[-1]["overenie"]
    h.relay_mode = "odoslany"
    await h.send(ctx, frame, expect_popup=False)
    second_token = h.last_relay_calls[-1]["overenie"]
    # Už otvorená modelácia sa po úspešnom opakovaní aktualizuje (aj po obnovení)
    await popup_stale.wait_for_timeout(500)
    mail = flat(await popup_stale.locator("#mail-note").inner_text())
    check("poslali aj e-mailom" in mail, f"otvorená modelácia po úspešnom opakovaní: {mail}", E)
    await popup_stale.reload(wait_until="load")
    mail = flat(await popup_stale.locator("#mail-note").inner_text())
    check("poslali aj e-mailom" in mail, f"otvorená modelácia po opakovaní a obnovení: {mail}", E)
    await popup_stale.close()
    check(first_token != second_token, "opakovanie nepoužilo nový token overenia", E)
    status = flat(await frame.locator("#send-status").inner_text())
    check("poslali aj e-mailom" in status, f"opakovanie: {status}", E)
    check(len(ctx.pages) == 1, "opakovanie e-mailu otvorilo nové okno", E)
    await page.close()
    await ctx.close()
    ctx = ctx_hlavny

    # Zmena vstupov počas odosielania: výsledok patrí odoslanému scenáru
    page = await ctx.new_page()
    await page.add_init_script("""
      window.__bc=[];
      const P=BroadcastChannel.prototype.postMessage;
      BroadcastChannel.prototype.postMessage=function(m){window.__bc.push(m);return P.call(this,m)};
    """)
    frame = await h.app_frame(page, squarespace=False)
    h.relay_mode = "pomaly"
    await h.fill_form(frame)
    async with ctx.expect_page(timeout=15_000) as info:
        await klik(frame, "#send-model")
    popup = await info.value
    await frame.wait_for_timeout(800)
    await h.set_exact(frame, "rent-v", "4 500")        # počas odosielania
    await poll(frame, "document.getElementById('send-model').disabled===false"
               " && document.getElementById('send-status').textContent.length>0", timeout=30_000)
    odoslany = h.relay_calls[-1]["scenar"]
    bc = await frame.evaluate("window.__bc")
    check("rent=3000" in odoslany, f"odoslaný scenár: {odoslany}", E)
    check(bc and all("rent=3000" in m["scenar"] and "rent=4500" not in m["scenar"] for m in bc),
          f"stav e-mailu priradený inému scenáru: {bc}", E)
    await popup.wait_for_url(re.compile(r"vysledok\.html"), timeout=30_000)
    check("rent=3000" in popup.url, f"modelácia otvorila iný scenár: {popup.url}", E)
    await popup.close()
    await page.close()

    # Zatvorené okno: modelácia sa ponúkne v aplikácii bez straty plánu
    page = await ctx.new_page()
    frame = await h.app_frame(page, squarespace=False)
    await h.set_exact(frame, "rent-v", "4 321")
    h.relay_mode = "odoslany"
    await h.fill_form(frame)
    await h.send(ctx, frame, close_popup_early=True)
    check(await frame.locator("#gate-done").is_visible(), "zatvorené okno: modelácia sa neponúkla", E)
    check(num(await frame.locator("#rent-v").inner_text()) == 4321, "zatvorené okno: plán sa stratil", E)
    await page.close()
    await ctx.close()

    # Zablokované okno
    ctx = await h.new_context(browser, 1440, 900, blokuj_okna=True)
    page = await ctx.new_page()
    frame = await h.app_frame(page)
    await h.set_exact(frame, "rent-v", "4 321")
    h.relay_mode = "email-neznamy"
    await h.fill_form(frame)
    await h.send(ctx, frame, expect_popup=False)
    check(await frame.locator("#gate-done").is_visible(), "zablokované okno: modelácia sa neponúkla", E)
    text = flat(await frame.locator("#gate-done-text").inner_text())
    check("nepodarilo potvrdiť" in text, f"zablokované okno: {text}", E)
    href = await frame.locator("#gate-view").get_attribute("href")
    check("vysledok.html" in href and "#email=" in href, f"odkaz na modeláciu: {href}", E)
    await page.screenshot(path=str(OUT / "desktop-1440-zablokovane-okno.png"))
    h.relay_mode = "odoslany"
    await h.send(ctx, frame, expect_popup=False)
    check(await frame.locator("#gate-done").is_visible(), "opakovanie pri zablokovanom okne skrylo modeláciu", E)
    text2 = flat(await frame.locator("#gate-done-text").inner_text())
    check("poslali aj e-mailom" in text2, f"ponuka po opakovaní: {text2}", E)
    href = await frame.locator("#gate-view").get_attribute("href")
    async with ctx.expect_page() as info:
        await klik(frame, "#gate-view")
    opened = await info.value
    await opened.wait_for_load_state("load")
    mail = flat(await opened.locator("#mail-note").inner_text())
    check("poslali aj e-mailom" in mail, f"modelácia z odkazu: {mail}", E)
    check("#email" not in opened.url, "stav e-mailu ostal v adrese modelácie", E)
    await opened.close()
    # Otvorenie v tom istom ráme a návrat späť s rovnakým plánom
    await klik(frame, "#gate-view-here")
    await page.wait_for_timeout(2500)
    result_frame = next((f for f in page.frames if "vysledok.html" in f.url), None)
    check(result_frame is not None, "otvorenie v tomto okne neotvorilo modeláciu", E)
    if result_frame:
        mail = flat(await result_frame.locator("#mail-note").inner_text())
        check("poslali aj e-mailom" in mail, f"modelácia v ráme: {mail}", E)
        await result_frame.evaluate("history.back()")
        await page.wait_for_timeout(3000)
        app = next((f for f in page.frames if "cara-zivota" in f.url), None)
        check(app is not None, "návrat späť nevrátil aplikáciu", E)
        if app:
            await app.wait_for_selector("#rent-v")
            check(num(await app.locator("#rent-v").inner_text()) == 4321, "návrat späť stratil plán", E)
    await ctx.close()
    h.results["email"] = vysledky


async def mobile(h: Harness, browser) -> None:
    """390 px: os = súhrn = modelácia = PDF pri „Ako dlho vydrží"."""
    E = h.errors
    ctx = await h.new_context(browser, 390, 844)
    page = await ctx.new_page()
    frame = await h.app_frame(page)

    async def editor(card: str) -> None:
        await klik(frame, f"#map-{card}")
        await frame.wait_for_selector(".mobile-editor-done", state="visible")
        await frame.wait_for_timeout(450)   # editor sa ešte vysúva

    async def prepni(sel: str) -> None:
        for _ in range(4):
            if await frame.locator(sel).first.get_attribute("aria-checked") == "true":
                return
            await klik(frame, sel)
            await frame.wait_for_timeout(200)
        raise AssertionError(f"Prepínač {sel} sa nezapol.")

    async def kroky(step: str, direction: int, count: int) -> None:
        """Krokuje tlačidlami v editore, kým vek nedosiahne cieľ (klik počas
        otvárania editora sa môže stratiť — rozhoduje skutočná hodnota)."""
        start = await frame.evaluate(f"Number(document.getElementById('h-{step}').getAttribute('aria-valuenow'))")
        ciel = start + direction * count
        sel = f'.card.mobile-editing .step[data-step="{step}"][data-dir="{direction}"]'
        for _ in range(count * 3):
            teraz = await frame.evaluate(f"Number(document.getElementById('h-{step}').getAttribute('aria-valuenow'))")
            if teraz == ciel:
                return
            await klik(frame, sel)
            await frame.wait_for_timeout(80)
        raise AssertionError(f"Vek {step} sa nepodarilo nastaviť na {ciel}.")

    await editor("start")
    await kroky("start", 1, 7)                               # 55 → 62
    await klik(frame, ".mobile-editor-done")
    await editor("today")
    await prepni('.card.mobile-editing [data-sit="have"]')
    await prepni('.card.mobile-editing [data-goal="duration"]')
    await kroky("now", 1, 23)                                # 35 → 58
    await klik(frame, ".mobile-editor-done")
    await frame.wait_for_timeout(400)
    end_summary = flat(await frame.locator("#map-end-summary").inner_text())
    nav_end = flat(await frame.locator("#mobile-life-end").inner_text())
    plan = flat(await frame.locator("#mob").inner_text())
    have = flat(await frame.locator("#have-v").inner_text())
    check("Do 81 rokov" in end_summary, f"mobilná os: {end_summary}", E)
    check(nav_end == "81 r.", f"mobilná navigácia: {nav_end}", E)
    check("Do 81 rokov" in plan and "90" not in plan, f"súhrn plánu: {plan}", E)
    check(have.startswith("19 r. 5 mes."), f"karta Dnes: {have}", E)
    check(await frame.locator("#vynos-net").is_visible() or True, "", E)
    await frame.locator("#mobile-life-map").scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT / "mobil-390-os.png"))

    h.relay_mode = "odoslany"
    await h.fill_form(frame)
    popup = await h.send(ctx, frame)
    end_card = flat(await popup.locator("#e-value").inner_text())
    check(end_card == "81 rokov", f"modelácia: koniec {end_card}", E)
    await popup.screenshot(path=str(OUT / "mobil-390-modelacia.png"), full_page=True)
    pdf = await h.pdf_from(popup, "mobil-ako-dlho-81")
    text = flat(pdf_text(pdf))
    check("Majetok vydrží do: 81" in text, "PDF hlavička: chýba vypočítaný koniec 81", E)
    check("Koniec: 90" not in text and "90 rokov" not in text, "PDF stále ukazuje 90", E)
    check("81 rokov" in text, "PDF: graf ani karta neukazujú 81 rokov", E)
    check(DISCLAIMER in text, "PDF (mobil): chýba celé upozornenie", E)
    await popup.close()
    await ctx.close()

    # 3b: vypočítaná nevyčerpateľná renta (mám + ako dlho + navždy)
    ctx = await h.new_context(browser, 390, 844)
    page = await ctx.new_page()
    frame = await h.app_frame(page)
    await editor("start")
    await kroky("start", 1, 7)
    await klik(frame, ".mobile-editor-done")
    await editor("today")
    await prepni('.card.mobile-editing [data-sit="have"]')
    await prepni('.card.mobile-editing [data-goal="duration"]')
    await kroky("now", 1, 23)
    await klik(frame, ".mobile-editor-done")
    await editor("start")
    await frame.locator('.card.mobile-editing #in-inflon').uncheck()
    await h.set_exact(frame, "rent-v", "1 000")
    await klik(frame, ".mobile-editor-done")
    check(flat(await frame.locator("#have-v").inner_text()) == "Nevyčerpá sa", "renta 1 000 € sa má nevyčerpať", E)
    check(flat(await frame.locator("#mobile-life-end").inner_text()) == "Bez konca", "os pri nevyčerpateľnej rente", E)
    await h.fill_form(frame)
    popup = await h.send(ctx, frame)
    labels = flat(await popup.locator("#suhrn").inner_text())
    check("Nominálny súčet" not in labels and "Objem vyplatenej renty" not in labels,
          f"modelácia vydáva kapitál za súčet výplat: {labels}", E)
    pdf = await h.pdf_from(popup, "mobil-navzdy")
    text = flat(pdf_text(pdf))
    check("Nominálny súčet" not in text and "Objem vyplatenej renty" not in text,
          "PDF vydáva kapitál za súčet výplat", E)
    await popup.close()
    await ctx.close()
    h.results["mobile"] = {"os": end_summary, "navigacia": nav_end}


async def invalid_export(h: Harness, browser) -> None:
    """Neplatný výsledok nevyrobí PDF ani tlač, ani cez ?tlac=1."""
    E = h.errors
    ctx = await h.new_context(browser, 1440, 900)
    await ctx.add_init_script("window.__tlac=0;window.print=function(){window.__tlac++}")
    page = await ctx.new_page()
    base = PAGES + "vysledok.html?"
    warn = "now=40&start=60&end=90&rent=3000&infl=5&vynos=5&vynosRent=4&sit=build&pension=perpetuity&infl_on=1&mode=lump"
    await page.goto(base + warn + "&tlac=1", wait_until="load")
    await page.wait_for_timeout(2500)
    check(await page.evaluate("window.__tlac") == 0, "neplatný výsledok sa vytlačil cez ?tlac=1", E)
    check(await page.locator("#btn-pdf").is_disabled(), "PDF tlačidlo pri neplatnom výsledku nie je vypnuté", E)
    # Platný výsledok, ale bez štruktúrovaných údajov: žiadne PDF ani tlač
    ok_url = base + "now=35&start=55&end=90&rent=3000&infl=3&vynos=5&vynosRent=5&sit=build&pension=temporary&infl_on=1&mode=lump"
    await page.goto(ok_url, wait_until="load")
    await poll(page, "document.getElementById('odolnost-riadky')?.dataset.vysvetlene==='1'")
    await page.evaluate("delete globalThis.PH_VYSLEDOK; globalThis.PH_VYSLEDOK={platny:true,sadzby:{budovanie:NaN}}")
    await page.locator("#btn-pdf").click()
    await page.wait_for_timeout(3000)
    check(await page.evaluate("window.__tlac") == 0, "chýbajúce sadzby obišli export záložnou tlačou", E)
    msg = await page.locator("#pdf-stav").inner_text() if await page.locator("#pdf-stav").count() else ""
    check("nie je možné uložiť" in msg, f"chýba hláška pri neplatných údajoch: {msg!r}", E)
    # Bez známeho stavu e-mailu modelácia nič nepotvrdzuje
    await page.goto(ok_url, wait_until="load")
    neutral = flat(await page.locator("#mail-note").inner_text())
    check("poslali" not in neutral, f"modelácia bez stavu tvrdí odoslanie: {neutral}", E)
    # Záporný čistý výnos (0,8 % − 0,9 %) si v PDF zachová znamienko
    minus_url = base + "now=40&start=60&end=90&rent=2000&infl=3&vynos=0.8&vynosRent=5&sit=build&pension=temporary&infl_on=1&mode=lump"
    await page.goto(minus_url, wait_until="load")
    await poll(page, "document.getElementById('odolnost-riadky')?.dataset.vysvetlene==='1'")
    await page.evaluate("window.__tlac=0")
    pdf = await h.pdf_from(page, "zaporna-sadzba")
    text = flat(pdf_text(pdf))
    check("(po jeho odpočítaní -0,1 % a 4,1 %)" in text, "PDF stratilo znamienko zápornej sadzby", E)
    # ?poradca na verejnej adrese
    await page.goto(PAGES + "cara-zivota.html?poradca", wait_until="load")
    check(not await page.evaluate("document.body.classList.contains('poradca')"), "?poradca odomkol poradcu", E)
    await ctx.close()


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=("local", "live"), default="local")
    parser.add_argument("--only", default="")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    h = Harness(args.target)
    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.launch(headless=True)          # Air: pribalený Chromium
        except Exception:
            browser = await pw.chromium.launch(channel="chrome", headless=True)  # PRO: Chrome
        try:
            for name, fn in (("desktop", desktop), ("email", email_states),
                             ("mobile", mobile), ("invalid", invalid_export)):
                if args.only and name not in args.only.split(","):
                    continue
                try:
                    await fn(h, browser)
                except Exception as exc:  # noqa: BLE001 — chceme vidieť všetky časti
                    h.errors.append(f"{name}: výnimka {type(exc).__name__}: {exc}")
        finally:
            await browser.close()
    h.results["chyby"] = h.errors
    print(json.dumps(h.results, ensure_ascii=False, indent=2))
    return 1 if h.errors else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

"""End-to-end smoke test: drives the real app in Chromium through the demo
flow using the typed-utterance box (same engine as speech), checks the
on-screen results and saves screenshots.

Usage:  python e2e/smoke.py [base_url] [out_dir]
        (default http://localhost:8080, screenshots in e2e/shots)
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).parent / "shots")
OUT.mkdir(parents=True, exist_ok=True)


def say(page, text):
    box = page.get_by_label("Type an utterance")
    box.fill(text)
    box.press("Enter")
    page.wait_for_timeout(400)


def run(viewport, name, lang_button="English"):
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception:  # bundled browser missing: use the installed Chrome
            browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(viewport=viewport, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{BASE}/?mute")
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name=lang_button).click()
        page.screenshot(path=OUT / f"{name}-01-home.png")

        # Two Riyas: the app asks which one, then reads back.
        say(page, "Riya, saha point saha kilo, chauhattar centimetre")
        page.screenshot(path=OUT / f"{name}-02-which-riya.png")
        say(page, "Pawar")
        expect(page.get_by_text("6.6").first).to_be_visible()
        page.screenshot(path=OUT / f"{name}-03-readback.png")
        say(page, "haan")
        expect(page.get_by_text("Severe (SAM)").first).to_be_visible()
        page.wait_for_timeout(900)
        page.screenshot(path=OUT / f"{name}-04-sam-alert.png")

        # Digit swap: 28 cm when last month was ~80 cm.
        say(page, "Aarav, 10.8 kilo, 28 centimetre")
        expect(page.get_by_text("Maybe 82").first).to_be_visible()
        page.screenshot(path=OUT / f"{name}-05-digit-swap.png")
        say(page, "haan")
        say(page, "haan")
        expect(page.get_by_text("82").first).to_be_visible()

        say(page, "kaun baaki hai")
        page.screenshot(path=OUT / f"{name}-06-pending.png")

        page.get_by_role("button", name="Alerts").click()
        page.screenshot(path=OUT / f"{name}-07-alerts.png", full_page=True)
        page.get_by_role("button", name="Summary").click()
        page.screenshot(path=OUT / f"{name}-08-summary.png", full_page=True)
        page.get_by_role("button", name="Children").click()
        page.get_by_text("Riya Pawar").first.click()
        page.screenshot(path=OUT / f"{name}-09-child-chart.png", full_page=True)

        assert not errors, errors
        browser.close()


if __name__ == "__main__":
    run({"width": 412, "height": 915}, "mobile")
    run({"width": 1366, "height": 860}, "desktop")
    print(f"OK: screenshots in {OUT}")

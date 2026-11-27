"""Render docs/deck/deck.html to docs/PoshanVaani-pitch-deck.pdf (and slide PNGs for review)."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

here = Path(__file__).resolve().parent
out_pdf = here.parent / "PoshanVaani-pitch-deck.pdf"
with sync_playwright() as p:
    try:
        b = p.chromium.launch()
    except Exception:
        b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.goto((here / "deck.html").as_uri())
    pg.wait_for_load_state("networkidle")
    pg.evaluate("document.fonts.ready")
    pg.pdf(path=str(out_pdf), width="1280px", height="720px", print_background=True)
    if "--png" in sys.argv:
        shots = here / "preview"
        shots.mkdir(exist_ok=True)
        for i, s in enumerate(pg.query_selector_all(".slide"), 1):
            s.screenshot(path=str(shots / f"slide-{i:02d}.png"))
    b.close()
print(out_pdf)

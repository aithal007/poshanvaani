"""Build the paper-style TikZ figures (needs pdflatex + pdftocairo, e.g. MiKTeX/TeX Live + Poppler).

Compiles docs/figures/fig*.tex and writes vector SVGs to docs/deck/fig/ for the pitch deck.
Usage: python docs/figures/build.py
"""
import subprocess
from pathlib import Path

here = Path(__file__).resolve().parent
out = here.parent / "deck" / "fig"
out.mkdir(parents=True, exist_ok=True)

for tex in sorted(here.glob("fig*.tex")):
    subprocess.run(
        ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", tex.name],
        cwd=here, check=True, capture_output=True,
    )
    pdf = tex.with_suffix(".pdf")
    svg = out / (tex.stem + ".svg")
    subprocess.run(["pdftocairo", "-svg", str(pdf), str(svg)], check=True)
    print("built", svg.relative_to(here.parent.parent))

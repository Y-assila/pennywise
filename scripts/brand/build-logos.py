"""Builds the Pennywise logo files from one master drawing.

Usage: python3 scripts/brand/build-logos.py   (needs: pip install fonttools brotli)
Writes icon.svg, favicon.svg and docs/brand/*.svg. Run scripts/brand/render-pngs.js afterwards for the PNG icons.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "docs" / "brand"
BRAND.mkdir(parents=True, exist_ok=True)

TEAL, DEEP, SAFFRON, SAFFRON_DARK, INK, PAPER, WHITE = "#167d72", "#0f5f56", "#f3b13f", "#d8932a", "#17211f", "#f7f7f3", "#ffffff"

# Master geometry on a 512 grid. The pocket is a jeans back pocket; the coin drops into it.
COIN = dict(cx=256, cy=178, r=74)
POCKET = "M132 214h248v122c0 8-4 15-11 19l-102 58a24 24 0 0 1-22 0l-102-58c-7-4-11-11-11-19z"
STITCH = "M164 250v80l92 52 92-52v-80"


def mark(detail=True, pocket=WHITE, coin=SAFFRON, ring=SAFFRON_DARK, stitch=TEAL):
    """The pocket and coin, without a background."""
    parts = [f'<circle cx="{COIN["cx"]}" cy="{COIN["cy"]}" r="{COIN["r"]}" fill="{coin}"/>']
    if detail:
        parts.append(f'<circle cx="{COIN["cx"]}" cy="{COIN["cy"]}" r="44" fill="none" stroke="{ring}" stroke-width="12"/>')
    parts.append(f'<path d="{POCKET}" fill="{pocket}"/>')
    if detail:
        parts.append(f'<path d="{STITCH}" fill="none" stroke="{stitch}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 22"/>')
    return "".join(parts)


def tile(detail=True, rounded=True):
    bg = f'<rect width="512" height="512" rx="116" fill="{TEAL}"/>' if rounded else f'<rect width="512" height="512" fill="{TEAL}"/>'
    return bg + mark(detail)


def svg(body, view="0 0 512 512", title="Pennywise"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'


def mono(color):
    """One colour on a transparent background: a gap keeps the coin and the pocket apart."""
    return (f'<defs><mask id="gap"><rect width="512" height="512" fill="#fff"/><circle cx="{COIN["cx"]}" cy="{COIN["cy"]}" r="44" fill="none" stroke="#000" stroke-width="14"/><path d="{POCKET}" fill="#000" stroke="#000" stroke-width="28" stroke-linejoin="round"/></mask></defs>'
            f'<circle cx="{COIN["cx"]}" cy="{COIN["cy"]}" r="{COIN["r"]}" fill="{color}" mask="url(#gap)"/><path d="{POCKET}" fill="{color}"/>')


def wordmark(text="pennywise", size=200, tracking=-0.035):
    """Outlines the wordmark in Inter ExtraBold. Returns (path data, width, cap height)."""
    font = TTFont(ROOT / "fonts" / "inter-ExtraBold.woff2")
    glyphs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
    scale, x, out = size / upm, 0.0, []
    ascent = font["OS/2"].sTypoAscender * scale
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, ascent)))
        out.append(pen.getCommands())
        x += glyphs[name].width * scale + tracking * size
    x -= tracking * size
    x_height = font["OS/2"].sxHeight * scale
    descent = -font["OS/2"].sTypoDescender * scale
    return " ".join(out), x, ascent, x_height, descent


def lockup(ink, mark_body):
    """Mark on the left, wordmark aligned to the mark's optical centre."""
    words, width, ascent, x_height, descent = wordmark()
    gap, mark_size = 56, 260
    baseline_y = mark_size / 2 + x_height / 2  # centre the x-height on the mark
    total_h = max(mark_size, baseline_y + descent)
    body = (f'<svg x="0" y="0" width="{mark_size}" height="{mark_size}" viewBox="0 0 512 512">{mark_body}</svg>'
            f'<path transform="translate({mark_size + gap} {baseline_y - ascent:.2f})" d="{words}" fill="{ink}"/>')
    return svg(body, f"0 0 {mark_size + gap + width:.0f} {total_h:.0f}")


files = {
    ROOT / "icon.svg": svg(tile()),
    ROOT / "favicon.svg": svg(tile(detail=False)),  # no stitching or ring: they blur below 32 px
    BRAND / "pennywise-mark.svg": svg(tile()),
    BRAND / "pennywise-mark-square.svg": svg(tile(rounded=False)),  # for platforms that round corners themselves
    BRAND / "pennywise-glyph.svg": svg(mark(), "116 88 280 344"),  # pocket and coin without the tile, for teal backgrounds
    BRAND / "pennywise-mark-mono-teal.svg": svg(mono(TEAL)),
    BRAND / "pennywise-mark-mono-white.svg": svg(mono(WHITE)),
    BRAND / "pennywise-lockup.svg": lockup(INK, tile()),
    BRAND / "pennywise-lockup-dark.svg": lockup(WHITE, tile()),
}
for path, content in files.items():
    path.write_text(content, encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({len(content.encode()) // 1024 or 1} KB)")

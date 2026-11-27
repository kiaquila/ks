"""Outline the measured KS wordmark using its original font files."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform
import json, math, hashlib, subprocess, tempfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
METRICS = json.loads((ROOT / 'reference-metrics.json').read_text())
LETTERING = json.loads((ROOT / 'lettering-metrics.json').read_text())
LABEL = LETTERING['label']
WIDTH = math.ceil(118 + LETTERING['after']['box']['width'] - LETTERING['before']['box']['width'])
TAIL_SHIFT = LETTERING['after']['dot']['x'] - LETTERING['before']['dot']['x']
FONTS = REPO / 'website/assets/fonts'

def number(n):
    return f'{n:.10f}'.rstrip('0').rstrip('.') or '0'

def path_and_bounds(gs, glyph, matrix):
    pen = SVGPathPen(gs, ntos=number)
    gs[glyph].draw(TransformPen(pen, matrix))
    bounds = BoundsPen(gs)
    gs[glyph].draw(TransformPen(bounds, matrix))
    return pen.getCommands(), bounds.bounds

caps_font = TTFont(FONTS / 'manrope-latin.woff2')
# Draw the variable font directly. Saving a static TTF would round outlines.
caps_set = caps_font.getGlyphSet(location={'wght': 700})
hand_font = TTFont(FONTS / 'caveat-latin.woff2')
hand_set = hand_font.getGlyphSet()
base_x = METRICS['reference']['x']
base_y = METRICS['baseline']['y']
caps_size = float(METRICS['style']['fontSize'].removesuffix('px'))
hand_size = float(METRICS['art']['style']['fontSize'].removesuffix('px'))
caps_scale = caps_size / caps_font['head'].unitsPerEm
hand_scale = hand_size / hand_font['head'].unitsPerEm
caps_paths, bounds = [], []
for item in LETTERING['after']['caps']:
    if item['char'].isspace():
        continue
    glyph = caps_font.getBestCmap()[ord(item['char'])]
    x = item['box']['x'] - LETTERING['after']['box']['x']
    d, b = path_and_bounds(caps_set, glyph, Transform(caps_scale, 0, 0, -caps_scale, x, 0))
    caps_paths.append(d)
    bounds.append(b)

with tempfile.TemporaryDirectory(prefix='ks-wordmark-') as tmp:
    hand_font.flavor = None
    font_file = Path(tmp) / 'caveat.ttf'
    hand_font.save(font_file)
    shaped = json.loads(subprocess.check_output(['hb-shape', str(font_file), 'art', '--output-format=json'], text=True))

art = METRICS['art']
layout = art['untransformedBox']
# Chrome paints the transformed text run slightly right of its DOM box.
# Freeze the measured optical position; do not reapply this per project.
art_paint_offset = 0.4
art_x = layout['x'] - base_x + art_paint_offset + TAIL_SHIFT
art_y = layout['y'] - base_y
baseline_local = art['baseline']['y'] - layout['y']
angle = math.radians(-5)
cos, sin = math.cos(angle), math.sin(angle)
# CSS: translate(layout) rotate(-5deg) translateY(.02em), then the local baseline.
outer = Transform(1, 0, 0, 1, art_x, art_y).transform(Transform(cos, sin, -sin, cos, 0, 0)).translate(0, .02 * hand_size + baseline_local)
art_paths, shaping = [], []
pen_x, pen_y = 0, 0
for item in shaped:
    glyph = hand_font.getGlyphName(int(item['g'][3:])) if item['g'].startswith('gid') else item['g']
    matrix = outer.translate((pen_x + item['dx']) * hand_scale, -(pen_y + item['dy']) * hand_scale).scale(hand_scale, -hand_scale)
    d, b = path_and_bounds(hand_set, glyph, matrix)
    art_paths.append(d)
    bounds.append(b)
    shaping.append({'glyph': glyph, 'glyph_id': hand_font.getGlyphID(glyph), 'cluster': item['cl'], 'advance': item['ax']})
    pen_x += item['ax']
    pen_y += item['ay']

dot = METRICS['dot']['box']
radius = dot['width'] / 2
cx = dot['x'] - base_x + radius + TAIL_SHIFT
cy = dot['y'] - base_y + dot['height'] / 2
bounds.append((cx-radius, cy-radius, cx+radius, cy+radius))
ink_bounds = [min(b[0] for b in bounds), min(b[1] for b in bounds), max(b[2] for b in bounds), max(b[3] for b in bounds)]
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="20" viewBox="0 -17 {WIDTH} 20" role="img" aria-labelledby="ks-logo-title">
  <title id="ks-logo-title">{LABEL}</title>
  <defs>
    <linearGradient id="ks-brand-dot" x1="0" y1="0" x2="1" y2="1" color-interpolation="sRGB">
      <stop offset="0" stop-color="#818cf8"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <g id="ks-logo-ink" fill="#0b0b0c">
    <path id="ks-logo-caps" d="{''.join(caps_paths)}"/>
    <path id="ks-logo-art" d="{''.join(art_paths)}"/>
  </g>
  <circle cx="{number(cx)}" cy="{number(cy)}" r="{number(radius)}" fill="url(#ks-brand-dot)"/>
</svg>
'''
assert ink_bounds[0] > 0 and ink_bounds[1] > -17 and ink_bounds[2] < WIDTH and ink_bounds[3] < 3, ink_bounds
(ROOT / 'ks-design-art-master.svg').write_text(svg)
provenance = {
    'reference_url': METRICS['sourceUrl'],
    'lettering': LABEL,
    'approved_change': LETTERING['change'],
    'tail_shift_css_px': TAIL_SHIFT,
    'reference_git_commit': 'd06ad17679b22743154443e7ae511aa7fe578ecd',
    'font_files': {name: hashlib.sha256((FONTS/name).read_bytes()).hexdigest() for name in ['manrope-latin.woff2', 'caveat-latin.woff2']},
    'font_sizes_css_px': {'caps': caps_size, 'art': hand_size},
    'weights': {'Manrope': 700, 'Caveat': 600},
    'art_shaping': shaping,
    'art_paint_offset_css_px': art_paint_offset,
    'ink_bounds_css_px': ink_bounds,
    'view_box': [0, -17, WIDTH, 20],
    'native_size_css_px': [WIDTH, 20],
    'path_coordinate_decimal_places': 10,
    'dot_diameter_css_px': dot['width'],
    'fonttools_version': __import__('fontTools').__version__,
    'harfbuzz_version': subprocess.check_output(['hb-shape', '--version'], text=True).splitlines()[0],
}
(ROOT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print(json.dumps(provenance, indent=2))

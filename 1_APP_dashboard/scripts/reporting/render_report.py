#!/usr/bin/env python3
"""Offline VORTEX Studio: verified report JSON -> 3-slide 4K PNG, PDF, PPTX.

No live FPL fetches or AI claims. Usage:
 python scripts/reporting/render_report.py --json data.json --out reports/gw8
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.util import Inches

WIDTH, HEIGHT = 3840, 2160
BG = (8, 13, 22)
PANEL = (21, 31, 45)
WHITE = (242, 246, 250)
MUTED = (148, 165, 182)
GOLD = (216, 174, 76)
GREEN = (147, 215, 91)
ROOT = Path(__file__).resolve().parent
FONT_FILE = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
FONT_BOLD = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_FILE
    if not path.exists():
        raise RuntimeError(f'Missing system font {path}. Install DejaVu Sans; do not embed font files.')
    return ImageFont.truetype(str(path), size)


def draw_text(canvas: ImageDraw.ImageDraw, text: Any, x: int, y: int, size: int = 64,
              color: tuple[int, int, int] = WHITE, bold: bool = False, limit: int = 46) -> None:
    raw = str(text if text is not None else '—').replace('\n', ' ').strip()
    shortened = raw if len(raw) <= limit else raw[:max(0, limit-1)].rstrip() + '…'
    canvas.text((x, y), shortened, font=font(size, bold), fill=color, stroke_width=0)


def base_slide(section: str, gw: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new('RGB', (WIDTH, HEIGHT), BG)
    painter = ImageDraw.Draw(image)
    painter.rounded_rectangle((155, 145, 3685, 2018), radius=68, outline=(43, 57, 69), width=3)
    painter.rounded_rectangle((155, 145, 177, 280), radius=10, fill=GOLD)
    draw_text(painter, 'FPL VORTEX', 235, 168, 66, GOLD, bold=True)
    draw_text(painter, section.upper(), 2860, 171, 49, MUTED, limit=25)
    painter.line((230, 1890, 3580, 1890), fill=GOLD, width=4)
    draw_text(painter, f'SEASON 2026/27  •  GW{gw}  •  OFFICIAL FPL OBSERVATIONS', 230, 1936, 36, MUTED, limit=90)
    return image, painter


def cover(data: dict[str, Any]) -> Image.Image:
    image, draw = base_slide('matchday review', data['gameweek'])
    draw_text(draw, f'GAMEWEEK {data["gameweek"]}', 230, 500, 181, WHITE, bold=True)
    draw_text(draw, data.get('teamName') or 'FPL TEAM', 240, 758, 82, MUTED, limit=47)
    cards = [ ('GW POINTS', data.get('actualPoints'), GOLD), ('OVERALL RANK', data.get('overallRank'), WHITE), ('BENCH POINTS', data.get('benchPoints'), GREEN) ]
    for index, (label, number, accent) in enumerate(cards):
        left = 230 + index * 1116
        draw.rounded_rectangle((left, 1015, left+1062, 1545), radius=38, fill=PANEL)
        draw_text(draw, label, left+70, 1090, 48, MUTED)
        display = f'{number:,}' if isinstance(number, int) else '—'
        draw_text(draw, display, left+65, 1240, 126, accent, bold=True, limit=12)
    draw_text(draw, 'CAPTAIN  ' + str(data.get('captainName') or 'Unavailable'), 240, 1680, 66, WHITE, limit=52)
    return image


def players_page(data: dict[str, Any]) -> Image.Image:
    image, draw = base_slide('player performance', data['gameweek'])
    draw_text(draw, 'SQUAD PERFORMANCE', 230, 364, 127, WHITE, bold=True)
    draw_text(draw, 'Observed minutes, appearances and earned FPL points', 240, 555, 47, MUTED)
    positions = [(270, 'PLAYER'), (1600, 'ROLE'), (2320, 'MIN'), (2910, 'PTS')]
    for x, header in positions: draw_text(draw, header, x, 720, 38, GOLD, bold=True)
    rows = sorted(data.get('rows') or [], key=lambda row: row.get('effectivePoints') if isinstance(row.get('effectivePoints'), int) else -999, reverse=True)[:9]
    for index, row in enumerate(rows):
        y = 818 + index * 113
        if index % 2 == 0: draw.rounded_rectangle((240, y-13, 3555, y+95), radius=12, fill=PANEL)
        draw_text(draw, row.get('player'), 270, y+5, 43, WHITE, limit=36)
        draw_text(draw, row.get('role'), 1600, y+5, 42, MUTED, limit=19)
        draw_text(draw, row.get('minutes'), 2320, y+5, 44, WHITE)
        draw_text(draw, row.get('effectivePoints'), 2910, y+5, 48, GREEN, bold=True)
    return image


def verdict_page(data: dict[str, Any]) -> Image.Image:
    image, draw = base_slide('decision audit', data['gameweek'])
    draw_text(draw, 'MATCHDAY DECISION AUDIT', 230, 405, 121, WHITE, bold=True)
    decision = [('CAPTAIN', data.get('captainName') or 'Not available'), ('TRANSFER HITS', f'{data.get("hitCost", 0)} pts'),
                ('TEAM TOTAL', data.get('totalPoints')), ('LIVE SOURCE', 'Official Fantasy Premier League')]
    for index, (label, value) in enumerate(decision):
        x = 245 + (index % 2) * 1670
        y = 770 + (index // 2) * 475
        draw.rounded_rectangle((x, y, x+1570, y+386), radius=30, fill=PANEL)
        draw_text(draw, label, x+65, y+55, 49, GOLD, bold=True)
        draw_text(draw, value, x+65, y+165, 77 if index != 3 else 58, WHITE, bold=index != 3, limit=28)
    draw_text(draw, 'No retrospective xPts claims: a frozen pre-deadline snapshot is required.', 245, 1772, 40, MUTED, limit=96)
    return image


def validate(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get('schema') != 'vortex-report-v1':
        raise ValueError('Expected vortex-report-v1 data contract.')
    gw = data.get('gameweek')
    if not isinstance(gw, int) or not 1 <= gw <= 38 or not isinstance(data.get('rows'), list) or len(data['rows']) > 15:
        raise ValueError('Invalid gameweek or report rows.')
    return data


def render(data: dict[str, Any], output: Path) -> dict[str, Path]:
    output.mkdir(parents=True, exist_ok=True)
    slides = [cover(data), players_page(data), verdict_page(data)]
    pngs: list[Path] = []
    for index, item in enumerate(slides, 1):
        destination = output / f'vortex_gw{data["gameweek"]}_{index:02}.png'
        item.save(destination, format='PNG', optimize=True)
        pngs.append(destination)
    deck = Presentation()
    deck.slide_width = Inches(16)
    deck.slide_height = Inches(9)
    for photo in pngs:
        slide = deck.slides.add_slide(deck.slide_layouts[6])
        slide.shapes.add_picture(str(photo), 0, 0, width=deck.slide_width, height=deck.slide_height)
    pptx_file = output / f'vortex_gw{data["gameweek"]}.pptx'
    deck.save(pptx_file)
    pdf_file = output / f'vortex_gw{data["gameweek"]}.pdf'
    slides[0].save(pdf_file, 'PDF', save_all=True, append_images=slides[1:], resolution=220)
    return { 'pptx': pptx_file, 'pdf': pdf_file, 'cover': pngs[0] }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', required=True, type=Path, help='Output of /api/reports/<manager>/<gw>')
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    data = validate(json.loads(args.json.read_text(encoding='utf8')))
    for label, path in render(data, args.out).items():
        print(f'{label}: {path}')

if __name__ == '__main__':
    main()
